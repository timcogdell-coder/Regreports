from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import db, User, Company, Parameter, Frequency, FlowMeter, MeterReading, AuditLog
from models import Permit, PermitLimit, Sample, SampleResult, Violation, EnforcementHistory, SurchargeCalculation
from utils.decorators import roles_required
from utils.audit import audit

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/users", methods=["GET"])
@login_required
@roles_required("admin")
def list_users():
    users = User.query.filter_by(is_active=True).all()
    return jsonify([u.to_dict() for u in users]), 200


@admin_bp.route("/users", methods=["POST"])
@login_required
@roles_required("admin")
def create_user():
    data = request.get_json()
    required = ["username", "email", "password", "role"]
    if not all(data.get(f) for f in required):
        return jsonify({"error": "Missing required fields"}), 400

    if User.query.filter_by(username=data["username"]).first():
        return jsonify({"error": "Username already exists"}), 409

    user = User(
        username    = data["username"],
        email       = data["email"],
        role        = data["role"],
        company_id  = data.get("company_id"),
    )
    user.set_password(data["password"])
    db.session.add(user)
    audit(
        "Created user",
        table_name = "tbl_users",
        details    = f"Username: {user.username} | Role: {user.role} | Company ID: {user.company_id}",
    )
    db.session.commit()
    return jsonify(user.to_dict()), 201


@admin_bp.route("/users/<int:user_id>", methods=["PUT"])
@login_required
@roles_required("admin")
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json()

    new_username = data.get("username", user.username)
    if new_username != user.username and User.query.filter_by(username=new_username).first():
        return jsonify({"error": "Username already exists"}), 409

    user.username   = new_username
    user.email      = data.get("email", user.email)
    user.role       = data.get("role", user.role)
    user.company_id = data.get("company_id", user.company_id)
    pwd_changed = bool(data.get("password"))
    if pwd_changed:
        user.set_password(data["password"])
    audit(
        "Updated user",
        table_name = "tbl_users",
        record_id  = user_id,
        details    = f"Username: {user.username} | Role: {user.role}" + (" | Password changed" if pwd_changed else ""),
    )
    db.session.commit()
    return jsonify(user.to_dict()), 200


@admin_bp.route("/companies", methods=["GET"])
@login_required
def list_companies():
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    query = Company.query if include_inactive else Company.query.filter_by(is_active=True)
    companies = query.order_by(Company.name).all()
    return jsonify([c.to_dict() for c in companies]), 200


@admin_bp.route("/companies", methods=["POST"])
@login_required
@roles_required("admin")
def create_company():
    data = request.get_json()
    if not data.get("name"):
        return jsonify({"error": "Company name required"}), 400

    company = Company(
        name            = data["name"],
        contact_person  = data.get("contact_person"),
        phone           = data.get("phone"),
        email           = data.get("email"),
        address         = data.get("address"),
    )
    db.session.add(company)
    audit(
        "Created company",
        table_name = "tbl_company",
        details    = f"Name: {company.name}",
    )
    db.session.commit()
    return jsonify(company.to_dict()), 201


@admin_bp.route("/companies/<int:company_id>", methods=["PUT"])
@login_required
@roles_required("admin")
def update_company(company_id):
    company = Company.query.get_or_404(company_id)
    data = request.get_json()
    company.name            = data.get("name",            company.name)
    company.contact_person  = data.get("contact_person",  company.contact_person)
    company.phone           = data.get("phone",           company.phone)
    company.email           = data.get("email",           company.email)
    company.address         = data.get("address",         company.address)
    if "is_active" in data:
        company.is_active   = bool(data["is_active"])
    audit(
        "Updated company",
        table_name = "tbl_company",
        record_id  = company_id,
        details    = f"Name: {company.name} | Active: {company.is_active}",
    )
    db.session.commit()
    return jsonify(company.to_dict()), 200


@admin_bp.route("/companies/<int:company_id>/dependents", methods=["GET"])
@login_required
@roles_required("admin")
def company_dependents(company_id):
    Company.query.get_or_404(company_id)
    permit_ids = [p.id for p in Permit.query.filter_by(company_id=company_id).all()]
    limit_ids  = [l.id for l in PermitLimit.query.filter(PermitLimit.permit_id.in_(permit_ids)).all()] if permit_ids else []
    return jsonify({
        "permits":         Permit.query.filter_by(company_id=company_id).count(),
        "samples":         Sample.query.filter_by(company_id=company_id).count(),
        "violations":      Violation.query.filter_by(company_id=company_id).count(),
        "sample_results":  SampleResult.query.filter(SampleResult.permit_limit_id.in_(limit_ids)).count() if limit_ids else 0,
        "surcharge_records": SurchargeCalculation.query.filter_by(company_id=company_id).count(),
        "users":           User.query.filter_by(company_id=company_id).count(),
        "meters":          FlowMeter.query.filter_by(company_id=company_id).count(),
    }), 200


@admin_bp.route("/companies/<int:company_id>", methods=["DELETE"])
@login_required
@roles_required("admin")
def delete_company(company_id):
    company = Company.query.get_or_404(company_id)
    permit_ids = [p.id for p in Permit.query.filter_by(company_id=company_id).all()]
    limit_ids  = [l.id for l in PermitLimit.query.filter(PermitLimit.permit_id.in_(permit_ids)).all()] if permit_ids else []
    sample_ids = [s.id for s in Sample.query.filter_by(company_id=company_id).all()]

    violation_ids = [v.id for v in Violation.query.filter_by(company_id=company_id).all()]
    if violation_ids:
        EnforcementHistory.query.filter(EnforcementHistory.violation_id.in_(violation_ids)).delete(synchronize_session=False)
    Violation.query.filter_by(company_id=company_id).delete(synchronize_session=False)

    if limit_ids:
        SampleResult.query.filter(SampleResult.permit_limit_id.in_(limit_ids)).delete(synchronize_session=False)
    if sample_ids:
        SampleResult.query.filter(SampleResult.sample_id.in_(sample_ids)).delete(synchronize_session=False)
    Sample.query.filter_by(company_id=company_id).delete(synchronize_session=False)

    if limit_ids:
        PermitLimit.query.filter(PermitLimit.id.in_(limit_ids)).delete(synchronize_session=False)
    Permit.query.filter_by(company_id=company_id).delete(synchronize_session=False)

    FlowMeter.query.filter_by(company_id=company_id).delete(synchronize_session=False)
    SurchargeCalculation.query.filter_by(company_id=company_id).delete(synchronize_session=False)
    # Null out audit log entries for users being deleted so FK doesn't block
    user_ids = [u.id for u in User.query.filter_by(company_id=company_id).all()]
    if user_ids:
        AuditLog.query.filter(AuditLog.user_id.in_(user_ids)).update({"user_id": None}, synchronize_session=False)
    User.query.filter_by(company_id=company_id).delete(synchronize_session=False)
    company_name = company.name
    db.session.delete(company)
    audit(
        "Deleted company",
        table_name = "tbl_company",
        record_id  = company_id,
        details    = f"Name: {company_name} — all associated data removed",
    )
    db.session.commit()
    return jsonify({"deleted": company_id}), 200


@admin_bp.route("/audit-log", methods=["GET"])
@login_required
@roles_required("admin")
def list_audit_log():
    limit  = request.args.get("limit",  100, type=int)
    offset = request.args.get("offset", 0,   type=int)
    logs = (AuditLog.query
            .order_by(AuditLog.timestamp.desc())
            .limit(limit).offset(offset).all())
    return jsonify([l.to_dict() for l in logs]), 200


@admin_bp.route("/parameters", methods=["GET"])
@login_required
def list_parameters():
    params = Parameter.query.all()
    return jsonify([p.to_dict() for p in params]), 200


@admin_bp.route("/parameters", methods=["POST"])
@login_required
@roles_required("admin")
def create_parameter():
    data = request.get_json()
    if not data.get("name") or not data.get("abbreviation"):
        return jsonify({"error": "name and abbreviation are required"}), 400
    if Parameter.query.filter_by(abbreviation=data["abbreviation"]).first():
        return jsonify({"error": f"Abbreviation '{data['abbreviation']}' already exists"}), 409
    param = Parameter(
        name                = data["name"],
        abbreviation        = data["abbreviation"].upper(),
        conversion_factor   = float(data.get("conversion_factor") or 8.34),
    )
    db.session.add(param)
    audit(
        "Created parameter",
        table_name = "tbl_parameters",
        details    = f"Name: {param.name} | Abbreviation: {param.abbreviation}",
    )
    db.session.commit()
    return jsonify(param.to_dict()), 201


@admin_bp.route("/frequencies", methods=["GET"])
@login_required
def list_frequencies():
    freqs = Frequency.query.order_by(Frequency.id).all()
    return jsonify([{"id": f.id, "frequency_code": f.frequency_code,
                     "description": f.description} for f in freqs]), 200



@admin_bp.route("/meters", methods=["GET"])
@login_required
def list_meters():
    company_id = request.args.get("company_id", type=int)
    query = FlowMeter.query
    if company_id:
        query = query.filter_by(company_id=company_id)
    return jsonify([m.to_dict() for m in query.all()]), 200


@admin_bp.route("/meters", methods=["POST"])
@login_required
@roles_required("admin")
def create_meter():
    data = request.get_json()
    if not data.get("company_id") or not data.get("meter_id"):
        return jsonify({"error": "company_id and meter_id required"}), 400
    # Deactivate existing active meters for this company if new one is active
    new_type = data.get("meter_type", "process")
    if data.get("is_active", True):
        FlowMeter.query.filter_by(company_id=data["company_id"], is_active=True, meter_type=new_type).update({"is_active": False})
    meter = FlowMeter(
        company_id        = data["company_id"],
        meter_id          = data["meter_id"],
        description       = data.get("description"),
        pulse_factor      = float(data.get("pulse_factor", 1.0)),
        unit              = data.get("unit", "gallons"),
        meter_type        = data.get("meter_type", "process"),
        is_active         = data.get("is_active", True),
    )
    db.session.add(meter)
    audit(
        "Created flow meter",
        table_name = "tbl_flow_meters",
        details    = f"Meter ID: {meter.meter_id} | Company ID: {meter.company_id} | Type: {meter.meter_type}",
    )
    db.session.commit()
    return jsonify(meter.to_dict()), 201


@admin_bp.route("/meters/<int:meter_id>", methods=["PUT"])
@login_required
@roles_required("admin")
def update_meter(meter_id):
    meter = FlowMeter.query.get_or_404(meter_id)
    data  = request.get_json()
    new_type = data.get("meter_type", meter.meter_type or "process")
    if data.get("is_active") and not meter.is_active:
        # Only deactivate other meters of the same type — process and sanitary are independent
        FlowMeter.query.filter_by(company_id=meter.company_id, is_active=True, meter_type=new_type).update({"is_active": False})
    meter.meter_id      = data.get("meter_id",     meter.meter_id)
    meter.description   = data.get("description",  meter.description)
    meter.pulse_factor  = float(data.get("pulse_factor", meter.pulse_factor))
    meter.unit          = data.get("unit",          meter.unit or "gallons")
    meter.meter_type    = new_type
    meter.is_active     = data.get("is_active",     meter.is_active)
    audit(
        "Updated flow meter",
        table_name = "tbl_flow_meters",
        record_id  = meter_id,
        details    = f"Meter ID: {meter.meter_id} | Active: {meter.is_active}",
    )
    db.session.commit()
    return jsonify(meter.to_dict()), 200


@admin_bp.route("/meters/readings", methods=["GET"])
@login_required
def list_meter_readings():
    from flask_login import current_user
    company_id = request.args.get("company_id", type=int)
    if current_user.role == "iu":
        company_id = current_user.company_id
    meters = FlowMeter.query.filter_by(company_id=company_id).all() if company_id else FlowMeter.query.all()
    meter_ids = [m.id for m in meters]
    meter_info = {m.id: m for m in meters}
    readings = (
        MeterReading.query
        .filter(MeterReading.meter_id.in_(meter_ids))
        .order_by(MeterReading.reading_date.desc())
        .limit(200)
        .all()
    )
    result = []
    for r in readings:
        m  = meter_info.get(r.meter_id)
        pf = (m.pulse_factor or 1.0) if m else 1.0
        unit = (m.unit or "gallons") if m else "gallons"
        gallons = (r.reading_end - r.reading_start) * pf  # always gallons
        volume_mg = gallons / 1_000_000
        # unit is display preference only — CF = gallons / 7.48052
        volume_native = (gallons / 7.48052) if unit == "cubic_feet" else volume_mg
        d = r.to_dict()
        d["volume_native"] = round(volume_native, 4)
        d["volume_mg"]     = round(volume_mg,     6)
        d["pulse_factor"]  = pf
        d["unit"]          = unit
        d["meter_type"]    = (m.meter_type or "process") if m else "process"
        d["meter_label"]   = m.meter_id if m else str(r.meter_id)
        d["company_id"]    = m.company_id if m else None
        result.append(d)
    return jsonify(result), 200


@admin_bp.route("/meters/readings", methods=["POST"])
@login_required
@roles_required("admin", "coordinator")
def create_meter_reading():
    data = request.get_json()
    required = ["meter_id", "reading_start", "reading_end", "reading_date"]
    if not all(k in data for k in required):
        return jsonify({"error": "Missing required fields"}), 400
    reading = MeterReading(
        meter_id             = data["meter_id"],
        reading_start        = float(data["reading_start"]),
        reading_end          = float(data["reading_end"]),
        reading_purpose      = "monthly",
        reading_date         = data["reading_date"],
        sampling_period_days = int(data["sampling_period_days"]) if data.get("sampling_period_days") else None,
    )
    db.session.add(reading)
    audit(
        "Created meter reading",
        table_name = "tbl_meter_readings",
        details    = f"Meter #{data['meter_id']} | Date: {data['reading_date']} | {data['reading_start']} → {data['reading_end']}",
    )
    db.session.commit()
    return jsonify(reading.to_dict()), 201


@admin_bp.route("/meters/readings/<int:reading_id>", methods=["PUT"])
@login_required
@roles_required("admin")
def update_meter_reading(reading_id):
    reading = MeterReading.query.get_or_404(reading_id)
    data = request.get_json()
    if "meter_id" in data:
        if not FlowMeter.query.get(data["meter_id"]):
            return jsonify({"error": "Meter not found"}), 404
        reading.meter_id = data["meter_id"]
    if "reading_start" in data:
        reading.reading_start = float(data["reading_start"])
    if "reading_end" in data:
        reading.reading_end = float(data["reading_end"])
    if "reading_date" in data:
        reading.reading_date = data["reading_date"]
    if "sampling_period_days" in data:
        reading.sampling_period_days = int(data["sampling_period_days"])
    audit(
        "Updated meter reading",
        table_name = "tbl_meter_readings",
        record_id  = reading_id,
        details    = f"Meter #{reading.meter_id} | Date: {reading.reading_date} | {reading.reading_start} → {reading.reading_end}",
    )
    db.session.commit()
    return jsonify(reading.to_dict()), 200


@admin_bp.route("/meters/readings/<int:reading_id>", methods=["DELETE"])
@login_required
@roles_required("admin")
def delete_meter_reading(reading_id):
    reading = MeterReading.query.get_or_404(reading_id)
    audit(
        "Deleted meter reading",
        table_name = "tbl_meter_readings",
        record_id  = reading_id,
        details    = f"Meter #{reading.meter_id} | Date: {reading.reading_date}",
    )
    db.session.delete(reading)
    db.session.commit()
    return jsonify({"deleted": reading_id}), 200


@admin_bp.route("/meters/last-reading", methods=["GET"])
@login_required
def last_meter_reading():
    from flask_login import current_user
    company_id  = request.args.get("company_id", type=int)
    meter_type  = request.args.get("meter_type", "process")
    if current_user.role == "iu":
        company_id = current_user.company_id
    meter = FlowMeter.query.filter_by(company_id=company_id, is_active=True, meter_type=meter_type).first()
    if not meter:
        return jsonify(None), 200
    reading = (
        MeterReading.query
        .filter_by(meter_id=meter.id)
        .order_by(MeterReading.reading_date.desc(), MeterReading.id.desc())
        .first()
    )
    if not reading:
        return jsonify(None), 200
    pf      = meter.pulse_factor or 1.0
    unit    = meter.unit or "gallons"
    gallons = (reading.reading_end - reading.reading_start) * pf
    volume_mg     = gallons / 1_000_000
    volume_native = (gallons / 7.48052) if unit == "cubic_feet" else volume_mg
    d  = reading.to_dict()
    d["volume_native"] = round(volume_native, 4)
    d["volume_mg"]     = round(volume_mg,     6)
    d["pulse_factor"]  = pf
    d["unit"]          = unit
    d["meter_type"]    = meter.meter_type or "process"
    d["meter_label"]   = meter.meter_id
    return jsonify(d), 200


@admin_bp.route("/config/potw", methods=["GET"])
@login_required
def potw_config():
    from flask import current_app
    return jsonify({
        "bod_rate":         current_app.config["BOD_RATE"],
        "tss_rate":         current_app.config["TSS_RATE"],
        "color_rate":       current_app.config["COLOR_RATE"],
        "conversion_factor": current_app.config["CONVERSION_FACTOR"],
    }), 200
