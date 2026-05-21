from app import create_app
from models import db
from sqlalchemy import text

app = create_app()
with app.app_context():
    with db.engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS users CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS audit_log CASCADE"))
    print("Done: dropped empty legacy tables 'users' and 'audit_log'")
