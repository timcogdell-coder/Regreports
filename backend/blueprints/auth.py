from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from models import db, User
from utils.audit import audit

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data or not data.get("username") or not data.get("password"):
        return jsonify({"error": "Username and password required"}), 400

    user = User.query.filter_by(username=data["username"], is_active=True).first()
    if not user or not user.check_password(data["password"]):
        return jsonify({"error": "Invalid credentials"}), 401

    login_user(user)
    audit("Login", details=f"User {user.username} logged in", user_id=user.id)
    db.session.commit()
    return jsonify({"message": "Login successful", "user": user.to_dict()}), 200


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    audit("Logout", details=f"User {current_user.username} logged out")
    db.session.commit()
    logout_user()
    return jsonify({"message": "Logged out"}), 200


@auth_bp.route("/user", methods=["GET"])
@login_required
def get_current_user():
    return jsonify(current_user.to_dict()), 200
