from app import create_app
from models import db
from sqlalchemy import text

app = create_app()
with app.app_context():
    with db.engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE tbl_sample ADD COLUMN IF NOT EXISTS is_corrected BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        # Fix stale FK references
        for constraint in ["tbl_sample_submitted_by_fkey", "tbl_sample_reviewed_by_fkey"]:
            conn.execute(text(f"ALTER TABLE tbl_sample DROP CONSTRAINT IF EXISTS {constraint}"))
        conn.execute(text(
            "ALTER TABLE tbl_sample ADD CONSTRAINT tbl_sample_submitted_by_fkey "
            "FOREIGN KEY (submitted_by) REFERENCES tbl_users(id)"
        ))
        conn.execute(text(
            "ALTER TABLE tbl_sample ADD CONSTRAINT tbl_sample_reviewed_by_fkey "
            "FOREIGN KEY (reviewed_by) REFERENCES tbl_users(id)"
        ))
    print("Done: is_corrected column added, FK constraints fixed")
