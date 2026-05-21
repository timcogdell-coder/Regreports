"""
Shared audit-logging helper.

Usage (inside any request context with a logged-in user):

    from utils.audit import audit
    audit("Created permit", table_name="tbl_permits", record_id=permit.id,
          details=f"Permit {permit.permit_number} for company {company.name}")
"""
import logging
from flask import request
from flask_login import current_user
from models import db, AuditLog

_log = logging.getLogger(__name__)


def audit(action: str, table_name: str = None, record_id: int = None,
          details: str = None, user_id: int = None) -> None:
    """
    Write one row to tbl_audit_log.

    Parameters
    ----------
    action     : Short verb phrase — "Created company", "Deleted sample result", etc.
    table_name : Primary DB table affected (e.g. "tbl_sample").
    record_id  : Primary-key value of the affected row.
    details    : Free-text description — field changes, names, reasons, etc.
    user_id    : Override the current_user.id (used during login before session set).
    """
    uid = user_id
    if uid is None:
        try:
            uid = current_user.id if current_user.is_authenticated else None
        except Exception as exc:
            _log.warning("audit(): could not resolve current_user — %s", exc)
            uid = None

    log = AuditLog(
        user_id    = uid,
        action     = action,
        table_name = table_name,
        record_id  = record_id,
        details    = details,
        ip_address = request.remote_addr,
    )
    db.session.add(log)
    # Flush without committing — caller's commit picks it up,
    # so audit and data land in the same transaction.
    db.session.flush()
