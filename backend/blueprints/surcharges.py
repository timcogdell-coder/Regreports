from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import db, SurchargeCalculation
from engines.surcharge_engine import calculate_monthly_surcharge
from utils.decorators import roles_required

surcharges_bp = Blueprint("surcharges", __name__)


@surcharges_bp.route("/calculate", methods=["POST"])
@login_required
@roles_required("admin", "coordinator", "finance")
def calculate():
    data = request.get_json()
    required = ["company_id", "month", "year"]
    if not all(data.get(k) for k in required):
        return jsonify({"error": "company_id, month, and year required"}), 400

    result = calculate_monthly_surcharge(
        company_id=data["company_id"],
        month=int(data["month"]),
        year=int(data["year"]),
    )
    return jsonify(result), 200


@surcharges_bp.route("", methods=["GET"])
@login_required
def list_surcharges():
    company_id = request.args.get("company_id", type=int)
    if current_user.role == "iu":
        company_id = current_user.company_id
    query = SurchargeCalculation.query
    if company_id:
        query = query.filter_by(company_id=company_id)
    records = query.order_by(
        SurchargeCalculation.year.desc(),
        SurchargeCalculation.month.desc()
    ).all()
    return jsonify([r.to_dict() for r in records]), 200
