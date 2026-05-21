from app import create_app
from models import db
from sqlalchemy import text

app = create_app()
with app.app_context():
    rows = db.session.execute(text("SELECT id, name FROM tbl_company ORDER BY id")).fetchall()
    for r in rows:
        print(f"id={r[0]}  name={r[1]}")
