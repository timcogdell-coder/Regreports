from app import app
from models import db
from sqlalchemy import text

cols = [
    ("review_status",  "VARCHAR(20) DEFAULT 'pending'"),
    ("review_comment", "TEXT"),
    ("reviewed_by",    "INTEGER REFERENCES users(id)"),
    ("reviewed_at",    "TIMESTAMP"),
]

with app.app_context():
    with db.engine.connect() as conn:
        for col, definition in cols:
            try:
                conn.execute(text(f"ALTER TABLE tbl_sample ADD COLUMN IF NOT EXISTS {col} {definition}"))
                conn.commit()
                print(f"Added: {col}")
            except Exception as e:
                print(f"Skipped {col}: {e}")
