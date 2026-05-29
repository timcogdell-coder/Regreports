"""
Surcharge Calculation Engine

Flow source: tbl_monthly_flow_reports — the reviewed end-of-month totalizer reading
             submitted by the IU and approved by a coordinator.

Concentration source: tbl_sample_results — BOD and TSS average concentrations from
             all samples taken during the month.

Formula (per municipal pretreatment ordinance):

    total_flow_mg  = MonthlyFlowReport.total_flow_mg (reviewed report for the month)
    avg_daily_mg   = total_flow_mg / days_in_month
    excess_conc    = avg_measured_conc (mg/L) - threshold (mg/L)   ← can be negative (credit)
    daily_lbs      = excess_conc × avg_daily_mg × 8.34
    monthly_lbs    = daily_lbs × days_in_month
                   = excess_conc × total_flow_mg × 8.34            ← simplified
    surcharge ($)  = (monthly_lbs / 1,000) × rate_per_1000_lbs     ← negative = credit

Thresholds (ordinance):  BOD = 350 mg/L,  TSS = 300 mg/L
"""
import calendar
from flask import current_app
from models import db, Sample, SurchargeCalculation, MonthlyFlowReport


def calculate_monthly_surcharge(company_id: int, month: int, year: int) -> dict:
    """Calculate and store the surcharge for a company for a given month/year."""

    days_in_month = calendar.monthrange(year, month)[1]

    # ── Step 1: Total flow (MG) from the reviewed monthly flow report ─────────
    flow_report = MonthlyFlowReport.query.filter_by(
        company_id=company_id,
        report_month=month,
        report_year=year,
        review_status="reviewed",
    ).first()

    if not flow_report or not flow_report.total_flow_mg:
        # Check whether a pending report exists so the caller can show a useful message
        pending = MonthlyFlowReport.query.filter_by(
            company_id=company_id,
            report_month=month,
            report_year=year,
        ).first()
        status = pending.review_status if pending else "missing"
        return _zero_result(company_id, month, year, days_in_month, flow_report_status=status)

    total_flow_mg = flow_report.total_flow_mg
    avg_daily_mg  = total_flow_mg / days_in_month

    # ── Step 2: Average BOD and TSS concentrations from samples this month ────
    samples = (
        Sample.query
        .filter_by(company_id=company_id, review_status="reviewed")
        .filter(
            db.extract("month", Sample.sample_date) == month,
            db.extract("year",  Sample.sample_date) == year,
        )
        .all()
    )

    if not samples:
        return _zero_result(company_id, month, year, days_in_month, flow_report_status="reviewed")

    # ── Step 2: Collect concentrations per parameter abbreviation ─────────────
    bod_concs   = []
    tss_concs   = []
    color_concs = []

    for sample in samples:
        for result in sample.results:
            if result.concentration_result is None:
                continue
            limit = result.permit_limit
            if not limit or not limit.parameter:
                continue
            abbrev = (limit.parameter.abbreviation or "").upper()
            if abbrev == "BOD":
                bod_concs.append(result.concentration_result)
            elif abbrev == "TSS":
                tss_concs.append(result.concentration_result)
            elif abbrev == "COLOR":
                color_concs.append(result.concentration_result)

    # ── Step 3: Compute charges ───────────────────────────────────────────────
    bod_threshold   = current_app.config["BOD_THRESHOLD"]
    tss_threshold   = current_app.config["TSS_THRESHOLD"]
    color_threshold = current_app.config["COLOR_THRESHOLD"]
    bod_rate        = current_app.config["BOD_RATE"]
    tss_rate        = current_app.config["TSS_RATE"]
    color_rate      = current_app.config["COLOR_RATE"]

    def _calc(concs: list, threshold: float, rate: float, cf: float = 8.34):
        """
        Returns (avg_conc, excess_conc, monthly_lbs, charge).
        excess_conc and charge are negative when concentration is below threshold (credit).
        monthly_lbs = excess_conc × total_flow_mg × 8.34
                    = excess_conc × avg_daily_mg × 8.34 × days_in_month  (equivalent)
        """
        if not concs:
            return None, 0.0, 0.0, 0.0
        avg_conc    = sum(concs) / len(concs)
        excess_conc = avg_conc - threshold          # negative = below threshold = credit
        monthly_lbs = excess_conc * total_flow_mg * cf
        charge      = (monthly_lbs / 1_000) * rate
        return round(avg_conc, 4), round(excess_conc, 4), round(monthly_lbs, 2), round(charge, 2)

    bod_avg,   bod_excess_conc,   bod_lbs,   bod_charge   = _calc(bod_concs,   bod_threshold,   bod_rate)
    tss_avg,   tss_excess_conc,   tss_lbs,   tss_charge   = _calc(tss_concs,   tss_threshold,   tss_rate)
    color_avg, color_excess_conc, color_lbs, color_charge = _calc(color_concs, color_threshold, color_rate)

    total_charge = round(bod_charge + tss_charge + color_charge, 2)

    # ── Step 4: Upsert ────────────────────────────────────────────────────────
    existing = SurchargeCalculation.query.filter_by(
        company_id=company_id, month=month, year=year
    ).first()
    record = existing or SurchargeCalculation(company_id=company_id, month=month, year=year)
    if not existing:
        db.session.add(record)

    record.bod_charge   = bod_charge
    record.tss_charge   = tss_charge
    record.color_charge = color_charge
    record.total_charge = total_charge
    record.invoice_id   = f"INV-{company_id}-{year}{month:02d}"
    db.session.commit()

    return {
        "company_id":    company_id,
        "month":         month,
        "year":          year,
        "days_in_month": days_in_month,
        "total_flow_mg": round(total_flow_mg, 4),
        "avg_daily_mg":  round(avg_daily_mg,  4),
        # Thresholds applied
        "bod_threshold":   bod_threshold,
        "tss_threshold":   tss_threshold,
        "color_threshold": color_threshold,
        # Average concentrations
        "bod_avg_conc":   bod_avg,
        "tss_avg_conc":   tss_avg,
        "color_avg_conc": color_avg,
        # Excess concentration (negative = below threshold = credit)
        "bod_excess_conc":   bod_excess_conc,
        "tss_excess_conc":   tss_excess_conc,
        "color_excess_conc": color_excess_conc,
        # Monthly excess loading in lbs (negative = credit)
        "bod_lbs":   bod_lbs,
        "tss_lbs":   tss_lbs,
        "color_lbs": color_lbs,
        # Charges (negative = credit)
        "bod_charge":   record.bod_charge,
        "tss_charge":   record.tss_charge,
        "color_charge": record.color_charge,
        "total_charge": record.total_charge,
        "invoice_id":   record.invoice_id,
        "flow_report_status": "reviewed",
    }


def _zero_result(company_id: int, month: int, year: int, days_in_month: int,
                 flow_report_status: str = "missing") -> dict:
    return {
        "company_id": company_id, "month": month, "year": year,
        "days_in_month": days_in_month, "avg_flow_mg": 0.0,
        "total_flow_mg": 0.0, "avg_daily_mg": 0.0,
        "bod_threshold": 0.0, "tss_threshold": 0.0, "color_threshold": 0.0,
        "bod_avg_conc": None, "tss_avg_conc": None, "color_avg_conc": None,
        "bod_excess_conc": 0.0, "tss_excess_conc": 0.0, "color_excess_conc": 0.0,
        "bod_lbs": 0.0, "tss_lbs": 0.0, "color_lbs": 0.0,
        "bod_charge": 0.0, "tss_charge": 0.0, "color_charge": 0.0,
        "total_charge": 0.0, "invoice_id": f"INV-{company_id}-{year}{month:02d}",
        "flow_report_status": flow_report_status,
    }
