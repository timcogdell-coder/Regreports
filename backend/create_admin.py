from app import app
from models import db, User

with app.app_context():
    if User.query.filter_by(username="admin").first():
        print("Admin user already exists.")
    else:
        u = User(username="admin", email="admin@regreports.local", role="admin")
        u.set_password("admin123")
        db.session.add(u)
        db.session.commit()
        print("Admin user created: username=admin  password=admin123")
