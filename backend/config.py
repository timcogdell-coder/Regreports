import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY          = os.environ.get("SECRET_KEY", "dev-secret-change-in-production")
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "postgresql://localhost/regreports_dev")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_EXPIRATION_HOURS = 8

    # Surcharge rates ($/1000 lbs)
    BOD_RATE    = float(os.environ.get("BOD_RATE",   180.00))
    TSS_RATE    = float(os.environ.get("TSS_RATE",   180.00))
    COLOR_RATE  = float(os.environ.get("COLOR_RATE",   0.00))

    # Surcharge thresholds (mg/L) — municipal pretreatment ordinance values
    BOD_THRESHOLD   = float(os.environ.get("BOD_THRESHOLD",   350.0))
    TSS_THRESHOLD   = float(os.environ.get("TSS_THRESHOLD",   300.0))
    COLOR_THRESHOLD = float(os.environ.get("COLOR_THRESHOLD",   0.0))

    # lbs/day conversion factor
    CONVERSION_FACTOR = 8.34

    MAIL_SERVER     = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT       = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USE_TLS    = True
    MAIL_USERNAME   = os.environ.get("MAIL_USERNAME")
    MAIL_PASSWORD   = os.environ.get("MAIL_PASSWORD")
    MAIL_FROM       = os.environ.get("MAIL_FROM", "noreply@regreports.com")


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False
    # DigitalOcean injects DATABASE_URL automatically
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "").replace(
        "postgres://", "postgresql://", 1
    )


config = {
    "development": DevelopmentConfig,
    "production":  ProductionConfig,
    "default":     DevelopmentConfig,
}
