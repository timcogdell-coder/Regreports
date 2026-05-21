from app import create_app
from models import db
from sqlalchemy import text

app = create_app()
with app.app_context():
    result = db.session.execute(text(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    ))
    for row in result:
        print(row[0])
