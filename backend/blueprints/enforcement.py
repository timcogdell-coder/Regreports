from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import db, EnforcementHistory
from utils.decorators import roles_required
from utils.audit import audit

enforcement_bp = Blueprint("enforcement", __name__)


@enforcement_bp.route("/pending", methods=["GET"])
@login_required
@roles_required("admin", "coordinator")
def pending_approvals():
    actions = (EnforcementHistory.query
               .filter_by(status="pending")
               .order_by(EnforcementHistory.created_at.desc())
               .all())
    return jsonify([a.to_dict() for a in actions]), 200


@enforcement_bp.route("/<int:action_id>/approve", methods=["POST"])
@login_required
@roles_required("admin", "coordinator")
def approve_action(action_id):
    from datetime import datetime
    data = request.get_json()
    action = EnforcementHistory.query.get_or_404(action_id)

    if action.status != "pending":
        return jsonify({"error": "Action already processed"}), 409

    action.approved_by_id   = current_user.id
    action.approval_date    = datetime.utcnow()
    action.coordinator_notes = data.get("notes", "")
    action.e_signature      = data.get("e_signature")
    action.status           = "approved"

    audit(
        "Approved enforcement action",
        table_name = "tbl_enforcement_history",
        record_id  = action_id,
        details    = (
            f"Company ID: {action.company_id} | "
            f"Level: {action.response_level} | "
            f"Fine: ${action.fine_amount or 0:,.2f} | "
            f"Signature: {action.e_signature or '(none)'}"
        ),
    )
    db.session.commit()

    # TODO: Send email to IU with enforcement letter
    return jsonify({"message": "Enforcement action approved", "action": action.to_dict()}), 200


@enforcement_bp.route("/<int:action_id>/override", methods=["POST"])
@login_required
@roles_required("admin", "coordinator")
def override_action(action_id):
    data = request.get_json()
    action = EnforcementHistory.query.get_or_404(action_id)

    action.response_level       = data.get("response_level", action.response_level)
    action.fine_amount          = data.get("fine_amount", action.fine_amount)
    action.coordinator_notes    = data.get("notes", "")
    action.status               = "pending"

    audit(
        "Overrode enforcement action",
        table_name = "tbl_enforcement_history",
        record_id  = action_id,
        details    = (
            f"Company ID: {action.company_id} | "
            f"New level: {action.response_level} | "
            f"Fine: ${action.fine_amount or 0:,.2f}"
        ),
    )
    db.session.commit()
    return jsonify({"message": "Action overridden", "action": action.to_dict()}), 200


@enforcement_bp.route("/history/<int:company_id>", methods=["GET"])
@login_required
def enforcement_history(company_id):
    actions = (EnforcementHistory.query
               .filter_by(company_id=company_id)
               .order_by(EnforcementHistory.created_at.desc())
               .all())
    return jsonify([a.to_dict() for a in actions]), 200
