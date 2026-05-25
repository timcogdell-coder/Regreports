"""
Compliance Engine
Compares sample results against permit limits and records violations.
"""
import calendar as _calendar
from datetime import date, timedelta
from models import db, Sample, SampleResult, PermitLimit, Violation, Parameter


def _exceedance_pct(measured: float, limit_val: float) -> float:
    """Return % exceedance above limit_val. Returns 0 if limit_val is 0."""
    if not limit_val:
        return 0.0
    return (measured - limit_val) / limit_val * 100


def _below_pct(measured: float, limit_val: float) -> float:
    """Return % below limit_val (for range min checks). Returns 0 if limit_val is 0."""
    if not limit_val:
        return 0.0
    return (limit_val - measured) / limit_val * 100


def _iso_week_bounds(d: date) -> tuple:
    """Return (monday, sunday) for the ISO calendar week containing date d."""
    monday = d - timedelta(days=d.weekday())   # weekday(): 0=Mon
    sunday = monday + timedelta(days=6)
    return monday, sunday


def check_compliance(sample: Sample) -> list:
    """
    Check all results for the given sample against permit limits.
    Returns a list of Violation objects (already persisted to DB).
    """
    violations = []
    results = SampleResult.query.filter_by(sample_id=sample.id).all()

    for result in results:
        limit = result.permit_limit
        if not limit:
            continue
        v = _check_result(sample, result, limit)
        violations.extend(v)

    return violations


def _check_result(sample: Sample, result: SampleResult, limit: PermitLimit) -> list:
    violations = []
    conc    = result.concentration_result
    loading = result.loading_result

    # Whole-row MR flag — no numeric limits apply to this parameter at all.
    if limit.is_monitor_report:
        return violations

    # ── Flow limit (IU-entered MGD value compared directly against permit limit) ──
    # averaging_period selects which limit column to compare against.
    # No loading calculation — straight value vs. limit.
    if limit.is_flow_limit:
        if conc is None:
            return violations
        period   = limit.averaging_period or "daily_max"
        lim_val  = {
            "daily_max":   limit.daily_max_concentration,
            "weekly_max":  limit.weekly_max_concentration,
            "monthly_avg": limit.monthly_avg_concentration,
        }.get(period)
        if lim_val is not None and conc > lim_val:
            pct = _exceedance_pct(conc, lim_val)
            violations.append(_create_violation(sample, limit, result, "flow_exceeds", pct))
        return violations

    # ── Range limit (e.g. pH 6–9 s.u.) ─────────────────────────────────────
    if limit.is_range_limit:
        if conc is not None:
            if limit.min_value is not None and conc < limit.min_value:
                pct = _below_pct(conc, limit.min_value)
                violations.append(_create_violation(sample, limit, result, "below_min", pct))
            elif limit.max_value is not None and conc > limit.max_value:
                pct = _exceedance_pct(conc, limit.max_value)
                violations.append(_create_violation(sample, limit, result, "above_max", pct))
        # Optional loading cap on a range-type limit
        if loading is not None and limit.daily_max_loading is not None:
            if loading > limit.daily_max_loading:
                pct = _exceedance_pct(loading, limit.daily_max_loading)
                violations.append(_create_violation(sample, limit, result, "max_exceeds", pct))
        return violations

    # ── Standard max / average limits ───────────────────────────────────────
    daily_mr   = limit.daily_max_is_mr   or False
    weekly_mr  = limit.weekly_max_is_mr  or False
    monthly_mr = limit.monthly_avg_is_mr or False

    # daily_max_is_mr suppresses the concentration check only; loading is enforced independently.
    if not daily_mr:
        if conc is not None and limit.daily_max_concentration is not None:
            if conc > limit.daily_max_concentration:
                pct = _exceedance_pct(conc, limit.daily_max_concentration)
                violations.append(_create_violation(sample, limit, result, "max_exceeds", pct))

    if loading is not None and limit.daily_max_loading is not None:
        if loading > limit.daily_max_loading:
            pct = _exceedance_pct(loading, limit.daily_max_loading)
            violations.append(_create_violation(sample, limit, result, "max_exceeds", pct))

    # Check weekly maximum concentration (7-day average, ISO Mon–Sun).
    # avg/weekly violations are period-level: sample_id is left NULL so they don't
    # migrate to a different sample when recalculate runs in date order.
    if not weekly_mr and conc is not None and limit.weekly_max_concentration is not None:
        _clear_weekly_violations(sample, limit)
        week_avg = _get_weekly_avg_concentration(sample, limit)
        if week_avg is not None and week_avg > limit.weekly_max_concentration:
            pct = _exceedance_pct(week_avg, limit.weekly_max_concentration)
            violations.append(_create_violation(sample, limit, result, "weekly_avg_exceeds", pct, link_to_sample=False))

    # Check weekly maximum loading (7-day average).
    if not weekly_mr and loading is not None and limit.weekly_max_loading is not None:
        _clear_weekly_violations(sample, limit)
        week_avg_load = _get_weekly_avg_loading(sample, limit)
        if week_avg_load is not None and week_avg_load > limit.weekly_max_loading:
            pct = _exceedance_pct(week_avg_load, limit.weekly_max_loading)
            violations.append(_create_violation(sample, limit, result, "weekly_avg_exceeds", pct, link_to_sample=False))

    # Check monthly average concentration.
    # Always clear existing avg violations for this parameter/month first so that
    # a corrective extra sample (which lowers the average back into compliance)
    # automatically resolves the earlier violation.
    if not monthly_mr and conc is not None and limit.monthly_avg_concentration is not None:
        _clear_monthly_avg_violations(sample, limit)
        avg = _get_monthly_avg_concentration(sample, limit)
        if avg is not None and avg > limit.monthly_avg_concentration:
            pct = _exceedance_pct(avg, limit.monthly_avg_concentration)
            violations.append(_create_violation(sample, limit, result, "avg_exceeds", pct, link_to_sample=False))

    # Check monthly average loading (same sweep-and-re-evaluate logic).
    # monthly_avg_is_mr only suppresses the concentration check; loading is enforced independently.
    if loading is not None and limit.monthly_avg_loading is not None:
        _clear_monthly_avg_violations(sample, limit)
        avg_load = _get_monthly_avg_loading(sample, limit)
        if avg_load is not None and avg_load > limit.monthly_avg_loading:
            pct = _exceedance_pct(avg_load, limit.monthly_avg_loading)
            violations.append(_create_violation(sample, limit, result, "avg_exceeds", pct, link_to_sample=False))

    return violations


def _clear_monthly_avg_violations(sample: Sample, limit: PermitLimit) -> None:
    """
    Delete all avg_exceeds violations for this parameter/permit in the same
    calendar month.  Called before re-evaluating the monthly average so that a
    corrective extra sample that pulls the average back into compliance
    automatically removes the earlier violation.
    """
    from models import EnforcementHistory
    sample_date = sample.sample_date
    existing = Violation.query.filter(
        Violation.company_id      == sample.company_id,
        Violation.permit_limit_id == limit.id,
        Violation.violation_type  == "avg_exceeds",
        db.func.extract("month", Violation.violation_date) == sample_date.month,
        db.func.extract("year",  Violation.violation_date) == sample_date.year,
    ).all()
    if existing:
        vids = [v.id for v in existing]
        EnforcementHistory.query.filter(
            EnforcementHistory.violation_id.in_(vids)
        ).delete(synchronize_session=False)
        Violation.query.filter(Violation.id.in_(vids)).delete(synchronize_session=False)
        db.session.commit()


def _clear_weekly_violations(sample: Sample, limit: PermitLimit) -> None:
    """
    Delete all weekly_avg_exceeds violations for this parameter in the same ISO week.
    Allows a corrective extra sample within the same week to auto-resolve the violation.
    """
    from models import EnforcementHistory
    mon, sun = _iso_week_bounds(sample.sample_date)
    existing = Violation.query.filter(
        Violation.company_id      == sample.company_id,
        Violation.permit_limit_id == limit.id,
        Violation.violation_type  == "weekly_avg_exceeds",
        Violation.violation_date  >= mon,
        Violation.violation_date  <= sun,
    ).all()
    if existing:
        vids = [v.id for v in existing]
        EnforcementHistory.query.filter(
            EnforcementHistory.violation_id.in_(vids)
        ).delete(synchronize_session=False)
        Violation.query.filter(Violation.id.in_(vids)).delete(synchronize_session=False)
        db.session.commit()


def _get_weekly_avg_concentration(sample: Sample, limit: PermitLimit) -> float | None:
    """Calculate average concentration across all samples in the same ISO week."""
    from sqlalchemy import func
    mon, sun = _iso_week_bounds(sample.sample_date)
    return (
        db.session.query(func.avg(SampleResult.concentration_result))
        .join(Sample)
        .filter(
            Sample.company_id            == sample.company_id,
            Sample.permit_id             == sample.permit_id,
            SampleResult.permit_limit_id == limit.id,
            Sample.sample_date           >= mon,
            Sample.sample_date           <= sun,
        )
        .scalar()
    )


def _get_weekly_avg_loading(sample: Sample, limit: PermitLimit) -> float | None:
    """Calculate average loading across all samples in the same ISO week."""
    from sqlalchemy import func
    mon, sun = _iso_week_bounds(sample.sample_date)
    return (
        db.session.query(func.avg(SampleResult.loading_result))
        .join(Sample)
        .filter(
            Sample.company_id            == sample.company_id,
            Sample.permit_id             == sample.permit_id,
            SampleResult.permit_limit_id == limit.id,
            Sample.sample_date           >= mon,
            Sample.sample_date           <= sun,
        )
        .scalar()
    )


def _get_monthly_avg_concentration(sample: Sample, limit: PermitLimit) -> float | None:
    """Calculate average concentration for the same parameter/permit this calendar month."""
    from sqlalchemy import func
    sample_date = sample.sample_date
    results = (
        db.session.query(func.avg(SampleResult.concentration_result))
        .join(Sample)
        .filter(
            Sample.company_id == sample.company_id,
            Sample.permit_id  == sample.permit_id,
            SampleResult.permit_limit_id == limit.id,
            func.extract("month", Sample.sample_date) == sample_date.month,
            func.extract("year",  Sample.sample_date) == sample_date.year,
        )
        .scalar()
    )
    return results


def _get_monthly_avg_loading(sample: Sample, limit: PermitLimit) -> float | None:
    """Calculate average loading for the same parameter/permit this calendar month."""
    from sqlalchemy import func
    sample_date = sample.sample_date
    result = (
        db.session.query(func.avg(SampleResult.loading_result))
        .join(Sample)
        .filter(
            Sample.company_id == sample.company_id,
            Sample.permit_id  == sample.permit_id,
            SampleResult.permit_limit_id == limit.id,
            func.extract("month", Sample.sample_date) == sample_date.month,
            func.extract("year",  Sample.sample_date) == sample_date.year,
        )
        .scalar()
    )
    return result


def _parse_freq(code: str):
    """'1/30' → 30.0 days. Returns None if unparseable."""
    try:
        n, d = code.split("/")
        return float(d) / float(n)
    except Exception:
        return None


SUBMISSION_GRACE_DAYS = 15   # results due by the 15th of the following month


def check_missing_samples(company_id: int = None) -> list:
    """
    Scan all active permits and create missing_sample violations for any
    sampling period that passed without at least one submission.

    A 15-day grace period is applied: a period is only flagged as missing
    once today > period_due + SUBMISSION_GRACE_DAYS (e.g. January results
    are not flagged until after February 15th).

    Safe to call repeatedly — duplicate violations for the same period
    are skipped. Caps at 12 missed periods per parameter to avoid
    flooding old inactive companies.
    """
    from sqlalchemy import func
    from models import Permit, EnforcementHistory

    today = date.today()
    new_violations = []

    permit_q = Permit.query.filter_by(is_active=True)
    if company_id:
        permit_q = permit_q.filter_by(company_id=company_id)

    for permit in permit_q.all():
        for limit in permit.limits:
            # Flow limits are verified against MonthlyFlowReport via check_flow_compliance —
            # never through the sample-submission pathway.
            # Monitor-report limits have no numeric threshold to evaluate.
            if limit.is_flow_limit or limit.is_monitor_report:
                continue
            if not limit.frequency_id or not limit.frequency:
                continue
            interval = _parse_freq(limit.frequency.frequency_code)
            if not interval:
                continue

            # Most recent sample date for this limit
            last_date = (
                db.session.query(func.max(Sample.sample_date))
                .join(SampleResult, SampleResult.sample_id == Sample.id)
                .filter(
                    Sample.company_id        == permit.company_id,
                    Sample.permit_id         == permit.id,
                    SampleResult.permit_limit_id == limit.id,
                )
                .scalar()
            )

            check_from = last_date or permit.effective_date
            if not check_from:
                continue

            # Walk forward through missed periods
            # Only flag as missing once today is past the grace deadline
            period_due = check_from + timedelta(days=interval)
            missed = 0
            grace_deadline = period_due + timedelta(days=SUBMISSION_GRACE_DAYS)
            while grace_deadline <= today and missed < 12:
                existing = Violation.query.filter_by(
                    company_id      = permit.company_id,
                    permit_limit_id = limit.id,
                    violation_type  = "missing_sample",
                    violation_date  = period_due,
                ).first()

                if not existing:
                    v = Violation(
                        company_id         = permit.company_id,
                        parameter_id       = limit.parameter_id,
                        permit_limit_id    = limit.id,
                        sample_id          = None,
                        violation_type     = "missing_sample",
                        violation_date     = period_due,
                        violation_severity = "significant",
                        exceedance_percent = None,
                    )
                    db.session.add(v)
                    new_violations.append(v)

                period_due     += timedelta(days=interval)
                grace_deadline += timedelta(days=interval)
                missed         += 1

    db.session.commit()
    return new_violations


def _create_violation(sample, limit, result, violation_type, exceedance_pct, *, link_to_sample=True) -> Violation:
    severity = _classify_severity(exceedance_pct)
    v = Violation(
        company_id          = sample.company_id,
        parameter_id        = limit.parameter_id,
        permit_limit_id     = limit.id,
        sample_id           = sample.id if link_to_sample else None,
        violation_type      = violation_type,
        violation_date      = sample.sample_date,
        violation_severity  = severity,
        exceedance_percent  = exceedance_pct,
    )
    db.session.add(v)
    db.session.commit()
    return v


def _classify_severity(exceedance_pct: float) -> str:
    if exceedance_pct < 20:
        return "minor"
    elif exceedance_pct < 100:
        return "significant"
    else:
        return "major"


def check_flow_compliance(flow_report) -> list:
    """
    Check a monthly flow report's avg/weekly-max/daily-max values against all
    flow-type permit limits for the company.  Clears any existing flow_exceeds
    violations for the same month before re-evaluating so that a corrected
    re-submission automatically resolves prior violations.

    Returns a list of Violation objects already persisted to the DB.
    """
    from models import Permit, EnforcementHistory

    company_id   = flow_report.company_id
    report_month = flow_report.report_month
    report_year  = flow_report.report_year
    last_day     = _calendar.monthrange(report_year, report_month)[1]
    violation_date = date(report_year, report_month, last_day)

    # Clear existing flow violations for this company / month
    existing = Violation.query.filter(
        Violation.company_id    == company_id,
        Violation.violation_type == "flow_exceeds",
        db.func.extract("month", Violation.violation_date) == report_month,
        db.func.extract("year",  Violation.violation_date) == report_year,
    ).all()
    if existing:
        vids = [v.id for v in existing]
        EnforcementHistory.query.filter(
            EnforcementHistory.violation_id.in_(vids)
        ).delete(synchronize_session=False)
        Violation.query.filter(Violation.id.in_(vids)).delete(synchronize_session=False)
        db.session.commit()

    # Map averaging_period → (measured value, limit column)
    measured_map = {
        "monthly_avg": flow_report.monthly_avg_mgd,
        "weekly_max":  flow_report.weekly_max_mgd,
        "daily_max":   flow_report.daily_max_mgd,
    }
    limit_map = {
        "monthly_avg": lambda lim: lim.monthly_avg_concentration,
        "weekly_max":  lambda lim: lim.weekly_max_concentration,
        "daily_max":   lambda lim: lim.daily_max_concentration,
    }

    violations = []
    permits = Permit.query.filter_by(company_id=company_id, is_active=True).all()
    for permit in permits:
        for limit in permit.limits:
            if not limit.is_flow_limit:
                continue
            period   = limit.averaging_period or "monthly_avg"
            measured = measured_map.get(period)
            lim_val  = limit_map.get(period, lambda _: None)(limit) if period in limit_map else None

            if measured is None or lim_val is None:
                continue

            if measured > lim_val:
                pct      = (measured - lim_val) / lim_val * 100
                severity = _classify_severity(pct)
                v = Violation(
                    company_id         = company_id,
                    parameter_id       = limit.parameter_id,
                    permit_limit_id    = limit.id,
                    sample_id          = None,
                    violation_type     = "flow_exceeds",
                    violation_date     = violation_date,
                    violation_severity = severity,
                    exceedance_percent = pct,
                )
                db.session.add(v)
                violations.append(v)

    db.session.commit()
    return violations
