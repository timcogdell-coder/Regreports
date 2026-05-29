from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import db, MonthlyFlowReport, FlowMeter, MeterReading
from engines.compliance_engine import check_flow_compliance
from engines.erg_engine import generate_enforcement_response
from utils.decorators import roles_required
from utils.audit import audit

flow_reports_bp = Blueprint("flow_reports", __name__)


@flow_reports_bp.route("", methods=["GET"])
@login_required
def list_flow_reports():
    company_id = request.args.get("company_id", type=int)
    if current_user.role == "iu":
        if not current_user.company_id:
            return jsonify({"error": "No company assigned to this account"}), 400
        company_id = current_user.company_id
    q = MonthlyFlowReport.query
    if company_id:
        q = q.filter_by(company_id=company_id)
    reports = q.order_by(
        MonthlyFlowReport.report_year.desc(),
        MonthlyFlowReport.report_month.desc(),
    ).limit(36).all()
    return jsonify([r.to_dict() for r in reports]), 200


@flow_reports_bp.route("/last-end-reading", methods=["GET"])
@login_required
def last_end_reading():
    """
    Return the end_read from the most recent monthly flow report for this company,
    so the new report's beginning_read can be pre-populated.
    Falls back to the most recent meter reading's reading_end if no report exists.
    """
    company_id = request.args.get("company_id", type=int)
    if current_user.role == "iu":
        company_id = current_user.company_id
    if not company_id:
        return jsonify(None), 200

    last_report = (
        MonthlyFlowReport.query
        .filter_by(company_id=company_id)
        .order_by(MonthlyFlowReport.report_year.desc(), MonthlyFlowReport.report_month.desc())
        .first()
    )
    if last_report:
        meter = last_report.meter
        return jsonify({
            "end_read":     last_report.end_read,
            "from_month":   last_report.report_month,
            "from_year":    last_report.report_year,
            "source":       "monthly_report",
            "meter_id":     last_report.meter_id,
            "meter_label":  meter.meter_id if meter else None,
            "pulse_factor": (meter.pulse_factor or 1.0) if meter else 1.0,
        }), 200

    # Fall back to last meter reading (any purpose)
    meter = FlowMeter.query.filter_by(company_id=company_id, is_active=True, meter_type="process").first()
    if meter:
        last_mr = (
            MeterReading.query
            .filter_by(meter_id=meter.id)
            .order_by(MeterReading.reading_date.desc(), MeterReading.id.desc())
            .first()
        )
        if last_mr:
            return jsonify({
                "end_read":     last_mr.reading_end,
                "from_month":   None,
                "from_year":    None,
                "source":       "meter_reading",
                "meter_id":     meter.id,
                "meter_label":  meter.meter_id,
                "pulse_factor": meter.pulse_factor or 1.0,
            }), 200

    # No meter readings at all — still return meter info so the form can warn
    meter = FlowMeter.query.filter_by(company_id=company_id, is_active=True, meter_type="process").first()
    return jsonify({
        "end_read":     None,
        "source":       "none",
        "meter_id":     meter.id if meter else None,
        "meter_label":  meter.meter_id if meter else None,
        "pulse_factor": (meter.pulse_factor or 1.0) if meter else None,
    }), 200


@flow_reports_bp.route("", methods=["POST"])
@login_required
def create_flow_report():
    data = request.get_json()
    if not all(k in data for k in ["report_month", "report_year", "period_days"]):
        return jsonify({"error": "Missing required fields"}), 400

    company_id = current_user.company_id if current_user.role == "iu" else data.get("company_id")
    if not company_id:
        return jsonify({"error": "company_id required"}), 400

    report_month = int(data["report_month"])
    report_year  = int(data["report_year"])
    days         = int(data["period_days"])
    method       = data.get("measurement_method", "meter")

    MONTH_NAMES = ["January","February","March","April","May","June",
                   "July","August","September","October","November","December"]

    # Prevent duplicate reports for the same month/year
    existing = MonthlyFlowReport.query.filter_by(
        company_id=company_id, report_month=report_month, report_year=report_year
    ).first()
    if existing:
        return jsonify({
            "error": f"A flow report for {MONTH_NAMES[report_month - 1]} {report_year} already exists. "
                     f"Contact your coordinator to make corrections."
        }), 409

    # ── Method-specific calculation ───────────────────────────────────────────
    meter = FlowMeter.query.filter_by(company_id=company_id, is_active=True, meter_type="process").first()

    beg = end = tv_op_hours = tv_avg_gpm = None
    total_flow_mg = monthly_avg_mgd = None

    if method == "meter":
        if data.get("beginning_read") is None or data.get("end_read") is None:
            return jsonify({"error": "beginning_read and end_read are required for meter method"}), 400
        pf  = (meter.pulse_factor or 1.0) if meter else 1.0
        beg = float(data["beginning_read"])
        end = float(data["end_read"])
        if end <= beg:
            return jsonify({"error": "End reading must be greater than beginning reading."}), 400
        total_flow_mg   = (end - beg) * pf / 1_000_000
        monthly_avg_mgd = total_flow_mg / days if days > 0 else None

    elif method == "time_volume":
        measurements = data.get("measurements") or []
        if not measurements:
            return jsonify({"error": "At least one measurement is required for time-volume method"}), 400
        tv_op_hours = float(data.get("operating_hours_per_day", 24))
        if tv_op_hours <= 0 or tv_op_hours > 24:
            return jsonify({"error": "Operating hours per day must be between 0 and 24"}), 400
        gpms = []
        for i, m in enumerate(measurements):
            vol  = float(m.get("volume_gal", 0))
            secs = float(m.get("fill_time_sec", 0))
            if vol <= 0 or secs <= 0:
                return jsonify({"error": f"Measurement {i+1}: volume and fill time must be positive"}), 400
            gpms.append(vol / (secs / 60.0))
        tv_avg_gpm      = sum(gpms) / len(gpms)
        # daily discharge volume = avg_gpm × 60 min/hr × operating_hours
        total_flow_mg   = (tv_avg_gpm * 60 * tv_op_hours * days) / 1_000_000
        monthly_avg_mgd = total_flow_mg / days if days > 0 else None

    elif method == "direct":
        tmg  = data.get("total_flow_mg")
        amgd = data.get("monthly_avg_mgd")
        if tmg not in (None, "") and float(tmg) > 0:
            total_flow_mg   = float(tmg)
            monthly_avg_mgd = total_flow_mg / days if days > 0 else None
        elif amgd not in (None, "") and float(amgd) > 0:
            monthly_avg_mgd = float(amgd)
            total_flow_mg   = monthly_avg_mgd * days
        else:
            return jsonify({"error": "Provide either total_flow_mg or monthly_avg_mgd for direct entry"}), 400
    else:
        return jsonify({"error": f"Unknown measurement_method: {method}"}), 400

    report = MonthlyFlowReport(
        company_id         = company_id,
        meter_id           = meter.id if meter else None,
        report_month       = report_month,
        report_year        = report_year,
        period_days        = days,
        measurement_method = method,
        beginning_read     = beg,
        end_read           = end,
        tv_operating_hours = tv_op_hours,
        tv_avg_gpm         = round(tv_avg_gpm, 4) if tv_avg_gpm is not None else None,
        total_flow_mg      = round(total_flow_mg, 6) if total_flow_mg is not None else None,
        monthly_avg_mgd    = round(monthly_avg_mgd, 6) if monthly_avg_mgd is not None else None,
        daily_max_mgd      = float(data["daily_max_mgd"])  if data.get("daily_max_mgd")  not in (None, "") else None,
        weekly_max_mgd     = float(data["weekly_max_mgd"]) if data.get("weekly_max_mgd") not in (None, "") else None,
        submitted_by       = current_user.username,
    )
    db.session.add(report)
    audit(
        "Submitted flow report",
        table_name = "tbl_monthly_flow_reports",
        record_id  = report.id if report.id else None,
        details    = (
            f"Company ID: {company_id} | "
            f"Period: {report_month}/{report_year} | "
            f"Avg: {report.monthly_avg_mgd} MGD | "
            f"Method: {method}"
        ),
    )
    db.session.commit()

    violations = check_flow_compliance(report)
    enforcement_actions = []
    for v in violations:
        action = generate_enforcement_response(v)
        if action:
            enforcement_actions.append(action.to_dict())

    return jsonify({
        "report":             report.to_dict(),
        "violations":         [v.to_dict() for v in violations],
        "enforcement_actions": enforcement_actions,
    }), 201


@flow_reports_bp.route("/<int:report_id>/review", methods=["POST"])
@login_required
@roles_required("admin", "coordinator")
def review_flow_report(report_id):
    report = MonthlyFlowReport.query.get_or_404(report_id)
    data   = request.get_json()
    action = data.get("action", "approve")   # "approve" | "reject"

    if action == "reject":
        comment = (data.get("comment") or "").strip()
        if not comment:
            return jsonify({"error": "A rejection reason is required"}), 400
        report.review_status  = "rejected"
        report.review_comment = comment
        report.reviewed_by    = current_user.id
        report.reviewed_at    = datetime.utcnow()
        audit(
            "Rejected flow report",
            table_name = "tbl_monthly_flow_reports",
            record_id  = report_id,
            details    = f"Company ID: {report.company_id} | Period: {report.report_month}/{report.report_year} | Reason: {comment}",
        )
        db.session.commit()
        return jsonify({"report": report.to_dict(), "violations": [], "enforcement_actions": []}), 200

    # approve
    try:
        report.review_status  = "reviewed"
        report.review_comment = data.get("comment", "")
        report.reviewed_by    = current_user.id
        report.reviewed_at    = datetime.utcnow()
        audit(
            "Approved flow report",
            table_name = "tbl_monthly_flow_reports",
            record_id  = report_id,
            details    = f"Company ID: {report.company_id} | Period: {report.report_month}/{report.report_year} | Avg: {report.monthly_avg_mgd} MGD",
        )
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Failed to save review: {exc}"}), 500

    # Re-run flow compliance now that the data is confirmed
    try:
        violations = check_flow_compliance(report)
    except Exception as exc:
        return jsonify({"error": f"Compliance check failed: {exc}"}), 500

    enforcement_actions = []
    for v in violations:
        ea = generate_enforcement_response(v)
        if ea:
            enforcement_actions.append(ea.to_dict())

    return jsonify({
        "report":             report.to_dict(),
        "violations":         [v.to_dict() for v in violations],
        "enforcement_actions": enforcement_actions,
    }), 200


@flow_reports_bp.route("/<int:report_id>", methods=["DELETE"])
@login_required
def delete_flow_report(report_id):
    from models import Violation, EnforcementHistory
    report = MonthlyFlowReport.query.get_or_404(report_id)

    # IUs may only delete their own rejected reports
    if current_user.role == "iu":
        if report.company_id != current_user.company_id:
            return jsonify({"error": "Forbidden"}), 403
        if report.review_status != "rejected":
            return jsonify({"error": "Only rejected reports can be deleted by the IU"}), 403
    elif current_user.role not in ("admin", "coordinator"):
        return jsonify({"error": "Forbidden"}), 403

    # Clear flow violations tied to this report's month
    existing = Violation.query.filter(
        Violation.company_id     == report.company_id,
        Violation.violation_type == "flow_exceeds",
        db.func.extract("month", Violation.violation_date) == report.report_month,
        db.func.extract("year",  Violation.violation_date) == report.report_year,
    ).all()
    if existing:
        vids = [v.id for v in existing]
        EnforcementHistory.query.filter(
            EnforcementHistory.violation_id.in_(vids)
        ).delete(synchronize_session=False)
        Violation.query.filter(Violation.id.in_(vids)).delete(synchronize_session=False)

    audit(
        "Deleted flow report",
        table_name = "tbl_monthly_flow_reports",
        record_id  = report_id,
        details    = f"Company ID: {report.company_id} | Period: {report.report_month}/{report.report_year}",
    )
    db.session.delete(report)
    db.session.commit()
    return jsonify({"deleted": report_id}), 200
