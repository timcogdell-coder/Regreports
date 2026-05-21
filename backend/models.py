from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


class User(UserMixin, db.Model):
    __tablename__ = "tbl_users"
    id              = db.Column(db.Integer, primary_key=True)
    username        = db.Column(db.String(80), unique=True, nullable=False)
    email           = db.Column(db.String(120), unique=True, nullable=False)
    password_hash   = db.Column(db.String(256), nullable=False)
    role            = db.Column(db.String(20), nullable=False)  # admin, coordinator, iu, finance
    company_id      = db.Column(db.Integer, db.ForeignKey("tbl_company.id"), nullable=True)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    is_active       = db.Column(db.Boolean, default=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {"id": self.id, "username": self.username,
                "email": self.email, "role": self.role, "company_id": self.company_id}


class AuditLog(db.Model):
    __tablename__ = "tbl_audit_log"
    id          = db.Column(db.Integer, primary_key=True)
    user_id     = db.Column(db.Integer, db.ForeignKey("tbl_users.id"), nullable=True)
    action      = db.Column(db.String(200), nullable=False)
    table_name  = db.Column(db.String(50))
    record_id   = db.Column(db.Integer)
    details     = db.Column(db.Text)
    ip_address  = db.Column(db.String(45))
    timestamp   = db.Column(db.DateTime, default=datetime.utcnow)

    user        = db.relationship("User", lazy=True, foreign_keys=[user_id])

    def to_dict(self):
        return {
            "id":         self.id,
            "user_id":    self.user_id,
            "username":   self.user.username if self.user else "deleted user",
            "action":     self.action,
            "table_name": self.table_name,
            "record_id":  self.record_id,
            "details":    self.details,
            "ip_address": self.ip_address,
            "timestamp":  self.timestamp.isoformat() if self.timestamp else None,
        }


class Company(db.Model):
    __tablename__ = "tbl_company"
    id                      = db.Column(db.Integer, primary_key=True)
    name                    = db.Column(db.String(200), nullable=False)
    contact_person          = db.Column(db.String(100))
    phone                   = db.Column(db.String(20))
    email                   = db.Column(db.String(120))
    permit_coordinator_id   = db.Column(db.Integer, db.ForeignKey("tbl_users.id"))
    signature_authority_id  = db.Column(db.Integer, db.ForeignKey("tbl_users.id"))
    address                 = db.Column(db.String(300))
    is_active               = db.Column(db.Boolean, default=True, nullable=False)
    created_at              = db.Column(db.DateTime, default=datetime.utcnow)

    permits     = db.relationship("Permit", backref="company", lazy=True)
    samples     = db.relationship("Sample", backref="company", lazy=True)
    violations  = db.relationship("Violation", backref="company", lazy=True)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "contact_person": self.contact_person,
                "phone": self.phone, "email": self.email, "is_active": self.is_active}


class Parameter(db.Model):
    __tablename__ = "tbl_parameters"
    id                  = db.Column(db.Integer, primary_key=True)
    name                = db.Column(db.String(100), nullable=False)
    abbreviation        = db.Column(db.String(20), nullable=False)
    conversion_factor   = db.Column(db.Float, default=8.34)  # lbs/day calc factor

    def to_dict(self):
        return {"id": self.id, "name": self.name, "abbreviation": self.abbreviation,
                "conversion_factor": self.conversion_factor}


class Frequency(db.Model):
    __tablename__ = "tbl_frequency"
    id              = db.Column(db.Integer, primary_key=True)
    frequency_code  = db.Column(db.String(10), nullable=False)  # 1/1, 1/7, 1/30
    description     = db.Column(db.String(50))


class LimitType(db.Model):
    __tablename__ = "tbl_limit_type"
    id          = db.Column(db.Integer, primary_key=True)
    type_name   = db.Column(db.String(50), nullable=False)  # daily_max, monthly_avg
    description = db.Column(db.String(200))


class Permit(db.Model):
    __tablename__ = "tbl_permits"
    id              = db.Column(db.Integer, primary_key=True)
    company_id      = db.Column(db.Integer, db.ForeignKey("tbl_company.id"), nullable=False)
    permit_number   = db.Column(db.String(50), unique=True, nullable=False)
    effective_date  = db.Column(db.Date, nullable=False)
    expiration_date = db.Column(db.Date, nullable=False)
    facility_id     = db.Column(db.String(50))
    is_active       = db.Column(db.Boolean, default=True)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    limits  = db.relationship("PermitLimit", backref="permit", lazy=True)
    samples = db.relationship("Sample", backref="permit", lazy=True)

    def to_dict(self):
        return {"id": self.id, "company_id": self.company_id,
                "permit_number": self.permit_number,
                "effective_date": str(self.effective_date),
                "expiration_date": str(self.expiration_date),
                "is_active": self.is_active}


class PermitLimit(db.Model):
    __tablename__ = "tbl_permit_limits"
    id                          = db.Column(db.Integer, primary_key=True)
    permit_id                   = db.Column(db.Integer, db.ForeignKey("tbl_permits.id"), nullable=False)
    parameter_id                = db.Column(db.Integer, db.ForeignKey("tbl_parameters.id"), nullable=False)
    daily_max_concentration     = db.Column(db.Float)   # mg/L
    daily_max_loading           = db.Column(db.Float)   # lbs/day
    weekly_max_concentration    = db.Column(db.Float)   # mg/L  (7-day average limit)
    weekly_max_loading          = db.Column(db.Float)   # lbs/day (7-day average limit)
    monthly_avg_concentration   = db.Column(db.Float)   # mg/L
    monthly_avg_loading         = db.Column(db.Float)   # lbs/day
    frequency_id                = db.Column(db.Integer, db.ForeignKey("tbl_frequency.id"))
    limit_type_id               = db.Column(db.Integer, db.ForeignKey("tbl_limit_type.id"))
    sample_type                 = db.Column(db.String(30))  # grab, composite, continuous
    is_monitor_report           = db.Column(db.Boolean, default=False)  # MR — no numeric limit
    is_range_limit              = db.Column(db.Boolean, default=False)   # min/max range (e.g. pH)
    min_value                   = db.Column(db.Float)
    max_value                   = db.Column(db.Float)
    range_unit                  = db.Column(db.String(20), default="s.u.")  # display unit for range limits
    is_flow_limit               = db.Column(db.Boolean, default=False)
    averaging_period            = db.Column(db.String(20))  # "daily_max" | "weekly_max" | "monthly_avg" — only used when is_flow_limit

    parameter   = db.relationship("Parameter", lazy=True)
    frequency   = db.relationship("Frequency", lazy=True)

    def to_dict(self):
        return {"id": self.id, "permit_id": self.permit_id,
                "parameter_id": self.parameter_id,
                "parameter_name": self.parameter.name if self.parameter else None,
                "abbreviation": self.parameter.abbreviation if self.parameter else None,
                "daily_max_concentration": self.daily_max_concentration,
                "daily_max_loading": self.daily_max_loading,
                "weekly_max_concentration": self.weekly_max_concentration,
                "weekly_max_loading": self.weekly_max_loading,
                "monthly_avg_concentration": self.monthly_avg_concentration,
                "monthly_avg_loading": self.monthly_avg_loading,
                "frequency_id": self.frequency_id,
                "frequency_description": self.frequency.description if self.frequency else None,
                "sample_type": self.sample_type,
                "is_monitor_report": self.is_monitor_report or False,
                "is_range_limit": self.is_range_limit or False,
                "min_value": self.min_value,
                "max_value": self.max_value,
                "range_unit": self.range_unit or "s.u.",
                "is_flow_limit": self.is_flow_limit or False,
                "averaging_period": self.averaging_period}


class FlowMeter(db.Model):
    __tablename__ = "tbl_flow_meters"
    id                  = db.Column(db.Integer, primary_key=True)
    company_id          = db.Column(db.Integer, db.ForeignKey("tbl_company.id"), nullable=False)
    meter_id            = db.Column(db.String(50), nullable=False)
    description         = db.Column(db.String(200))
    installation_date   = db.Column(db.Date)
    pulse_factor        = db.Column(db.Float, default=1.0)  # volume units per pulse
    unit                = db.Column(db.String(20), default="gallons")  # "gallons" or "cubic_feet"
    meter_type          = db.Column(db.String(20), default="process")  # "process" or "sanitary"
    is_active           = db.Column(db.Boolean, default=True)

    readings = db.relationship("MeterReading", backref="meter", lazy=True)

    def to_dict(self):
        return {"id": self.id, "company_id": self.company_id,
                "meter_id": self.meter_id, "description": self.description,
                "pulse_factor": self.pulse_factor or 1.0,
                "unit": self.unit or "gallons",
                "meter_type": self.meter_type or "process",
                "is_active": self.is_active}


class MeterReading(db.Model):
    __tablename__ = "tbl_meter_readings"
    id                   = db.Column(db.Integer, primary_key=True)
    meter_id             = db.Column(db.Integer, db.ForeignKey("tbl_flow_meters.id"), nullable=False)
    reading_start        = db.Column(db.Float, nullable=False)
    reading_end          = db.Column(db.Float, nullable=False)
    reading_date         = db.Column(db.Date, nullable=False)
    sampling_period_days = db.Column(db.Integer, nullable=True)
    # "monthly" = first/last-of-month total flow reading entered by coordinator
    # "sample_event" = auto-created when a sample is submitted; tied to a specific sample
    reading_purpose      = db.Column(db.String(20), nullable=False, default="monthly")
    sample_id            = db.Column(db.Integer, db.ForeignKey("tbl_sample.id"), nullable=True)

    @property
    def volume_mg(self):
        """Total volume for this reading period in million gallons (before pulse factor)."""
        return (self.reading_end - self.reading_start) / 1_000_000

    def to_dict(self):
        return {
            "id":                   self.id,
            "meter_id":             self.meter_id,
            "reading_start":        self.reading_start,
            "reading_end":          self.reading_end,
            "reading_date":         str(self.reading_date),
            "sampling_period_days": self.sampling_period_days,
            "reading_purpose":      self.reading_purpose,
            "sample_id":            self.sample_id,
        }


class Sample(db.Model):
    __tablename__ = "tbl_sample"
    id              = db.Column(db.Integer, primary_key=True)
    company_id      = db.Column(db.Integer, db.ForeignKey("tbl_company.id"), nullable=False)
    permit_id       = db.Column(db.Integer, db.ForeignKey("tbl_permits.id"), nullable=False)
    sample_date     = db.Column(db.Date, nullable=False)
    sampler_name    = db.Column(db.String(100))
    temperature     = db.Column(db.Float)
    coc_form_data   = db.Column(db.JSON)
    flow_mgd        = db.Column(db.Float)
    sampling_days   = db.Column(db.Integer, nullable=True)
    pulse_factor    = db.Column(db.Float, default=1.0)
    submitted_by    = db.Column(db.Integer, db.ForeignKey("tbl_users.id"))
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    review_status   = db.Column(db.String(20), default="pending")
    review_comment  = db.Column(db.Text)
    reviewed_by     = db.Column(db.Integer, db.ForeignKey("tbl_users.id"))
    reviewed_at     = db.Column(db.DateTime)
    is_corrected    = db.Column(db.Boolean, default=False)

    results     = db.relationship("SampleResult", backref="sample", lazy=True)
    violations  = db.relationship("Violation", backref="sample", lazy=True)

    def to_dict(self):
        return {"id": self.id, "company_id": self.company_id,
                "permit_id": self.permit_id,
                "sample_date": str(self.sample_date),
                "sampler_name": self.sampler_name,
                "flow_mgd": self.flow_mgd,
                "sampling_days": self.sampling_days,
                "pulse_factor": self.pulse_factor or 1.0,
                "submitted_by": self.submitted_by,
                "review_status": self.review_status or "pending",
                "review_comment": self.review_comment,
                "reviewed_by": self.reviewed_by,
                "reviewed_at": str(self.reviewed_at) if self.reviewed_at else None,
                "is_corrected": self.is_corrected or False}


class SampleResult(db.Model):
    __tablename__ = "tbl_sample_results"
    id                      = db.Column(db.Integer, primary_key=True)
    sample_id               = db.Column(db.Integer, db.ForeignKey("tbl_sample.id"), nullable=False)
    permit_limit_id         = db.Column(db.Integer, db.ForeignKey("tbl_permit_limits.id"), nullable=False)
    concentration_result    = db.Column(db.Float)   # mg/L
    loading_result          = db.Column(db.Float)   # lbs/day

    permit_limit = db.relationship("PermitLimit", lazy=True)

    def to_dict(self):
        return {"id": self.id, "sample_id": self.sample_id,
                "permit_limit_id": self.permit_limit_id,
                "concentration_result": self.concentration_result,
                "loading_result": self.loading_result}


class Violation(db.Model):
    __tablename__ = "tbl_violations"
    id                  = db.Column(db.Integer, primary_key=True)
    company_id          = db.Column(db.Integer, db.ForeignKey("tbl_company.id"), nullable=False)
    parameter_id        = db.Column(db.Integer, db.ForeignKey("tbl_parameters.id"), nullable=False)
    permit_limit_id     = db.Column(db.Integer, db.ForeignKey("tbl_permit_limits.id"), nullable=False)
    sample_id           = db.Column(db.Integer, db.ForeignKey("tbl_sample.id"), nullable=True)
    violation_type      = db.Column(db.String(30), nullable=False)   # avg_exceeds, max_exceeds
    violation_date      = db.Column(db.Date, nullable=False)
    violation_severity  = db.Column(db.String(20))  # minor, significant, major
    exceedance_percent  = db.Column(db.Float)
    created_at          = db.Column(db.DateTime, default=datetime.utcnow)

    parameter   = db.relationship("Parameter", lazy=True)
    enforcement = db.relationship("EnforcementHistory", backref="violation", lazy=True)

    def to_dict(self):
        return {"id": self.id, "company_id": self.company_id,
                "parameter_id": self.parameter_id,
                "parameter_name": self.parameter.name if self.parameter else None,
                "violation_type": self.violation_type,
                "violation_date": str(self.violation_date),
                "violation_severity": self.violation_severity,
                "exceedance_percent": self.exceedance_percent}


class EnforcementHistory(db.Model):
    __tablename__ = "tbl_enforcement_history"
    id                      = db.Column(db.Integer, primary_key=True)
    company_id              = db.Column(db.Integer, db.ForeignKey("tbl_company.id"), nullable=False)
    violation_id            = db.Column(db.Integer, db.ForeignKey("tbl_violations.id"), nullable=False)
    response_level          = db.Column(db.String(30), nullable=False)
    # phone_call, warning, nov, ao, civil, criminal, termination
    auto_generated_response = db.Column(db.Text)
    coordinator_notes       = db.Column(db.Text)
    approved_by_id          = db.Column(db.Integer, db.ForeignKey("tbl_users.id"))
    approval_date           = db.Column(db.DateTime)
    fine_amount             = db.Column(db.Float, default=0.0)
    e_signature             = db.Column(db.Text)
    status                  = db.Column(db.String(20), default="pending")  # pending, approved, sent
    sent_at                 = db.Column(db.DateTime)
    created_at              = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        v = self.violation
        company = Company.query.get(self.company_id) if self.company_id else None
        return {
            "id":                       self.id,
            "company_id":               self.company_id,
            "company_name":             company.name if company else None,
            "violation_id":             self.violation_id,
            "violation_date":           str(v.violation_date) if v else None,
            "violation_type":           v.violation_type if v else None,
            "parameter_name":           (v.parameter.name if v and v.parameter else None),
            "response_level":           self.response_level,
            "auto_generated_response":  self.auto_generated_response,
            "coordinator_notes":        self.coordinator_notes,
            "fine_amount":              self.fine_amount,
            "e_signature":              self.e_signature,
            "approved_by_id":           self.approved_by_id,
            "approval_date":            str(self.approval_date) if self.approval_date else None,
            "status":                   self.status,
            "created_at":               str(self.created_at) if self.created_at else None,
        }


class ERGMatrixEntry(db.Model):
    """One row per (category × recurring × harm) combination in the ERG decision matrix."""
    __tablename__ = "tbl_erg_matrix"
    __table_args__ = (
        db.UniqueConstraint("violation_category", "is_recurring", "has_harm",
                            name="uq_erg_matrix_key"),
    )
    id                  = db.Column(db.Integer, primary_key=True)
    violation_category  = db.Column(db.String(30), nullable=False)
    is_recurring        = db.Column(db.Boolean,    nullable=False)
    has_harm            = db.Column(db.Boolean,    nullable=False)
    response_level      = db.Column(db.String(30), nullable=False)
    fine_amount         = db.Column(db.Float,      nullable=False, default=0.0)
    updated_at          = db.Column(db.DateTime,   default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id":                 self.id,
            "violation_category": self.violation_category,
            "is_recurring":       self.is_recurring,
            "has_harm":           self.has_harm,
            "response_level":     self.response_level,
            "fine_amount":        self.fine_amount,
        }


class ERGFineSchedule(db.Model):
    """Min/max fine range per response level."""
    __tablename__ = "tbl_erg_fine_schedule"
    id             = db.Column(db.Integer, primary_key=True)
    response_level = db.Column(db.String(30), unique=True, nullable=False)
    fine_min       = db.Column(db.Float, nullable=False, default=0.0)
    fine_max       = db.Column(db.Float, nullable=False, default=0.0)
    updated_at     = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id":             self.id,
            "response_level": self.response_level,
            "fine_min":       self.fine_min,
            "fine_max":       self.fine_max,
        }


class SurchargeCalculation(db.Model):
    __tablename__ = "tbl_surcharge_calculations"
    id          = db.Column(db.Integer, primary_key=True)
    company_id  = db.Column(db.Integer, db.ForeignKey("tbl_company.id"), nullable=False)
    month       = db.Column(db.Integer, nullable=False)
    year        = db.Column(db.Integer, nullable=False)
    bod_charge  = db.Column(db.Float, default=0.0)
    tss_charge  = db.Column(db.Float, default=0.0)
    color_charge = db.Column(db.Float, default=0.0)
    total_charge = db.Column(db.Float, default=0.0)
    invoice_id  = db.Column(db.String(50))
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    company = db.relationship("Company", lazy=True)

    def to_dict(self):
        return {"id": self.id, "company_id": self.company_id,
                "month": self.month, "year": self.year,
                "bod_charge": self.bod_charge, "tss_charge": self.tss_charge,
                "color_charge": self.color_charge, "total_charge": self.total_charge,
                "invoice_id": self.invoice_id}


class MonthlyFlowReport(db.Model):
    """
    One record per company per month capturing total flow and peak values.
    Separate from sample-event meter readings; used for permit compliance
    reporting on Plant Flow limits and for surcharge flow input.
    """
    __tablename__ = "tbl_monthly_flow_reports"
    id               = db.Column(db.Integer, primary_key=True)
    company_id       = db.Column(db.Integer, db.ForeignKey("tbl_company.id"), nullable=False)
    meter_id         = db.Column(db.Integer, db.ForeignKey("tbl_flow_meters.id"), nullable=True)
    report_month     = db.Column(db.Integer, nullable=False)   # 1–12
    report_year      = db.Column(db.Integer, nullable=False)
    period_days        = db.Column(db.Integer, nullable=False)   # days in the month
    measurement_method = db.Column(db.String(20), nullable=False, default="meter")  # meter | time_volume | direct
    beginning_read     = db.Column(db.Float, nullable=True)     # meter: totalizer at month start
    end_read           = db.Column(db.Float, nullable=True)      # meter: totalizer at month end
    tv_operating_hours = db.Column(db.Float, nullable=True)      # time_volume: operating hrs/day
    tv_avg_gpm         = db.Column(db.Float, nullable=True)      # time_volume: computed avg GPM
    total_flow_mg      = db.Column(db.Float)                     # calculated MG for the month
    monthly_avg_mgd    = db.Column(db.Float)                     # total_flow_mg / period_days
    daily_max_mgd    = db.Column(db.Float)                     # peak single-day flow (entered)
    weekly_max_mgd   = db.Column(db.Float)                     # peak 7-day avg flow (entered)
    submitted_by     = db.Column(db.String(100))
    submitted_at     = db.Column(db.DateTime, default=datetime.utcnow)
    review_status    = db.Column(db.String(20), default="pending")
    review_comment   = db.Column(db.Text)
    reviewed_by      = db.Column(db.Integer, db.ForeignKey("tbl_users.id"), nullable=True)
    reviewed_at      = db.Column(db.DateTime, nullable=True)

    company   = db.relationship("Company", lazy=True)
    meter     = db.relationship("FlowMeter", foreign_keys=[meter_id], lazy=True)
    reviewer  = db.relationship("User", foreign_keys=[reviewed_by], lazy=True)

    def to_dict(self):
        m = self.meter
        pf = (m.pulse_factor or 1.0) if m else 1.0
        return {
            "id":              self.id,
            "company_id":      self.company_id,
            "company_name":    self.company.name if self.company else None,
            "meter_id":        self.meter_id,
            "meter_label":     m.meter_id if m else None,
            "pulse_factor":    pf,
            "report_month":    self.report_month,
            "report_year":     self.report_year,
            "period_days":         self.period_days,
            "measurement_method":  self.measurement_method or "meter",
            "beginning_read":      self.beginning_read,
            "end_read":            self.end_read,
            "tv_operating_hours":  self.tv_operating_hours,
            "tv_avg_gpm":          self.tv_avg_gpm,
            "total_flow_mg":       self.total_flow_mg,
            "monthly_avg_mgd":     self.monthly_avg_mgd,
            "daily_max_mgd":   self.daily_max_mgd,
            "weekly_max_mgd":  self.weekly_max_mgd,
            "submitted_by":    self.submitted_by,
            "submitted_at":    self.submitted_at.isoformat() if self.submitted_at else None,
            "review_status":   self.review_status or "pending",
            "review_comment":  self.review_comment,
            "reviewed_by":     self.reviewed_by,
            "reviewed_at":     self.reviewed_at.isoformat() if self.reviewed_at else None,
        }
