import calendar
from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import db, Sample, SampleResult, PermitLimit, Violation, Company, Permit, AuditLog, MonthlyFlowReport
from engines.compliance_engine import check_compliance
from engines.erg_engine import generate_enforcement_response
from utils.decorators import roles_required
from utils.audit import audit

samples_bp = Blueprint("samples", __name__)


@samples_bp.route("", methods=["POST"])
@login_required
def submit_sample():
    data = request.get_json()
    required = ["company_id", "permit_id", "sample_date", "results"]
    if not all(k in data for k in required):
        return jsonify({"error": "Missing required fields"}), 400

    company_id = current_user.company_id if current_user.role == "iu" else data.get("company_id")
    if not company_id:
        return jsonify({"error": "company_id required"}), 400

    # Derive period info from sample date
    sample_date_obj = datetime.strptime(data["sample_date"], "%Y-%m-%d").date()
    report_month  = sample_date_obj.month
    report_year   = sample_date_obj.year
    sampling_days = calendar.monthrange(report_year, report_month)[1]

    # Sample flow is entered by the IU at sampling time (flow during the sampling event).
    # This is used only for loading calculations on this sample.
    # It is entirely separate from the monthly plant flow report.
    flow_mgd = data.get("flow_mgd")
    if flow_mgd is not None:
        flow_mgd = float(flow_mgd)

    sample = Sample(
        company_id    = company_id,
        permit_id     = data["permit_id"],
        sample_date   = data["sample_date"],
        sampler_name  = data.get("sampler_name"),
        temperature   = data.get("temperature"),
        coc_form_data = data.get("coc_form_data"),
        flow_mgd      = flow_mgd,
        sampling_days = sampling_days,
        submitted_by  = current_user.id,
    )
    db.session.add(sample)
    db.session.flush()

    for r in data["results"]:
        concentration = r["concentration"]
        permit_limit  = PermitLimit.query.get(r["permit_limit_id"])
        loading = None
        cf = permit_limit.parameter.conversion_factor if permit_limit and permit_limit.parameter else None
        if cf and flow_mgd and concentration is not None:
            loading = round(concentration * flow_mgd * cf, 4)

        db.session.add(SampleResult(
            sample_id            = sample.id,
            permit_limit_id      = r["permit_limit_id"],
            concentration_result = concentration,
            loading_result       = loading,
        ))

    db.session.commit()

    violations = check_compliance(sample)

    enforcement_actions = []
    for v in violations:
        action = generate_enforcement_response(v)
        if action:
            enforcement_actions.append(action.to_dict())

    company = Company.query.get(company_id)
    audit(
        "Submitted sample",
        table_name = "tbl_sample",
        record_id  = sample.id,
        details    = (
            f"Company: {company.name if company else company_id} | "
            f"Date: {data['sample_date']} | "
            f"{len(data['results'])} result(s) | "
            f"Flow: {flow_mgd} MGD | "
            f"Violations: {len(violations)}"
        ),
    )
    db.session.commit()

    return jsonify({
        "sample":             sample.to_dict(),
        "flow_mgd":           flow_mgd,
        "violations":         [v.to_dict() for v in violations],
        "enforcement_actions": enforcement_actions,
        "compliance_status":  "violation" if violations else "compliant",
    }), 201


@samples_bp.route("", methods=["GET"])
@login_required
def list_samples():
    company_id = request.args.get("company_id", type=int)
    if current_user.role == "iu":
        company_id = current_user.company_id
    query = Sample.query
    if company_id:
        query = query.filter_by(company_id=company_id)
    samples = query.order_by(Sample.sample_date.desc()).limit(100).all()
    return jsonify([s.to_dict() for s in samples]), 200


@samples_bp.route("/<int:sample_id>", methods=["GET"])
@login_required
def get_sample(sample_id):
    sample  = Sample.query.get_or_404(sample_id)
    company = Company.query.get(sample.company_id)
    permit  = Permit.query.get(sample.permit_id)

    results = []
    for r in sample.results:
        limit = r.permit_limit
        results.append({
            "id":                        r.id,
            "permit_limit_id":           r.permit_limit_id,
            "parameter_name":            limit.parameter.name if limit and limit.parameter else "Unknown",
            "concentration_result":      r.concentration_result,
            "loading_result":            r.loading_result,
            "daily_max_concentration":   limit.daily_max_concentration   if limit else None,
            "daily_max_loading":         limit.daily_max_loading         if limit else None,
            "monthly_avg_concentration": limit.monthly_avg_concentration if limit else None,
            "monthly_avg_loading":       limit.monthly_avg_loading       if limit else None,
            "is_monitor_report":         limit.is_monitor_report         if limit else False,
            "is_range_limit":            limit.is_range_limit            if limit else False,
            "min_value":                 limit.min_value                 if limit else None,
            "max_value":                 limit.max_value                 if limit else None,
        })

    violations = [v.to_dict() for v in sample.violations]

    data = sample.to_dict()
    data["company_name"]  = company.name if company else None
    data["permit_number"] = permit.permit_number if permit else None
    data["results"]       = results
    data["violations"]    = violations
    return jsonify(data), 200


@samples_bp.route("/<int:sample_id>", methods=["PUT"])
@login_required
def update_sample(sample_id):
    sample = Sample.query.get_or_404(sample_id)

    # IU can only edit their own unreviewed submissions
    if current_user.role == "iu":
        if sample.company_id != current_user.company_id:
            return jsonify({"error": "Not authorised"}), 403
        if sample.review_status == "reviewed":
            return jsonify({"error": "Reviewed samples cannot be modified"}), 403

    data    = request.get_json()
    changes = []

    # Header-level edits (IU can correct date and sampler name before review)
    if "sample_date" in data:
        new_date = data["sample_date"]
        if str(sample.sample_date) != str(new_date):
            changes.append(f"sample_date: {sample.sample_date} → {new_date}")
            sample.sample_date = new_date
    if "sampler_name" in data:
        new_name = data["sampler_name"]
        if sample.sampler_name != new_name:
            changes.append(f"sampler_name: {sample.sampler_name!r} → {new_name!r}")
            sample.sampler_name = new_name

    for r_data in data.get("results", []):
        result = SampleResult.query.filter_by(
            sample_id=sample_id,
            permit_limit_id=r_data["permit_limit_id"],
        ).first()
        if not result:
            continue

        new_conc = r_data.get("concentration")
        old_conc = result.concentration_result

        if new_conc == old_conc:
            continue

        param_name = result.permit_limit.parameter.name if result.permit_limit and result.permit_limit.parameter else f"limit {r_data['permit_limit_id']}"
        changes.append(f"{param_name}: {old_conc} → {new_conc} mg/L")

        result.concentration_result = new_conc
        cf = result.permit_limit.parameter.conversion_factor if result.permit_limit and result.permit_limit.parameter else None
        if cf and sample.flow_mgd and new_conc is not None:
            result.loading_result = round(new_conc * sample.flow_mgd * cf, 4)
        else:
            result.loading_result = None

    if changes:
        correction_reason = data.get("correction_reason", "").strip()
        detail_parts = changes[:]
        if correction_reason:
            detail_parts.append(f"Reason: {correction_reason}")
        audit(
            "Corrected sample" if correction_reason else "Edited sample",
            table_name = "tbl_sample",
            record_id  = sample_id,
            details    = "; ".join(detail_parts),
        )
        sample.is_corrected = True

    db.session.commit()

    # Re-run compliance with updated values
    # Recalculate loading_result for all results first so compliance sees current flow_mgd.
    # This is essential when flow_mgd was corrected after initial submission.
    for r in SampleResult.query.filter_by(sample_id=sample_id).all():
        cf = (r.permit_limit.parameter.conversion_factor
              if r.permit_limit and r.permit_limit.parameter else None)
        if cf and sample.flow_mgd and r.concentration_result is not None:
            r.loading_result = round(r.concentration_result * sample.flow_mgd * cf, 4)
        elif not sample.flow_mgd:
            r.loading_result = None
    db.session.commit()

    # Must delete enforcement history before violations (FK constraint)
    from models import EnforcementHistory
    violation_ids = [v.id for v in Violation.query.filter_by(sample_id=sample_id).all()]
    if violation_ids:
        EnforcementHistory.query.filter(
            EnforcementHistory.violation_id.in_(violation_ids)
        ).delete(synchronize_session=False)
    Violation.query.filter_by(sample_id=sample_id).delete(synchronize_session=False)
    db.session.commit()
    violations = check_compliance(sample)

    return jsonify({
        "sample":     sample.to_dict(),
        "violations": [v.to_dict() for v in violations],
        "changes":    changes,
    }), 200


@samples_bp.route("/<int:sample_id>", methods=["DELETE"])
@login_required
def delete_sample(sample_id):
    from models import EnforcementHistory
    sample = Sample.query.get(sample_id)
    if not sample:
        return jsonify({"error": "Sample not found"}), 404

    if current_user.role == "iu":
        if sample.company_id != current_user.company_id:
            return jsonify({"error": "Not authorised"}), 403
        if sample.review_status == "reviewed":
            return jsonify({"error": "Reviewed samples cannot be deleted"}), 403
    elif current_user.role not in ("admin", "coordinator"):
        return jsonify({"error": "Not authorised"}), 403

    violation_ids = [v.id for v in Violation.query.filter_by(sample_id=sample_id).all()]
    if violation_ids:
        EnforcementHistory.query.filter(
            EnforcementHistory.violation_id.in_(violation_ids)
        ).delete(synchronize_session=False)

    Violation.query.filter_by(sample_id=sample_id).delete(synchronize_session=False)
    SampleResult.query.filter_by(sample_id=sample_id).delete(synchronize_session=False)
    Sample.query.filter_by(id=sample_id).delete(synchronize_session=False)
    audit(
        "Deleted sample",
        table_name = "tbl_sample",
        record_id  = sample_id,
        details    = f"Sample #{sample_id} dated {sample.sample_date} deleted",
    )
    db.session.commit()
    return jsonify({"deleted": sample_id}), 200


@samples_bp.route("/<int:sample_id>/results/<int:result_id>", methods=["DELETE"])
@login_required
def delete_sample_result(sample_id, result_id):
    from models import EnforcementHistory
    result = SampleResult.query.filter_by(id=result_id, sample_id=sample_id).first()
    if not result:
        return jsonify({"error": "Result not found"}), 404

    sample = Sample.query.get(sample_id)

    if current_user.role == "iu":
        if sample.company_id != current_user.company_id:
            return jsonify({"error": "Not authorised"}), 403
        if sample.review_status == "reviewed":
            return jsonify({"error": "Reviewed samples cannot be modified"}), 403
    elif current_user.role not in ("admin", "coordinator"):
        return jsonify({"error": "Not authorised"}), 403
    permit_limit_id = result.permit_limit_id
    violation_ids = [v.id for v in Violation.query.filter_by(
        sample_id=sample_id, permit_limit_id=permit_limit_id
    ).all()]
    if violation_ids:
        EnforcementHistory.query.filter(
            EnforcementHistory.violation_id.in_(violation_ids)
        ).delete(synchronize_session=False)

    Violation.query.filter_by(
        sample_id=sample_id, permit_limit_id=permit_limit_id
    ).delete(synchronize_session=False)
    param_name = result.permit_limit.parameter.name if result.permit_limit and result.permit_limit.parameter else f"limit {permit_limit_id}"
    SampleResult.query.filter_by(id=result_id).delete(synchronize_session=False)
    audit(
        "Deleted sample result",
        table_name = "tbl_sample_results",
        record_id  = result_id,
        details    = f"Sample #{sample_id} | Parameter: {param_name}",
    )
    db.session.commit()

    violations = check_compliance(sample)
    return jsonify({"deleted": result_id, "violations": [v.to_dict() for v in violations]}), 200


@samples_bp.route("/<int:sample_id>/results", methods=["POST"])
@login_required
def add_sample_result(sample_id):
    from models import EnforcementHistory
    sample = Sample.query.get_or_404(sample_id)

    if current_user.role == "iu":
        if sample.company_id != current_user.company_id:
            return jsonify({"error": "Not authorised"}), 403
        if sample.review_status == "reviewed":
            return jsonify({"error": "Reviewed samples cannot be modified"}), 403
    elif current_user.role not in ("admin", "coordinator"):
        return jsonify({"error": "Not authorised"}), 403

    data = request.get_json()
    permit_limit_id = data.get("permit_limit_id")
    concentration   = data.get("concentration")

    if not permit_limit_id:
        return jsonify({"error": "permit_limit_id required"}), 400

    if SampleResult.query.filter_by(sample_id=sample_id, permit_limit_id=permit_limit_id).first():
        return jsonify({"error": "A result for this parameter already exists"}), 409

    permit_limit = PermitLimit.query.get(permit_limit_id)

    loading = None
    cf = permit_limit.parameter.conversion_factor if permit_limit and permit_limit.parameter else None
    if cf and sample.flow_mgd and concentration is not None:
        loading = round(concentration * sample.flow_mgd * cf, 4)

    param_name = permit_limit.parameter.name if permit_limit and permit_limit.parameter else f"limit {permit_limit_id}"
    result = SampleResult(
        sample_id            = sample_id,
        permit_limit_id      = permit_limit_id,
        concentration_result = concentration,
        loading_result       = loading,
    )
    db.session.add(result)
    audit(
        "Added sample result",
        table_name = "tbl_sample_results",
        record_id  = sample_id,
        details    = f"Sample #{sample_id} | Parameter: {param_name} | Value: {concentration} mg/L",
    )
    db.session.commit()

    # Re-run compliance
    violation_ids = [v.id for v in Violation.query.filter_by(sample_id=sample_id).all()]
    if violation_ids:
        EnforcementHistory.query.filter(
            EnforcementHistory.violation_id.in_(violation_ids)
        ).delete(synchronize_session=False)
    Violation.query.filter_by(sample_id=sample_id).delete(synchronize_session=False)
    db.session.commit()
    violations = check_compliance(sample)

    return jsonify({
        "result_id":  result.id,
        "violations": [v.to_dict() for v in violations],
    }), 201


@samples_bp.route("/<int:sample_id>/corrections", methods=["GET"])
@login_required
def get_corrections(sample_id):
    """Return audit log entries for this sample — correction history."""
    logs = (AuditLog.query
            .filter_by(table_name="tbl_sample", record_id=sample_id)
            .order_by(AuditLog.timestamp.desc())
            .all())
    return jsonify([{
        "id":        l.id,
        "username":  l.user.username if l.user else "deleted user",
        "action":    l.action,
        "details":   l.details,
        "timestamp": l.timestamp.isoformat() if l.timestamp else None,
    } for l in logs]), 200


@samples_bp.route("/<int:sample_id>/review", methods=["POST"])
@login_required
@roles_required("admin", "coordinator")
def review_sample(sample_id):
    from models import EnforcementHistory
    sample = Sample.query.get_or_404(sample_id)
    data   = request.get_json()
    sample.review_status  = "reviewed"
    sample.review_comment = data.get("comment", "")
    sample.reviewed_by    = current_user.id
    sample.reviewed_at    = datetime.utcnow()
    audit(
        "Reviewed sample",
        table_name = "tbl_sample",
        record_id  = sample_id,
        details    = f"Sample #{sample_id} dated {sample.sample_date} marked reviewed. Comment: {sample.review_comment or '(none)'}",
    )
    db.session.commit()

    # Re-run compliance against current results so stale violations are cleared
    violation_ids = [v.id for v in Violation.query.filter_by(sample_id=sample_id).all()]
    if violation_ids:
        EnforcementHistory.query.filter(
            EnforcementHistory.violation_id.in_(violation_ids)
        ).delete(synchronize_session=False)
    Violation.query.filter_by(sample_id=sample_id).delete(synchronize_session=False)
    db.session.commit()

    violations = check_compliance(sample)
    enforcement_actions = []
    for v in violations:
        action = generate_enforcement_response(v)
        if action:
            enforcement_actions.append(action.to_dict())

    return jsonify({
        "sample":              sample.to_dict(),
        "violations":          [v.to_dict() for v in violations],
        "enforcement_actions": enforcement_actions,
    }), 200
