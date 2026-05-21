from app import create_app
from models import db
from sqlalchemy import text

app = create_app()
with app.app_context():
    db.session.execute(text(
        "ALTER TABLE tbl_permit_limits ADD COLUMN IF NOT EXISTS range_unit VARCHAR(20) DEFAULT 's.u.'"
    ))
    db.session.commit()
    print("Migration complete: range_unit column added")
