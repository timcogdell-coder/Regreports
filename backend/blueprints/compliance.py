import calendar
from datetime import date, timedelta
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import db, Violation, Company, Permit, PermitLimit, Sample, SampleResult, EnforcementHistory
from engines.compliance_engine import check_compliance
from engines.erg_engine import generate_enforcement_response
from utils.decorators import roles_required
from sqlalchemy import func

compliance_bp = Blueprint("compliance", __name__)


def _parse_interval(frequency_code: str):
    """'1/7' → 7.0 days between required samples. Returns None if unparseable."""
    try:
        n, d = frequency_code.split("/")
        return float(d) / float(n)
    except Exception:
        return None


@compliance_bp.route("/schedule", methods=["GET"])
@login_required
def sampling_schedule():
    company_id = request.args.get("company_id", type=int)
    if current_user.role == "iu":
        company_id = current_user.company_id

    today = date.today()

    permit_query = Permit.query.filter_by(is_active=True)
    if company_id:
        permit_query = permit_query.filter_by(company_id=company_id)
    permits = permit_query.all()

    rows = []
    for permit in permits:
        company = Company.query.get(permit.company_id)
        for limit in permit.limits:
            # Flow limits are tracked via monthly flow reports, not sample submissions
            if limit.is_flow_limit or limit.is_monitor_report:
                continue
            if not limit.frequency_id or not limit.frequency:
                continue
            interval_days = _parse_interval(limit.frequency.frequency_code)
            if not interval_days:
                continue

            # Most recent sample date for this parameter on this permit
            last_date = (
                db.session.query(func.max(Sample.sample_date))
                .join(SampleResult, SampleResult.sample_id == Sample.id)
                .filter(
                    Sample.company_id == permit.company_id,
                    Sample.permit_id  == permit.id,
                    SampleResult.permit_limit_id == limit.id,
                )
                .scalar()
            )

            if last_date is None:
                status      = "never"
                next_due    = None
                days_offset = None
            else:
                # Submittal deadline = end of the next required period + 15 days.
                # The period is always a whole calendar month regardless of whether
                # frequency is weekly, bi-weekly, monthly, quarterly, etc.
                # (Weekly samples are collected throughout the month and submitted
                # as a batch — the submittal deadline is the same as monthly.)
                #
                # Examples:
                #   Weekly BOD, last sample Apr 29  → next period May → due Jun 16*
                #   Monthly BOD, last sample Apr 7  → next period May → due Jun 15
                #   Quarterly,   last sample Apr 7  → next period Jul → due Aug 17*
                #   (* weekend roll-forward applied)
                months_interval    = max(1, round(interval_days / 30))
                raw_next_month     = last_date.month + months_interval
                next_year          = last_date.year + (raw_next_month - 1) // 12
                next_month         = ((raw_next_month - 1) % 12) + 1
                next_last_day      = calendar.monthrange(next_year, next_month)[1]
                end_of_next_period = date(next_year, next_month, next_last_day)
                next_due           = end_of_next_period + timedelta(days=SUBMISSION_GRACE_DAYS)
                # Roll forward to Monday if the due date lands on a weekend
                if next_due.weekday() == 5:   # Saturday → Monday
                    next_due += timedelta(days=2)
                elif next_due.weekday() == 6: # Sunday → Monday
                    next_due += timedelta(days=1)
                days_offset = (today - next_due).days   # positive = overdue
                if days_offset > 0:
                    status = "overdue"
                elif days_offset > -7:
                    status = "due_soon"
                else:
                    status = "current"

            rows.append({
                "company_id":          permit.company_id,
                "company_name":        company.name if company else None,
                "permit_id":           permit.id,
                "permit_number":       permit.permit_number,
                "permit_limit_id":     limit.id,
                "parameter_name":      limit.parameter.name if limit.parameter else "Unknown",
                "frequency_code":      limit.frequency.frequency_code,
                "frequency_description": limit.frequency.description,
                "interval_days":       interval_days,
                "sample_type":         limit.sample_type,
                "last_sample_date":    str(last_date)  if last_date  else None,
                "next_due_date":       str(next_due)   if next_due   else None,
                "days_overdue":        days_offset,
                "status":              status,
            })

    status_order = {"overdue": 0, "due_soon": 1, "never": 2, "current": 3}
    rows.sort(key=lambda r: (status_order.get(r["status"], 9), r["parameter_name"]))
    return jsonify(rows), 200


SUBMISSION_GRACE_DAYS = 15   # results due by the 15th of the following month


@compliance_bp.route("/summary", methods=["GET"])
@login_required
@roles_required("admin", "coordinator")
def compliance_summary():
    today     = date.today()
    year_start = date(today.year, 1, 1)
    recent_start = today - timedelta(days=60)
    prior_start  = today - timedelta(days=120)

    companies = Company.query.filter_by(is_active=True).order_by(Company.name).all()
    result = []

    for company in companies:
        viols = Violation.query.filter_by(company_id=company.id).all()

        def _past_grace(v):
            """
            A violation is only 'actionable' once the submission grace period has
            expired.  For a violation dated on day D, the facility has until
            D + SUBMISSION_GRACE_DAYS to submit.  Violations still within that
            window are informational only and do not count toward non-compliance.
            """
            return (today - v.violation_date).days >= SUBMISSION_GRACE_DAYS

        ytd     = [v for v in viols if v.violation_date >= year_start and _past_grace(v)]
        recent  = [v for v in viols if recent_start <= v.violation_date <= today and _past_grace(v)]
        prior   = [v for v in viols if prior_start  <= v.violation_date <  recent_start and _past_grace(v)]

        by_severity = {"major": 0, "significant": 0, "minor": 0}
        for v in ytd:
            sev = (v.violation_severity or "minor").lower()
            if sev in by_severity:
                by_severity[sev] += 1

        # Trend: compare recent 60d vs prior 60d
        r_count, p_count = len(recent), len(prior)
        if p_count == 0 and r_count == 0:
            trend = "stable"
        elif p_count == 0:
            trend = "worsening"
        elif r_count < p_count:
            trend = "improving"
        elif r_count > p_count:
            trend = "worsening"
        else:
            trend = "stable"

        # Enforcement actions for this company
        enf_all    = EnforcementHistory.query.filter_by(company_id=company.id).all()
        open_enf   = sum(1 for e in enf_all if e.status == "pending")
        closed_enf = sum(1 for e in enf_all if e.status in ("approved", "sent"))

        last_viol = max((v.violation_date for v in viols), default=None)

        active_permit = (Permit.query
                         .filter_by(company_id=company.id, is_active=True)
                         .order_by(Permit.expiration_date.desc())
                         .first())

        # Include ALL ytd violations in the detail view (even grace-period ones)
        # so coordinators can see what's coming — but mark grace-period ones clearly.
        ytd_all = [v for v in viols if v.violation_date >= year_start]
        ytd_details = sorted(
            [
                {
                    "violation_date":     str(v.violation_date),
                    "parameter_name":     v.parameter.name if v.parameter else "Unknown",
                    "violation_type":     v.violation_type,
                    "severity":           v.violation_severity or "minor",
                    "exceedance_percent": round(v.exceedance_percent, 1) if v.exceedance_percent is not None else None,
                    "in_grace_period":    not _past_grace(v),
                }
                for v in ytd_all
            ],
            key=lambda x: x["violation_date"],
            reverse=True,
        )

        result.append({
            "company_id":        company.id,
            "company_name":      company.name,
            "permit_number":     active_permit.permit_number  if active_permit else None,
            "expiration_date":   str(active_permit.expiration_date) if active_permit else None,
            "total_violations":  len(viols),
            "ytd_violations":    len(ytd),
            "ytd_details":       ytd_details,
            "recent_count":      r_count,
            "prior_count":       p_count,
            "trend":             trend,
            "by_severity":       by_severity,
            "open_enforcement":  open_enf,
            "closed_enforcement": closed_enf,
            "last_violation_date": str(last_viol) if last_viol else None,
            "is_compliant":      r_count == 0,
        })

    return jsonify(result), 200


@compliance_bp.route("/recalculate", methods=["POST"])
@login_required
@roles_required("admin", "coordinator")
def recalculate_compliance():
    """
    Re-run compliance for every sample in the database.

    Steps:
      1. Delete all sample-linked violations (sample_id IS NOT NULL).
      2. Delete any 'missing_sample' violations whose permit limit is a flow limit
         — these were incorrectly generated by check_missing_samples before the
         guard was added.  Real flow violations (flow_exceeds, sample_id=None)
         are preserved and re-evaluated when the flow report is re-reviewed.
      3. Re-evaluate every sample against current permit limits.
      4. Re-run check_missing_samples with the corrected logic so legitimate
         missing-sample violations are regenerated.
    """
    from engines.compliance_engine import check_missing_samples
    data       = request.get_json(silent=True) or {}
    company_id = data.get("company_id")   # optional — recalculate one company

    # ── Step 1: clear sample-linked violations ───────────────────────────────
    sample_q = Sample.query
    if company_id:
        sample_q = sample_q.filter_by(company_id=int(company_id))
    samples = sample_q.order_by(Sample.sample_date).all()

    cleared = 0
    new_violations = 0
    errors = 0

    for sample in samples:
        try:
            vids = [v.id for v in Violation.query.filter_by(sample_id=sample.id).all()]
            if vids:
                EnforcementHistory.query.filter(
                    EnforcementHistory.violation_id.in_(vids)
                ).delete(synchronize_session=False)
                Violation.query.filter(Violation.id.in_(vids)).delete(synchronize_session=False)
                db.session.commit()
                cleared += len(vids)

            for r in SampleResult.query.filter_by(sample_id=sample.id).all():
                cf = (r.permit_limit.parameter.conversion_factor
                      if r.permit_limit and r.permit_limit.parameter else None)
                if cf and sample.flow_mgd and r.concentration_result is not None:
                    r.loading_result = round(r.concentration_result * sample.flow_mgd * cf, 4)
                elif not sample.flow_mgd:
                    r.loading_result = None
            db.session.commit()

            violations = check_compliance(sample)
            new_violations += len(violations)
            for v in violations:
                try:
                    generate_enforcement_response(v)
                except Exception:
                    db.session.rollback()

        except Exception:
            db.session.rollback()
            errors += 1

    # ── Step 2: purge stale flow-limit missing_sample violations ────────────
    # These were incorrectly created when a flow permit limit had daily frequency.
    # Find them by joining to PermitLimit and filtering is_flow_limit = True.
    flow_missing_q = (
        db.session.query(Violation)
        .join(PermitLimit, PermitLimit.id == Violation.permit_limit_id)
        .filter(
            Violation.violation_type == "missing_sample",
            PermitLimit.is_flow_limit == True,          # noqa: E712
        )
    )
    if company_id:
        flow_missing_q = flow_missing_q.filter(Violation.company_id == int(company_id))

    stale_flow_viols = flow_missing_q.all()
    stale_ids = [v.id for v in stale_flow_viols]
    flow_cleared = len(stale_ids)
    if stale_ids:
        EnforcementHistory.query.filter(
            EnforcementHistory.violation_id.in_(stale_ids)
        ).delete(synchronize_session=False)
        Violation.query.filter(Violation.id.in_(stale_ids)).delete(synchronize_session=False)
        db.session.commit()

    # ── Step 3: also clear all existing missing_sample violations then
    #    re-run check_missing_samples so the result is authoritative ─────────
    # (Only for the scope being recalculated)
    existing_missing_q = Violation.query.filter(
        Violation.violation_type == "missing_sample",
        Violation.sample_id.is_(None),
    )
    if company_id:
        existing_missing_q = existing_missing_q.filter(
            Violation.company_id == int(company_id)
        )
    # Exclude flow-limit violations already purged above
    remaining_missing = [
        v for v in existing_missing_q.all() if v.id not in set(stale_ids)
    ]
    rem_ids = [v.id for v in remaining_missing]
    if rem_ids:
        EnforcementHistory.query.filter(
            EnforcementHistory.violation_id.in_(rem_ids)
        ).delete(synchronize_session=False)
        Violation.query.filter(Violation.id.in_(rem_ids)).delete(synchronize_session=False)
        db.session.commit()

    new_missing = check_missing_samples(int(company_id) if company_id else None)
    new_violations += len(new_missing)
    for v in new_missing:
        try:
            generate_enforcement_response(v)
        except Exception:
            db.session.rollback()

    return jsonify({
        "samples_processed":        len(samples),
        "violations_cleared":       cleared,
        "flow_missing_purged":      flow_cleared,
        "violations_created":       new_violations,
        "errors":                   errors,
    }), 200


@compliance_bp.route("/violations", methods=["GET"])
@login_required
def list_violations():
    company_id = request.args.get("company_id", type=int)
    query = Violation.query
    if company_id:
        query = query.filter_by(company_id=company_id)
    violations = query.order_by(Violation.violation_date.desc()).limit(200).all()
    return jsonify([v.to_dict() for v in violations]), 200


@compliance_bp.route("/check-missing", methods=["POST"])
@login_required
@roles_required("admin", "coordinator")
def check_missing():
    from engines.compliance_engine import check_missing_samples
    from engines.erg_engine import generate_enforcement_response
    data       = request.get_json(silent=True) or {}
    company_id = data.get("company_id")
    violations = check_missing_samples(company_id)
    enforcement = []
    for v in violations:
        action = generate_enforcement_response(v)
        if action:
            enforcement.append(action.to_dict())
    return jsonify({
        "new_violations":     len(violations),
        "enforcement_actions": len(enforcement),
        "violations": [v.to_dict() for v in violations],
    }), 200


# ── SNC helpers ─────────────────────────────────────────────────────────────

# Parameters that use TRC factor 1.4 (BOD, TSS, Fats/Oil/Grease)
_TRC_HIGH_KEYWORDS = {"bod", "cbod", "bods", "cbods", "tss", "fog", "oil", "grease", "fats"}

def _trc_factor(param_name: str, abbreviation: str = "") -> float:
    """Return TRC factor: 1.4 for BOD/TSS/FOG, 1.2 for everything else."""
    combined = (param_name + " " + abbreviation).lower()
    for kw in _TRC_HIGH_KEYWORDS:
        if kw in combined:
            return 1.4
    return 1.2


def _is_ph(param_name: str, abbreviation: str = "") -> bool:
    combined = (param_name + " " + abbreviation).lower()
    return "ph" == combined.strip() or " ph" in combined or combined.startswith("ph ")


def _required_samples_in_period(limit, period_start, period_end) -> int:
    """Estimate the number of samples required by the permit frequency in [period_start, period_end]."""
    if not limit.frequency_id or not limit.frequency:
        return 0
    interval_days = _parse_interval(limit.frequency.frequency_code)
    if not interval_days:
        return 0
    days_in_period = (period_end - period_start).days + 1
    return max(1, round(days_in_period / interval_days))


@compliance_bp.route("/snc", methods=["GET"])
@login_required
def snc_report():
    """
    Significant Non-Compliance (SNC) determination for one or all companies.

    Two independent tests per parameter per semi-annual period:
      Test 1 – Frequency SNC  : violations / required_samples > 66 %
      Test 2 – TRC Magnitude  : (violations where measured/limit > TRC factor)
                                / required_samples > 33 %

    TRC factors: 1.4 for BOD / TSS / FOG; 1.2 for all others.
    pH special rule: any single exceedance is treated as a TRC violation.

    Query params
    ------------
    year       : int  (default = current year)
    half       : 1 or 2 (default = current half)
    company_id : int  (IU role is forced to their own company)
    """
    today = date.today()
    year  = request.args.get("year",  type=int) or today.year
    half  = request.args.get("half",  type=int) or (1 if today.month <= 6 else 2)
    company_id = request.args.get("company_id", type=int)

    if current_user.role == "iu":
        company_id = current_user.company_id

    if half == 1:
        period_start = date(year, 1, 1)
        period_end   = date(year, 6, 30)
    else:
        period_start = date(year, 7, 1)
        period_end   = date(year, 12, 31)

    if company_id:
        companies = Company.query.filter_by(id=company_id).all()
    else:
        companies = Company.query.filter_by(is_active=True).order_by(Company.name).all()

    results = []
    for company in companies:
        active_permit = (
            Permit.query
            .filter_by(company_id=company.id, is_active=True)
            .order_by(Permit.expiration_date.desc())
            .first()
        )
        if not active_permit:
            continue

        # All violations for this company in the period (past grace)
        viols = (
            Violation.query
            .filter_by(company_id=company.id)
            .filter(Violation.violation_date >= period_start)
            .filter(Violation.violation_date <= period_end)
            .all()
        )

        # Index violations by permit_limit_id
        by_limit: dict[int, list] = {}
        for v in viols:
            by_limit.setdefault(v.permit_limit_id, []).append(v)

        param_rows = []
        for limit in active_permit.limits:
            if limit.is_flow_limit or limit.is_monitor_report:
                continue

            required = _required_samples_in_period(limit, period_start, period_end)
            if required == 0:
                continue

            param_name   = limit.parameter.name         if limit.parameter else "Unknown"
            abbreviation = limit.parameter.abbreviation if limit.parameter else ""
            trc           = _trc_factor(param_name, abbreviation)
            ph_param      = _is_ph(param_name, abbreviation)

            limit_viols = by_limit.get(limit.id, [])

            # ── Test 1: Frequency SNC ──────────────────────────────────────
            freq_count = len(limit_viols)
            freq_pct   = (freq_count / required) * 100
            freq_snc   = freq_pct > 66

            # ── Test 2: TRC Magnitude SNC ─────────────────────────────────
            trc_count = 0
            max_ratio = None
            for v in limit_viols:
                if ph_param:
                    # pH: every exceedance counts as TRC
                    trc_count += 1
                    max_ratio = (max_ratio or 0) + 1   # placeholder — no ratio for range limits
                elif v.exceedance_percent is not None:
                    ratio = 1.0 + v.exceedance_percent / 100.0
                    if max_ratio is None or ratio > max_ratio:
                        max_ratio = ratio
                    if ratio > trc:
                        trc_count += 1

            trc_pct  = (trc_count / required) * 100
            trc_snc  = trc_pct > 33

            param_rows.append({
                "permit_limit_id":        limit.id,
                "parameter_name":         param_name,
                "abbreviation":           abbreviation,
                "is_ph":                  ph_param,
                "required_samples":       required,
                "violation_count":        freq_count,
                "violation_frequency_pct": round(freq_pct, 1),
                "frequency_snc":          freq_snc,
                "trc_factor":             trc,
                "max_ratio":              round(max_ratio, 3) if (max_ratio and not ph_param) else None,
                "trc_exceedance_count":   trc_count,
                "trc_frequency_pct":      round(trc_pct, 1),
                "trc_snc":                trc_snc,
                "in_snc":                 freq_snc or trc_snc,
            })

        # pH special override: any single exceedance → facility SNC
        ph_snc_triggered = any(
            r["in_snc"] for r in param_rows if r["is_ph"]
        )
        facility_snc = any(r["in_snc"] for r in param_rows)

        results.append({
            "company_id":       company.id,
            "company_name":     company.name,
            "permit_number":    active_permit.permit_number,
            "year":             year,
            "half":             half,
            "period_start":     str(period_start),
            "period_end":       str(period_end),
            "parameters":       param_rows,
            "facility_in_snc":  facility_snc,
            "ph_snc_triggered": ph_snc_triggered,
        })

    return jsonify(results), 200


@compliance_bp.route("/violations/<int:company_id>/history", methods=["GET"])
@login_required
def violation_history(company_id):
    from datetime import date, timedelta
    cutoff = date.today() - timedelta(days=365)
    violations = (Violation.query
                  .filter_by(company_id=company_id)
                  .filter(Violation.violation_date >= cutoff)
                  .order_by(Violation.violation_date.desc())
                  .all())
    return jsonify([v.to_dict() for v in violations]), 200
