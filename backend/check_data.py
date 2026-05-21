from app import create_app
from models import db
from sqlalchemy import text

app = create_app()
with app.app_context():
    for t in ["users", "tbl_users", "audit_log", "tbl_audit_log"]:
        count = db.session.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
        print(f"{t}: {count} rows")
