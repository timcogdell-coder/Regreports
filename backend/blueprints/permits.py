from datetime import date, timedelta
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import db, Permit, PermitLimit, Company, SampleResult, Violation
from utils.decorators import roles_required
from utils.audit import audit

permits_bp = Blueprint("permits", __name__)


@permits_bp.route("/expiring", methods=["GET"])
@login_required
@roles_required("admin", "coordinator")
def expiring_permits():
    today = date.today()
    threshold = today + timedelta(days=90)
    permits = (Permit.query
               .filter(Permit.is_active == True, Permit.expiration_date <= threshold)
               .order_by(Permit.expiration_date.asc())
               .all())
    result = []
    for p in permits:
        company = Company.query.get(p.company_id)
        days_remaining = (p.expiration_date - today).days
        d = p.to_dict()
        d["company_name"] = company.name if company else "Unknown"
        d["days_remaining"] = days_remaining
        result.append(d)
    return jsonify(result), 200


@permits_bp.route("", methods=["GET"])
@login_required
def list_permits():
    if current_user.role == "iu":
        permits = (Permit.query
                   .filter_by(company_id=current_user.company_id)
                   .filter(Permit.is_active != False)
                   .all())
    else:
        permits = Permit.query.filter(Permit.is_active != False).all()
    return jsonify([p.to_dict() for p in permits]), 200


@permits_bp.route("", methods=["POST"])
@login_required
@roles_required("admin")
def create_permit():
    data = request.get_json()
    required = ["company_id", "permit_number", "effective_date", "expiration_date"]
    if not all(data.get(f) for f in required):
        return jsonify({"error": "Missing required fields"}), 400

    copy_from_id = data.get("copy_from_permit_id")

    # Allow same permit number only when renewing (superseding) an existing permit
    existing = Permit.query.filter_by(permit_number=data["permit_number"], is_active=True).first()
    if existing and not copy_from_id:
        return jsonify({"error": "Permit number already exists"}), 409

    # Deactivate the old permit being superseded
    if existing:
        existing.is_active = False

    permit = Permit(
        company_id      = data["company_id"],
        permit_number   = data["permit_number"],
        effective_date  = data["effective_date"],
        expiration_date = data["expiration_date"],
        facility_id     = data.get("facility_id"),
    )
    db.session.add(permit)
    db.session.flush()  # get permit.id before copying limits

    # Copy limits from the superseded permit as a starting point
    if copy_from_id:
        source_limits = PermitLimit.query.filter_by(permit_id=copy_from_id).all()
        for l in source_limits:
            db.session.add(PermitLimit(
                permit_id                   = permit.id,
                parameter_id                = l.parameter_id,
                daily_max_concentration     = l.daily_max_concentration,
                daily_max_loading           = l.daily_max_loading,
                weekly_max_concentration    = l.weekly_max_concentration,
                weekly_max_loading          = l.weekly_max_loading,
                monthly_avg_concentration   = l.monthly_avg_concentration,
                monthly_avg_loading         = l.monthly_avg_loading,
                frequency_id                = l.frequency_id,
                sample_type                 = l.sample_type,
                is_monitor_report           = l.is_monitor_report,
                daily_max_is_mr             = l.daily_max_is_mr,
                weekly_max_is_mr            = l.weekly_max_is_mr,
                monthly_avg_is_mr           = l.monthly_avg_is_mr,
                is_range_limit              = l.is_range_limit,
                min_value                   = l.min_value,
                max_value                   = l.max_value,
                range_unit                  = l.range_unit,
                is_flow_limit               = l.is_flow_limit,
                averaging_period            = l.averaging_period,
            ))

    company = Company.query.get(data["company_id"])
    audit(
        "Created permit",
        table_name = "tbl_permits",
        record_id  = permit.id,
        details    = (
            f"Permit {permit.permit_number} | "
            f"Company: {company.name if company else data['company_id']} | "
            f"{permit.effective_date} → {permit.expiration_date}"
            + (f" | Copied limits from permit #{copy_from_id}" if copy_from_id else "")
        ),
    )
    db.session.commit()
    return jsonify(permit.to_dict()), 201


@permits_bp.route("/<int:permit_id>", methods=["PUT"])
@login_required
@roles_required("admin")
def update_permit(permit_id):
    permit = Permit.query.get_or_404(permit_id)
    data = request.get_json()
    new_number = data.get("permit_number", permit.permit_number)
    if new_number != permit.permit_number:
        if Permit.query.filter_by(permit_number=new_number).first():
            return jsonify({"error": "Permit number already exists"}), 409
    permit.permit_number   = new_number
    permit.effective_date  = data.get("effective_date",  permit.effective_date)
    permit.expiration_date = data.get("expiration_date", permit.expiration_date)
    audit(
        "Updated permit",
        table_name = "tbl_permits",
        record_id  = permit_id,
        details    = f"Permit {permit.permit_number} | {permit.effective_date} → {permit.expiration_date}",
    )
    db.session.commit()
    return jsonify(permit.to_dict()), 200


@permits_bp.route("/<int:permit_id>", methods=["GET"])
@login_required
def get_permit(permit_id):
    permit = Permit.query.get_or_404(permit_id)
    result = permit.to_dict()
    result["limits"] = [l.to_dict() for l in permit.limits]
    return jsonify(result), 200


@permits_bp.route("/<int:permit_id>/limits", methods=["POST"])
@login_required
@roles_required("admin")
def add_limit(permit_id):
    Permit.query.get_or_404(permit_id)
    data = request.get_json()

    limit = PermitLimit(
        permit_id                   = permit_id,
        parameter_id                = data["parameter_id"],
        daily_max_concentration     = data.get("daily_max_concentration"),
        daily_max_loading           = data.get("daily_max_loading"),
        weekly_max_concentration    = data.get("weekly_max_concentration"),
        weekly_max_loading          = data.get("weekly_max_loading"),
        monthly_avg_concentration   = data.get("monthly_avg_concentration"),
        monthly_avg_loading         = data.get("monthly_avg_loading"),
        frequency_id                = data.get("frequency_id"),
        limit_type_id               = data.get("limit_type_id"),
        sample_type                 = data.get("sample_type"),
        is_monitor_report           = bool(data.get("is_monitor_report", False)),
        daily_max_is_mr             = bool(data.get("daily_max_is_mr", False)),
        weekly_max_is_mr            = bool(data.get("weekly_max_is_mr", False)),
        monthly_avg_is_mr           = bool(data.get("monthly_avg_is_mr", False)),
        is_range_limit              = bool(data.get("is_range_limit", False)),
        min_value                   = data.get("min_value"),
        max_value                   = data.get("max_value"),
        range_unit                  = data.get("range_unit", "s.u."),
        is_flow_limit               = bool(data.get("is_flow_limit", False)),
        averaging_period            = data.get("averaging_period"),
    )
    db.session.add(limit)
    param_name = limit.parameter.name if limit.parameter else f"param {data['parameter_id']}"
    audit(
        "Added permit limit",
        table_name = "tbl_permit_limits",
        record_id  = permit_id,
        details    = f"Permit #{permit_id} | Parameter: {param_name}",
    )
    db.session.commit()
    return jsonify(limit.to_dict()), 201


@permits_bp.route("/<int:permit_id>/limits/batch", methods=["POST"])
@login_required
@roles_required("admin")
def add_limits_batch(permit_id):
    Permit.query.get_or_404(permit_id)
    items = request.get_json()
    if not isinstance(items, list) or len(items) == 0:
        return jsonify({"error": "Expected a non-empty array of limits"}), 400

    created, errors = [], []
    for i, data in enumerate(items):
        if not data.get("parameter_id"):
            errors.append({"index": i, "error": "parameter_id required"})
            continue
        limit = PermitLimit(
            permit_id                   = permit_id,
            parameter_id                = data["parameter_id"],
            daily_max_concentration     = data.get("daily_max_concentration"),
            daily_max_loading           = data.get("daily_max_loading"),
            weekly_max_concentration    = data.get("weekly_max_concentration"),
            weekly_max_loading          = data.get("weekly_max_loading"),
            monthly_avg_concentration   = data.get("monthly_avg_concentration"),
            monthly_avg_loading         = data.get("monthly_avg_loading"),
            frequency_id                = data.get("frequency_id"),
            sample_type                 = data.get("sample_type"),
            is_monitor_report           = bool(data.get("is_monitor_report", False)),
            daily_max_is_mr             = bool(data.get("daily_max_is_mr", False)),
            weekly_max_is_mr            = bool(data.get("weekly_max_is_mr", False)),
            monthly_avg_is_mr           = bool(data.get("monthly_avg_is_mr", False)),
            is_range_limit              = bool(data.get("is_range_limit", False)),
            min_value                   = data.get("min_value"),
            max_value                   = data.get("max_value"),
            range_unit                  = data.get("range_unit", "s.u."),
            is_flow_limit               = bool(data.get("is_flow_limit", False)),
            averaging_period            = data.get("averaging_period"),
        )
        db.session.add(limit)
        created.append(limit)

    audit(
        "Added permit limits (batch)",
        table_name = "tbl_permit_limits",
        record_id  = permit_id,
        details    = f"Permit #{permit_id} | {len(created)} limit(s) added",
    )
    db.session.commit()
    return jsonify({
        "created": [l.to_dict() for l in created],
        "errors":  errors,
    }), 201


@permits_bp.route("/<int:permit_id>/limits/<int:limit_id>", methods=["PUT"])
@login_required
@roles_required("admin")
def update_limit(permit_id, limit_id):
    from models import EnforcementHistory
    limit = PermitLimit.query.filter_by(id=limit_id, permit_id=permit_id).first_or_404()
    data = request.get_json()

    # Capture thresholds before update so we can detect removals
    old_daily_max_conc   = limit.daily_max_concentration
    old_weekly_max_conc  = limit.weekly_max_concentration
    old_monthly_avg_conc = limit.monthly_avg_concentration

    limit.parameter_id              = data.get("parameter_id",              limit.parameter_id)
    limit.daily_max_concentration   = data.get("daily_max_concentration",   limit.daily_max_concentration)
    limit.daily_max_loading         = data.get("daily_max_loading",         limit.daily_max_loading)
    limit.weekly_max_concentration  = data.get("weekly_max_concentration",  limit.weekly_max_concentration)
    limit.weekly_max_loading        = data.get("weekly_max_loading",        limit.weekly_max_loading)
    limit.monthly_avg_concentration = data.get("monthly_avg_concentration", limit.monthly_avg_concentration)
    limit.monthly_avg_loading       = data.get("monthly_avg_loading",       limit.monthly_avg_loading)
    limit.frequency_id              = data.get("frequency_id",              limit.frequency_id)
    limit.sample_type               = data.get("sample_type",               limit.sample_type)
    limit.is_monitor_report         = bool(data.get("is_monitor_report",    limit.is_monitor_report))
    limit.daily_max_is_mr           = bool(data.get("daily_max_is_mr",      limit.daily_max_is_mr or False))
    limit.weekly_max_is_mr          = bool(data.get("weekly_max_is_mr",     limit.weekly_max_is_mr or False))
    limit.monthly_avg_is_mr         = bool(data.get("monthly_avg_is_mr",    limit.monthly_avg_is_mr or False))
    limit.is_range_limit            = bool(data.get("is_range_limit",        limit.is_range_limit))
    limit.min_value                 = data.get("min_value",                  limit.min_value)
    limit.max_value                 = data.get("max_value",                  limit.max_value)
    limit.range_unit                = data.get("range_unit",                 limit.range_unit or "s.u.")
    limit.is_flow_limit             = bool(data.get("is_flow_limit",         limit.is_flow_limit or False))
    limit.averaging_period          = data.get("averaging_period",           limit.averaging_period)

    # When a concentration threshold is removed, delete violations that were based on it.
    # They are stale: the limit no longer exists, so the exceedance is no longer valid.
    # Any genuine loading-based avg_exceeds will be recreated on the next compliance run.
    stale_types = set()
    if old_daily_max_conc  is not None and (limit.daily_max_concentration  is None or limit.daily_max_is_mr):
        stale_types.add("max_exceeds")
    if old_weekly_max_conc is not None and (limit.weekly_max_concentration is None or limit.weekly_max_is_mr):
        stale_types.add("weekly_avg_exceeds")
    if old_monthly_avg_conc is not None and (limit.monthly_avg_concentration is None or limit.monthly_avg_is_mr):
        stale_types.add("avg_exceeds")

    if stale_types:
        stale_viols = Violation.query.filter(
            Violation.permit_limit_id == limit_id,
            Violation.violation_type.in_(stale_types),
        ).all()
        if stale_viols:
            vids = [v.id for v in stale_viols]
            EnforcementHistory.query.filter(
                EnforcementHistory.violation_id.in_(vids)
            ).delete(synchronize_session=False)
            Violation.query.filter(Violation.id.in_(vids)).delete(synchronize_session=False)

    param_name = limit.parameter.name if limit.parameter else f"limit {limit_id}"
    audit(
        "Updated permit limit",
        table_name = "tbl_permit_limits",
        record_id  = limit_id,
        details    = f"Permit #{permit_id} | Parameter: {param_name}",
    )
    db.session.commit()
    return jsonify(limit.to_dict()), 200


@permits_bp.route("/<int:permit_id>/limits/<int:limit_id>", methods=["DELETE"])
@login_required
@roles_required("admin")
def delete_limit(permit_id, limit_id):
    from models import EnforcementHistory
    limit = PermitLimit.query.filter_by(id=limit_id, permit_id=permit_id).first()
    if not limit:
        return jsonify({"error": "Limit not found"}), 404

    # Count affected sample results so the caller can inform the user
    result_count = SampleResult.query.filter_by(permit_limit_id=limit_id).count()

    # Delete in FK order: enforcement → violations → sample results → limit
    violation_ids = [v.id for v in Violation.query.filter_by(permit_limit_id=limit_id).all()]
    if violation_ids:
        EnforcementHistory.query.filter(
            EnforcementHistory.violation_id.in_(violation_ids)
        ).delete(synchronize_session=False)

    Violation.query.filter_by(permit_limit_id=limit_id).delete(synchronize_session=False)
    SampleResult.query.filter_by(permit_limit_id=limit_id).delete(synchronize_session=False)
    param_name = limit.parameter.name if limit.parameter else f"limit {limit_id}"
    PermitLimit.query.filter_by(id=limit_id).delete(synchronize_session=False)
    audit(
        "Deleted permit limit",
        table_name = "tbl_permit_limits",
        record_id  = limit_id,
        details    = f"Permit #{permit_id} | Parameter: {param_name} | {result_count} sample result(s) removed",
    )
    db.session.commit()

    return jsonify({"deleted": limit_id, "sample_results_removed": result_count}), 200
