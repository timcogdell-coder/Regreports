"""
ERG Configuration Blueprint
Allows admins to view and edit the Enforcement Response Guide decision matrix
and fine schedule through the UI rather than in source code.
"""
from flask import Blueprint, request, jsonify
from flask_login import login_required
from models import db, ERGMatrixEntry, ERGFineSchedule
from utils.decorators import roles_required
from utils.audit import audit

erg_config_bp = Blueprint("erg_config", __name__)

# ── Default matrix values (mirrors erg_engine.py hardcoded constants) ─────────
_DEFAULT_MATRIX = [
    # discharge_limit
    {"violation_category": "discharge_limit", "is_recurring": False, "has_harm": False, "response_level": "warning",     "fine_amount": 0},
    {"violation_category": "discharge_limit", "is_recurring": True,  "has_harm": False, "response_level": "ao",           "fine_amount": 250},
    {"violation_category": "discharge_limit", "is_recurring": False, "has_harm": True,  "response_level": "ao",           "fine_amount": 2000},
    {"violation_category": "discharge_limit", "is_recurring": True,  "has_harm": True,  "response_level": "civil",        "fine_amount": 5000},
    # reporting
    {"violation_category": "reporting",       "is_recurring": False, "has_harm": False, "response_level": "phone_call",   "fine_amount": 0},
    {"violation_category": "reporting",       "is_recurring": True,  "has_harm": False, "response_level": "ao",           "fine_amount": 250},
    {"violation_category": "reporting",       "is_recurring": False, "has_harm": True,  "response_level": "ao",           "fine_amount": 5000},
    {"violation_category": "reporting",       "is_recurring": True,  "has_harm": True,  "response_level": "civil",        "fine_amount": 5000},
    # monitoring
    {"violation_category": "monitoring",      "is_recurring": False, "has_harm": False, "response_level": "warning",      "fine_amount": 0},
    {"violation_category": "monitoring",      "is_recurring": True,  "has_harm": False, "response_level": "ao",           "fine_amount": 500},
    {"violation_category": "monitoring",      "is_recurring": False, "has_harm": True,  "response_level": "civil",        "fine_amount": 5000},
    {"violation_category": "monitoring",      "is_recurring": True,  "has_harm": True,  "response_level": "civil",        "fine_amount": 10000},
    # schedule_miss
    {"violation_category": "schedule_miss",   "is_recurring": False, "has_harm": False, "response_level": "warning",      "fine_amount": 0},
    {"violation_category": "schedule_miss",   "is_recurring": True,  "has_harm": False, "response_level": "ao",           "fine_amount": 100},
    {"violation_category": "schedule_miss",   "is_recurring": False, "has_harm": True,  "response_level": "civil",        "fine_amount": 5000},
    {"violation_category": "schedule_miss",   "is_recurring": True,  "has_harm": True,  "response_level": "termination",  "fine_amount": 0},
]

_DEFAULT_FINE_SCHEDULE = [
    {"response_level": "phone_call",  "fine_min": 0,     "fine_max": 0},
    {"response_level": "warning",     "fine_min": 0,     "fine_max": 0},
    {"response_level": "nov",         "fine_min": 0,     "fine_max": 0},
    {"response_level": "ao",          "fine_min": 250,   "fine_max": 5000},
    {"response_level": "civil",       "fine_min": 5000,  "fine_max": 50000},
    {"response_level": "criminal",    "fine_min": 10000, "fine_max": 100000},
    {"response_level": "termination", "fine_min": 0,     "fine_max": 0},
]


def _seed_if_empty():
    """Populate tbl_erg_matrix and tbl_erg_fine_schedule from defaults if tables are empty."""
    if ERGMatrixEntry.query.count() == 0:
        for row in _DEFAULT_MATRIX:
            db.session.add(ERGMatrixEntry(**row))

    if ERGFineSchedule.query.count() == 0:
        for row in _DEFAULT_FINE_SCHEDULE:
            db.session.add(ERGFineSchedule(**row))

    db.session.commit()


# ── Matrix endpoints ───────────────────────────────────────────────────────────

@erg_config_bp.route("/matrix", methods=["GET"])
@login_required
@roles_required("admin", "coordinator")
def get_matrix():
    _seed_if_empty()
    entries = ERGMatrixEntry.query.order_by(
        ERGMatrixEntry.violation_category,
        ERGMatrixEntry.is_recurring,
        ERGMatrixEntry.has_harm,
    ).all()
    return jsonify([e.to_dict() for e in entries]), 200


@erg_config_bp.route("/matrix/<int:entry_id>", methods=["PUT"])
@login_required
@roles_required("admin")
def update_matrix_entry(entry_id):
    entry = ERGMatrixEntry.query.get_or_404(entry_id)
    data  = request.get_json()

    old_level = entry.response_level
    old_fine  = entry.fine_amount

    entry.response_level = data.get("response_level", entry.response_level)
    entry.fine_amount    = float(data.get("fine_amount", entry.fine_amount))

    audit(
        "Updated ERG matrix entry",
        table_name = "tbl_erg_matrix",
        record_id  = entry_id,
        details    = (
            f"Category: {entry.violation_category} | "
            f"Recurring: {entry.is_recurring} | Harm: {entry.has_harm} | "
            f"Level: {old_level} → {entry.response_level} | "
            f"Fine: ${old_fine:,.0f} → ${entry.fine_amount:,.0f}"
        ),
    )
    db.session.commit()
    return jsonify(entry.to_dict()), 200


@erg_config_bp.route("/matrix/reset", methods=["POST"])
@login_required
@roles_required("admin")
def reset_matrix():
    """Reset the entire matrix to built-in defaults."""
    ERGMatrixEntry.query.delete()
    for row in _DEFAULT_MATRIX:
        db.session.add(ERGMatrixEntry(**row))
    audit("Reset ERG matrix to defaults", table_name="tbl_erg_matrix")
    db.session.commit()
    entries = ERGMatrixEntry.query.order_by(
        ERGMatrixEntry.violation_category,
        ERGMatrixEntry.is_recurring,
        ERGMatrixEntry.has_harm,
    ).all()
    return jsonify([e.to_dict() for e in entries]), 200


# ── Fine schedule endpoints ────────────────────────────────────────────────────

@erg_config_bp.route("/fine-schedule", methods=["GET"])
@login_required
@roles_required("admin", "coordinator")
def get_fine_schedule():
    _seed_if_empty()
    schedule = ERGFineSchedule.query.order_by(ERGFineSchedule.id).all()
    return jsonify([s.to_dict() for s in schedule]), 200


@erg_config_bp.route("/fine-schedule/<int:sched_id>", methods=["PUT"])
@login_required
@roles_required("admin")
def update_fine_schedule(sched_id):
    entry = ERGFineSchedule.query.get_or_404(sched_id)
    data  = request.get_json()

    entry.fine_min = float(data.get("fine_min", entry.fine_min))
    entry.fine_max = float(data.get("fine_max", entry.fine_max))

    if entry.fine_min > entry.fine_max and entry.fine_max > 0:
        return jsonify({"error": "fine_min cannot exceed fine_max"}), 400

    audit(
        "Updated ERG fine schedule",
        table_name = "tbl_erg_fine_schedule",
        record_id  = sched_id,
        details    = f"Level: {entry.response_level} | Min: ${entry.fine_min:,.0f} | Max: ${entry.fine_max:,.0f}",
    )
    db.session.commit()
    return jsonify(entry.to_dict()), 200
