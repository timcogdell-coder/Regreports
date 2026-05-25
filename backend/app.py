import os
from flask import Flask
from flask_login import LoginManager
from flask_cors import CORS

from config import config
from models import db, User
from blueprints.auth import auth_bp
from blueprints.permits import permits_bp
from blueprints.samples import samples_bp
from blueprints.coa_import import coa_bp
from blueprints.compliance import compliance_bp
from blueprints.enforcement import enforcement_bp
from blueprints.admin import admin_bp
from blueprints.reports import reports_bp
from blueprints.surcharges import surcharges_bp
from blueprints.flow_reports import flow_reports_bp
from blueprints.erg_config import erg_config_bp


def create_app(env=None):
    app = Flask(__name__)

    env = env or os.environ.get("FLASK_ENV", "development")
    app.config.from_object(config[env])

    db.init_app(app)
    CORS(app, supports_credentials=True)

    login_manager = LoginManager()
    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    app.register_blueprint(auth_bp,        url_prefix="/api/auth")
    app.register_blueprint(permits_bp,     url_prefix="/api/permits")
    app.register_blueprint(samples_bp,     url_prefix="/api/samples")
    app.register_blueprint(coa_bp,         url_prefix="/api/samples")
    app.register_blueprint(compliance_bp,  url_prefix="/api/compliance")
    app.register_blueprint(enforcement_bp, url_prefix="/api/enforcement")
    app.register_blueprint(admin_bp,       url_prefix="/api/admin")
    app.register_blueprint(reports_bp,     url_prefix="/api/reports")
    app.register_blueprint(surcharges_bp,   url_prefix="/api/surcharges")
    app.register_blueprint(flow_reports_bp, url_prefix="/api/flow-reports")
    app.register_blueprint(erg_config_bp,  url_prefix="/api/erg-config")

    with app.app_context():
        db.create_all()
        _migrate_columns()
        _seed_reference_data()

    return app


def _migrate_columns():
    """Add any columns introduced after the initial schema without dropping data.

    Each ALTER TABLE runs in its own connection so a failure (e.g. column
    already exists in PostgreSQL) never puts a shared connection into an
    aborted-transaction state that silently swallows the remaining migrations.
    """
    new_cols = [
        ("tbl_permit_limits",  "weekly_max_concentration", "FLOAT"),
        ("tbl_permit_limits",  "weekly_max_loading",       "FLOAT"),
        ("tbl_permit_limits",  "is_flow_limit",            "BOOLEAN DEFAULT FALSE"),
        ("tbl_permit_limits",  "daily_max_is_mr",          "BOOLEAN DEFAULT FALSE"),
        ("tbl_permit_limits",  "weekly_max_is_mr",         "BOOLEAN DEFAULT FALSE"),
        ("tbl_permit_limits",  "monthly_avg_is_mr",        "BOOLEAN DEFAULT FALSE"),
        ("tbl_meter_readings",       "reading_purpose",  "VARCHAR(20) NOT NULL DEFAULT 'monthly'"),
        ("tbl_meter_readings",       "sample_id",        "INTEGER REFERENCES tbl_sample(id)"),
        ("tbl_monthly_flow_reports", "review_status",      "VARCHAR(20) NOT NULL DEFAULT 'pending'"),
        ("tbl_monthly_flow_reports", "review_comment",     "TEXT"),
        ("tbl_monthly_flow_reports", "reviewed_by",        "INTEGER REFERENCES tbl_users(id)"),
        ("tbl_monthly_flow_reports", "reviewed_at",        "TIMESTAMP"),
        ("tbl_monthly_flow_reports", "measurement_method", "VARCHAR(20) NOT NULL DEFAULT 'meter'"),
        ("tbl_monthly_flow_reports", "tv_operating_hours", "FLOAT"),
        ("tbl_monthly_flow_reports", "tv_avg_gpm",         "FLOAT"),
    ]
    # Make sampling_period_days optional (monthly readings don't always have a fixed period)
    with db.engine.connect() as conn:
        try:
            conn.execute(db.text("ALTER TABLE tbl_meter_readings ALTER COLUMN sampling_period_days DROP NOT NULL"))
            conn.commit()
        except Exception:
            conn.rollback()
    # Allow NULL sample_id on violations (missing-sample violations have no sample)
    with db.engine.connect() as conn:
        try:
            conn.execute(db.text("ALTER TABLE tbl_violations ALTER COLUMN sample_id DROP NOT NULL"))
            conn.commit()
        except Exception:
            conn.rollback()
    # Allow NULL sampling_days — now derived server-side from the sample date
    with db.engine.connect() as conn:
        try:
            conn.execute(db.text("ALTER TABLE tbl_sample ALTER COLUMN sampling_days DROP NOT NULL"))
            conn.commit()
        except Exception:
            conn.rollback()
    # Allow NULL beginning_read/end_read — only used for meter totalizer method
    for col in ("beginning_read", "end_read"):
        with db.engine.connect() as conn:
            try:
                conn.execute(db.text(f"ALTER TABLE tbl_monthly_flow_reports ALTER COLUMN {col} DROP NOT NULL"))
                conn.commit()
            except Exception:
                conn.rollback()
    for table, col, col_type in new_cols:
        with db.engine.connect() as conn:
            try:
                conn.execute(db.text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
                conn.commit()
            except Exception:
                conn.rollback()   # required for PostgreSQL — clears aborted-tx state


def _seed_reference_data():
    """Populate lookup tables if empty."""
    from models import Parameter, Frequency, LimitType

    if not Parameter.query.first():
        params = [
            Parameter(name="Biochemical Oxygen Demand", abbreviation="BOD",  conversion_factor=8.34),
            Parameter(name="Total Suspended Solids",    abbreviation="TSS",  conversion_factor=8.34),
            Parameter(name="Color",                     abbreviation="COLOR", conversion_factor=8.34),
            Parameter(name="Phosphorus",                abbreviation="P",    conversion_factor=8.34),
            Parameter(name="pH",                        abbreviation="pH",   conversion_factor=1.0),
            Parameter(name="Oil and Grease",            abbreviation="O&G",  conversion_factor=8.34),
        ]
        db.session.add_all(params)

    if not Frequency.query.first():
        freqs = [
            Frequency(frequency_code="1/1",  description="Daily"),
            Frequency(frequency_code="1/7",  description="Weekly"),
            Frequency(frequency_code="1/30", description="Monthly"),
            Frequency(frequency_code="1/90", description="Quarterly"),
        ]
        db.session.add_all(freqs)

    if not LimitType.query.first():
        types = [
            LimitType(type_name="daily_max",    description="Daily Maximum"),
            LimitType(type_name="monthly_avg",  description="Monthly Average"),
            LimitType(type_name="instantaneous", description="Instantaneous Maximum"),
        ]
        db.session.add_all(types)

    db.session.commit()

    # Ensure Plant Flow parameters exist (conversion_factor=0 suppresses loading calc).
    # Rename any legacy "Flow" or "Plant Flow" parameter to "Plant Flow (Max)".
    for abbrev, name in [("PFMax", "Plant Flow (Max)"), ("PFAvg", "Plant Flow (Avg)")]:
        if not Parameter.query.filter_by(abbreviation=abbrev).first():
            # Migrate old legacy parameter on first run
            old = (Parameter.query.filter_by(abbreviation="Flow").first() or
                   Parameter.query.filter_by(abbreviation="PF").first())
            if old and abbrev == "PFMax":
                old.name         = "Plant Flow (Max)"
                old.abbreviation = "PFMax"
            else:
                db.session.add(Parameter(name=name, abbreviation=abbrev, conversion_factor=0.0))
    db.session.commit()


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
