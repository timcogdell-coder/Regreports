from app import app
from models import db
from sqlalchemy import text

with app.app_context():
    with db.engine.connect() as conn:
        for stmt in [
            "ALTER TABLE tbl_flow_meters ADD COLUMN IF NOT EXISTS pulse_factor REAL DEFAULT 1.0",
            "ALTER TABLE tbl_flow_meters ADD COLUMN IF NOT EXISTS description VARCHAR(200)",
            "ALTER TABLE tbl_sample ADD COLUMN IF NOT EXISTS pulse_factor REAL DEFAULT 1.0",
        ]:
            conn.execute(text(stmt))
            conn.commit()
            print(f"OK: {stmt[:60]}")
