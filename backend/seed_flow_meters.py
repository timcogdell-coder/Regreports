"""
Seed flow meters and meter readings for all companies, and update monthly
flow reports to use the meter measurement method.

Safe to run multiple times — skips meters/readings that already exist.
"""
from datetime import date

from app import app
from models import db, FlowMeter, MeterReading, MonthlyFlowReport

METERS = [
    dict(id=1, company_id=3, meter_id="KH-FM-001", description="Main process effluent meter",
         installation_date=date(2021, 11, 15), pulse_factor=1.0, unit="gallons", meter_type="process"),
    dict(id=2, company_id=4, meter_id="WF-FM-001", description="Process wastewater discharge meter",
         installation_date=date(2022,  3,  1), pulse_factor=1.0, unit="gallons", meter_type="process"),
    dict(id=3, company_id=7, meter_id="TC-FM-001", description="Test facility flow meter",
         installation_date=date(2025,  1,  1), pulse_factor=1.0, unit="gallons", meter_type="process"),
    dict(id=4, company_id=5, meter_id="CM-FM-001", description="Facility discharge meter",
         installation_date=date(2022,  2,  1), pulse_factor=1.0, unit="gallons", meter_type="process"),
]

# (meter_id FK, reading_start, reading_end, reading_date, period_days)
READINGS = [
    (1, 42_840_010, 42_914_150, date(2026, 4, 30), 30),
    (2,  2_500_000,  2_860_000, date(2026, 4, 30), 30),
    (3, 15_000_000, 17_400_000, date(2026, 4, 30), 30),
    (4,    800_000,    833_000, date(2026, 4, 30), 30),
]

with app.app_context():
    # --- flow meters ---
    for m in METERS:
        if not db.session.get(FlowMeter, m["id"]):
            db.session.add(FlowMeter(**m))
            print(f"  inserted meter {m['meter_id']} (company {m['company_id']})")
        else:
            print(f"  skipped meter {m['meter_id']} (already exists)")

    db.session.commit()

    # advance sequence so future auto-inserts don't collide
    from sqlalchemy import text
    db.session.execute(text("SELECT setval('tbl_flow_meters_id_seq', (SELECT MAX(id) FROM tbl_flow_meters))"))
    db.session.commit()

    # --- meter readings ---
    for meter_fk, start, end, rdate, days in READINGS:
        exists = MeterReading.query.filter_by(
            meter_id=meter_fk, reading_date=rdate, reading_purpose="monthly"
        ).first()
        if not exists:
            db.session.add(MeterReading(
                meter_id=meter_fk,
                reading_start=start,
                reading_end=end,
                reading_date=rdate,
                sampling_period_days=days,
                reading_purpose="monthly",
            ))
            print(f"  inserted reading for meter_id={meter_fk} ({rdate})")
        else:
            print(f"  skipped reading for meter_id={meter_fk} ({rdate}, already exists)")

    db.session.commit()

    # --- update flow reports to meter method ---
    updated = 0
    for meter in FlowMeter.query.all():
        reading = MeterReading.query.filter_by(
            meter_id=meter.id, reading_purpose="monthly"
        ).order_by(MeterReading.reading_date).first()
        if not reading:
            continue

        report = MonthlyFlowReport.query.filter_by(
            company_id=meter.company_id,
            report_month=reading.reading_date.month,
            report_year=reading.reading_date.year,
        ).first()
        if report and report.measurement_method != "meter":
            report.measurement_method = "meter"
            report.meter_id = meter.id
            report.beginning_read = reading.reading_start
            report.end_read = reading.reading_end
            updated += 1
            print(f"  updated flow report id={report.id} (company {meter.company_id}) → meter method")

    db.session.commit()
    print(f"\nDone. {updated} flow report(s) updated to meter method.")
