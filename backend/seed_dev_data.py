"""
Full development data seed for Regreports PIMS.

Inserts all companies, users, permits, samples, flow meters, violations,
ERG tables, and supporting lookup data.

Safe to run multiple times — uses ON CONFLICT (id) DO NOTHING throughout.

NOTE: The source database has orphaned FK references in tbl_permit_limits:
  - parameter_id values 9-16, 18, 20 not present in tbl_parameters
  - frequency_id values 21, 75 not present in tbl_frequency
  - limit_type_id value 25 not present in tbl_limit_type
Placeholder rows are inserted for all of these; update names as needed.
"""
from datetime import date, datetime

from sqlalchemy import text

from app import app
from models import User, db

# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

USERS = [
    dict(id=1, username="admin",        email="admin@regreports.com",        role="admin", company_id=None),
    dict(id=3, username="Roger Harmon", email="roger.harmon@kraftheinz.com", role="iu",    company_id=3),
    dict(id=4, username="Tim",          email="tc29108@icloud.com",           role="admin", company_id=None),
]
USER_PASSWORD = "admin123"   # same for all seed users — change after setup

COMPANIES = [
    dict(id=3, name="Kraft-Henize",    contact_person="Roger Harmon", phone="803 321-1513", email="roger.harmon@kraftheniz.com", is_active=True),
    dict(id=4, name="West Fraser",     contact_person="Bart Simpson",  phone=None,           email="bart@dummy.com",               is_active=True),
    dict(id=5, name="Cal-Maine",       contact_person="Robert Ellis",  phone=None,           email=None,                           is_active=True),
    dict(id=7, name="Testing Company", contact_person="Tim",           phone=None,           email=None,                           is_active=True),
]

# IDs 1-8 are real; 9-16, 18, 20 are placeholders for orphaned FK references.
PARAMETERS = [
    dict(id=1,  name="Biochemical Oxygen Demand", abbreviation="BOD",   conversion_factor=8.34),
    dict(id=2,  name="Total Suspended Solids",    abbreviation="TSS",   conversion_factor=8.34),
    dict(id=3,  name="Color",                     abbreviation="COLOR", conversion_factor=8.34),
    dict(id=4,  name="Phosphorus",                abbreviation="P",     conversion_factor=8.34),
    dict(id=5,  name="pH",                        abbreviation="pH",    conversion_factor=1.0),
    dict(id=6,  name="Oil and Grease",            abbreviation="O&G",   conversion_factor=8.34),
    dict(id=7,  name="Plant Flow (Max)",          abbreviation="PFMax", conversion_factor=0.0),
    dict(id=8,  name="Plant Flow (Avg)",          abbreviation="PFAvg", conversion_factor=0.0),
    dict(id=9,  name="Ammonia Nitrogen",       abbreviation="NH3-N", conversion_factor=8.34),
    dict(id=10, name="Copper",                abbreviation="Cu",    conversion_factor=8.34),
    dict(id=11, name="Zinc",                  abbreviation="Zn",    conversion_factor=8.34),
    dict(id=12, name="Lead",                  abbreviation="Pb",    conversion_factor=8.34),
    dict(id=13, name="Chromium Total",        abbreviation="Cr",    conversion_factor=8.34),
    dict(id=14, name="Nickel",                abbreviation="Ni",    conversion_factor=8.34),
    dict(id=15, name="Temperature",           abbreviation="Temp",  conversion_factor=1.0),
    dict(id=16, name="Total Dissolved Solids",abbreviation="TDS",   conversion_factor=8.34),
    dict(id=18, name="Daily Flow Maximum",    abbreviation="QD",    conversion_factor=0.0),
    dict(id=20, name="Monthly Average Flow",  abbreviation="QM",    conversion_factor=0.0),
]

FREQUENCIES = [
    dict(id=1,  frequency_code="1/1",   description="Daily"),
    dict(id=2,  frequency_code="1/7",   description="Weekly"),
    dict(id=3,  frequency_code="1/30",  description="Monthly"),
    dict(id=4,  frequency_code="1/90",  description="Quarterly"),
    dict(id=21, frequency_code="N/A-21", description="[placeholder — update]"),
    dict(id=75, frequency_code="N/A-75", description="[placeholder — update]"),
]

LIMIT_TYPES = [
    dict(id=1,  type_name="daily_max",     description="Daily Maximum"),
    dict(id=2,  type_name="monthly_avg",   description="Monthly Average"),
    dict(id=3,  type_name="instantaneous", description="Instantaneous Maximum"),
    dict(id=25, type_name="unknown-25",    description="[placeholder — update]"),
]

PERMITS = [
    dict(id=2, company_id=3, permit_number="004",   effective_date=date(2022,1,1), expiration_date=date(2027,1,1), is_active=True),
    dict(id=4, company_id=4, permit_number="012",   effective_date=date(2022,5,1), expiration_date=date(2027,5,1), is_active=True),
    dict(id=5, company_id=5, permit_number="002",   effective_date=date(2022,4,1), expiration_date=date(2027,4,1), is_active=True),
    dict(id=7, company_id=7, permit_number="00001", effective_date=date(2025,1,1), expiration_date=date(2027,1,1), is_active=True),
]

# (id, permit_id, parameter_id, daily_max_conc, daily_max_load, weekly_max_conc, weekly_max_load,
#  monthly_avg_conc, monthly_avg_load, frequency_id, limit_type_id, sample_type,
#  is_monitor_report, is_range_limit, min_value, max_value, range_unit, is_flow_limit, averaging_period)
PERMIT_LIMITS = [
    # Kraft-Henize (permit 2)
    ( 8, 2,  1, None,  None,  None, None, 2.0,  None,  None, None, "composite", False, False, None, None,  "s.u.", False, None),
    ( 9, 2,  2, None,  None,  None, None, 2.0,  None,  None, None, "composite", False, False, None, None,  "s.u.", False, None),
    (10, 2,  5, None,  None,  None, None, 3.0,  None,  None, None, "grab",      False, True,  6.0,  10.0,  "s.u.", False, None),
    (18, 2,  7, None,  None,  None, None, 2.0,  None,  None, None, "composite", True,  False, None, None,  "s.u.", False, None),
    (19, 2,  6, None,  1168,  None, 751,  3.0,  None,  None, None, "grab",      False, False, None, None,  "s.u.", False, None),
    (20, 2,  8, None,  None,  None, None, 3.0,  None,  None, None, "grab",      False, True,  5.0,  None,  "mg/L", False, None),
    (21, 2,  9, None,  None,  None, None, 3.0,  None,  None, None, "composite", True,  False, None, None,  "s.u.", False, None),
    (22, 2, 10, 11.0,  None,  None, None, 3.0,  None,  None, None, "composite", False, False, None, None,  "s.u.", False, None),
    (23, 2, 11, None,  None,  None, None, 3.0,  None,  None, None, "composite", True,  False, None, None,  "s.u.", False, None),
    (24, 2, 12, None,  None,  None, None, 3.0,  None,  None, None, "composite", True,  False, None, None,  "s.u.", False, None),
    (25, 2, 13, None,  None,  None, None, 3.0,  None,  None, None, "composite", True,  False, None, None,  "s.u.", False, None),
    (26, 2, 14, None,  None,  None, None, 3.0,  None,  None, None, "composite", True,  False, None, None,  "s.u.", False, None),
    (27, 2, 15, None,  None,  None, None, 3.0,  None,  None, None, "grab",      False, True,  None, 100.0, "°F",   False, None),
    (28, 2, 16, None,  None,  None, None, 2.0,  None,  None, None, "composite", True,  False, None, None,  "s.u.", False, None),
    (29, 2,  4, None,  100,   None, 54,   6.0,  None,  None, None, "composite", False, False, None, None,  "s.u.", False, None),
    (51, 2, 18, 1.5,   None,  None, None, 3.0,  None,  None, None, "grab",      False, False, None, None,  "s.u.", True,  "daily_max"),
    (52, 2, 20, 1.3,   None,  None, None, 3.0,  None,  None, None, "grab",      False, False, None, None,  "s.u.", True,  "daily_max"),
    # West Fraser (permit 4)
    (33, 4,  9, None,  None,  None, 15,   3.0,  None,  21,   None, "composite", False, False, None, None,  "s.u.", False, None),
    (34, 4,  2, None,  113,   None, 21,   3.0,  None,  None, None, "composite", False, False, None, None,  "s.u.", False, None),
    (35, 4,  1, None,  600,   None, 350,  3.0,  None,  None, None, "composite", False, False, None, None,  "s.u.", False, None),
    (36, 4,  6, 100.0, 30,    75.0, 3,    3.0,  None,  None, None, "grab",      False, False, None, None,  "s.u.", False, None),
    (37, 4, 15, None,  None,  None, None, 3.0,  None,  None, None, "grab",      False, True,  None, 140.0, "°F",   False, None),
    (38, 4, 11, None,  None,  None, None, 3.0,  None,  None, None, "composite", True,  False, None, None,  "s.u.", False, None),
    (39, 4, 12, None,  None,  None, None, 3.0,  None,  None, None, "composite", True,  False, None, None,  "s.u.", False, None),
    (40, 4, 10, None,  None,  None, None, 3.0,  None,  None, None, "composite", True,  False, None, None,  "s.u.", False, None),
    # Cal-Maine (permit 5)
    (41, 5,  1, None,  934,   None, 667,  3.0,  None,  None, None, "composite", False, False, None, None,  "s.u.", False, None),
    (42, 5,  2, None,  625,   None, 500,  3.0,  None,  None, None, "composite", False, False, None, None,  "s.u.", False, None),
    (43, 5,  4, None,  17,    None, 8.3,  3.0,  None,  None, None, "composite", False, False, None, None,  "s.u.", False, None),
    (44, 5,  5, None,  None,  None, None, 3.0,  None,  None, None, "grab",      False, True,  6.0,  10.0,  "s.u.", False, None),
    (45, 5, 18, 0.12,  None,  None, None, 3.0,  None,  None, None, "grab",      False, False, None, None,  "s.u.", True,  "daily_max"),
    (46, 5, 20, None,  None,  0.08, None, 3.0,  None,  None, None, "grab",      False, False, None, None,  "s.u.", True,  "monthly_avg"),
    (47, 5, 15, None,  None,  None, None, 3.0,  None,  None, None, "grab",      False, True,  None, 140.0, "°F",   False, None),
    # Testing Company (permit 7)
    (48, 7, 18, 0.5,   None,  None, None, 3.0,  None,  None, None, "continuous", False, False, None, None, "s.u.", True,  "daily_max"),
    (49, 7, 20, None,  None,  0.4,  None, 3.0,  None,  None, None, "continuous", False, False, None, None, "s.u.", True,  "monthly_avg"),
    (50, 7,  5, None,  None,  None, None, 3.0,  None,  None, None, "grab",      False, True,  6.0,  14.0,  "s.u.", False, None),
    (53, 7,  1, 30.0,  50,    18.0, 200,  3.0,  None,  75,   25,   "composite", False, False, None, None,  "s.u.", False, None),
]

FLOW_METERS = [
    dict(id=1, company_id=3, meter_id="KH-FM-001", description="Main process effluent meter",         installation_date=date(2021,11,15), pulse_factor=1.0, unit="gallons", meter_type="process", is_active=True),
    dict(id=2, company_id=4, meter_id="WF-FM-001", description="Process wastewater discharge meter",  installation_date=date(2022, 3, 1), pulse_factor=1.0, unit="gallons", meter_type="process", is_active=True),
    dict(id=3, company_id=7, meter_id="TC-FM-001", description="Test facility flow meter",            installation_date=date(2025, 1, 1), pulse_factor=1.0, unit="gallons", meter_type="process", is_active=True),
    dict(id=4, company_id=5, meter_id="CM-FM-001", description="Facility discharge meter",            installation_date=date(2022, 2, 1), pulse_factor=1.0, unit="gallons", meter_type="process", is_active=True),
]

# (id, company_id, permit_id, sample_date, sampler_name, temperature, coc_form_data, flow_mgd, sampling_days, submitted_by, review_status, reviewed_by, is_corrected)
SAMPLES = [
    ( 3, 3, 2, date(2025,12, 3), "eurofins",        None,  "100",  0.368,               31, 3, "reviewed", 1, False),
    ( 4, 3, 2, date(2025,12,10), "eurofins",        None,  "100",  0.398,               31, 3, "reviewed", 4, False),
    ( 5, 3, 2, date(2025,12,17), "eurofins",        None,  "100",  0.455,               31, 3, "reviewed", 4, False),
    ( 6, 3, 2, date(2025,12,23), "eurofins",        None,  "100",  0.603,               31, 3, "reviewed", 4, False),
    (10, 3, 2, date(2025,12,31), "eurofins",        None,  "100",  0.011935483870967743, 31, 4, "reviewed", 4, False),
    (13, 3, 2, date(2026, 4, 1), "eurofins",        None,  "100",  0.398,               30, 4, "reviewed", 4, False),
    (14, 3, 2, date(2026, 4, 8), "eurofins",        None,  "100",  0.386,               30, 4, "reviewed", 4, False),
    (15, 3, 2, date(2026, 4,15), "eurofins",        None,  "100",  0.396,               30, 4, "reviewed", 4, False),
    (16, 3, 2, date(2026, 4,22), "eurofins",        None,  "100",  0.437,               30, 4, "reviewed", 4, False),
    (18, 3, 2, date(2026, 4,29), "eurofins",        None,  "100",  0.436,               30, 4, "reviewed", 4, False),
    (21, 5, 5, date(2026, 4, 7), "eurofins",        None,  "1",    0.059054,            30, 4, "reviewed", 4, False),
    (22, 4, 4, date(2026, 4,14), "Pace Analytical", None,  "1",    0.000841,            30, 4, "reviewed", 4, False),
    (23, 7, 7, date(2026, 4,30), "self",            None,  "1",    None,                30, 4, "reviewed", 4, False),
    (24, 7, 7, date(2026, 4, 8), "self",            None,  "1",    None,                30, 4, "reviewed", 4, False),
]

# (id, sample_id, permit_limit_id, concentration_result, loading_result)
SAMPLE_RESULTS = [
    (  4,  3,  8, 600.0,  1841.472),
    (  5,  3,  9, 120.0,   368.294),
    (  6,  3, 10,   7.8,     2.870),
    (  7,  3, 19,  10.0,    30.691),
    (  8,  3, 20,   7.0,    21.484),
    (  9,  3, 21,   7.9,    24.246),
    ( 10,  3, 22,   0.049,   0.150),
    ( 11,  3, 23,   0.0065,  0.020),
    ( 12,  3, 24,   0.023,   0.071),
    ( 13,  3, 25,   0.0,     0.0),
    ( 14,  3, 26,   0.0,     0.0),
    ( 15,  3, 27,  21.0,    64.452),
    ( 16,  4,  8, 520.0,  1726.046),
    ( 17,  4,  9,  95.0,   315.335),
    ( 18,  4, 10,   7.4,     2.945),
    ( 19,  4, 18,1300.0,  4315.116),
    ( 20,  4, 20,   6.8,    22.571),
    ( 21,  4, 21,   7.2,    23.899),
    ( 22,  4, 27,  20.0,    66.386),
    ( 23,  4, 28,  42.0,   139.411),
    ( 24,  4, 29,  10.0,    33.193),
    ( 25,  5,  8, 360.0,  1366.092),
    ( 26,  5,  9,  45.0,   170.762),
    ( 27,  5, 10,   7.3,     3.322),
    ( 28,  5, 18,1200.0,  4553.640),
    ( 29,  5, 20,   7.0,    26.563),
    ( 30,  5, 21,   7.3,    27.701),
    ( 31,  5, 27,  22.5,    85.381),
    ( 32,  5, 29,  11.0,    41.742),
    ( 33,  6,  8, 340.0,  1709.867),
    ( 34,  6,  9,  45.0,   226.306),
    ( 35,  6, 10,   7.9,     4.764),
    ( 36,  6, 18, 990.0,  4978.730),
    ( 37,  6, 20,   7.0,    35.203),
    ( 38,  6, 21,   6.3,    31.683),
    ( 39,  6, 27,  26.0,   130.755),
    ( 40,  6, 28,  34.0,   170.987),
    ( 41,  6, 29,  12.0,    60.348),
    ( 61, 10, 21,   7.7,     0.767),
    ( 62, 10,  8, 440.0,    43.799),
    ( 63, 10, 28,  58.0,     5.773),
    ( 64, 10, 29,  10.0,     0.995),
    ( 65, 10, 18,1000.0,    99.542),
    ( 66, 10,  9, 250.0,    24.886),
    ( 67, 10, 27,  20.0,     1.991),
    ( 68, 10, 10,   8.0,     0.096),
    ( 69, 13,  8, 320.0,  1062.182),
    ( 70, 13,  9, 160.0,   531.091),
    ( 71, 13, 10,   7.1,     2.826),
    ( 72, 13, 18, 890.0,  2954.195),
    ( 73, 13, 19,  12.0,    39.832),
    ( 74, 13, 20,   7.0,    23.235),
    ( 75, 13, 21,   1.5,     4.979),
    ( 76, 13, 22,   0.045,   0.149),
    ( 77, 13, 23,   0.006,   0.020),
    ( 78, 13, 24,   0.0016,  0.005),
    ( 79, 13, 25,   0.0,     0.0),
    ( 80, 13, 27,  25.0,    82.983),
    ( 81, 13, 28,  16.0,    53.109),
    ( 82, 13, 29,  11.0,    36.513),
    ( 83, 14,  8, 210.0,   676.040),
    ( 84, 14,  9,  34.0,   109.454),
    ( 85, 14, 10,   6.9,     2.663),
    ( 86, 14, 18, 890.0,  2865.124),
    ( 87, 14, 20,   7.0,    22.535),
    ( 88, 14, 21,   3.2,    10.302),
    ( 89, 14, 27,  20.0,    64.385),
    ( 90, 14, 28,  18.0,    57.946),
    ( 91, 14, 29,   6.2,    19.959),
    ( 92, 15,  8, 390.0,  1288.030),
    ( 93, 15,  9, 170.0,   561.449),
    ( 94, 15, 10,   8.2,     3.247),
    ( 95, 15, 18,1200.0,  3963.168),
    ( 96, 15, 20,   7.0,    23.118),
    ( 97, 15, 21,   4.2,    13.871),
    ( 98, 15, 27,  28.0,    92.474),
    ( 99, 15, 28,  29.0,    95.777),
    (100, 15, 29,  11.0,    36.329),
    (101, 16,  8, 640.0,  2332.531),
    (102, 16,  9, 190.0,   692.470),
    (103, 16, 10,   7.3,     3.190),
    (104, 16, 18,1200.0,  4373.496),
    (105, 16, 20,   7.0,    25.512),
    (106, 16, 21,   3.0,    10.934),
    (107, 16, 27,  26.0,    94.759),
    (108, 16, 29,  15.0,    54.669),
    (118, 18,  8,   0.0,     0.0),
    (119, 18,  9, 170.0,   618.161),
    (120, 18, 18, 920.0,  3345.341),
    (121, 18, 21,   8.7,    31.635),
    (122, 18, 22,  -1.0,    -3.636),
    (138, 21, 41, 200.0,    98.502),
    (139, 21, 42,  38.0,    18.715),
    (140, 21, 43,   0.89,    0.438),
    (141, 21, 44,   6.6,     0.390),
    (142, 21, 45,   0.0463,  0.003),
    (143, 21, 46,   0.0735,  None),
    (144, 21, 47,  21.0,    10.343),
    (145, 22, 33,   1.5,     0.011),
    (146, 22, 34, 160.0,     1.122),
    (147, 22, 35, 320.0,     2.244),
    (148, 22, 36,  16.0,     0.112),
    (149, 22, 38,   5.8,     0.041),
    (150, 22, 39,  16.0,     0.112),
    (151, 22, 40, 450.0,     3.156),
    (152, 23, 50,   7.2,     None),
    (153, 18, 19,   5.0,    18.181),
    (155, 22, 37,  21.0,     0.147),
    (156, 18, 10,   7.1,     3.096),
    (157, 24, 50,   7.2,     None),
    (158, 24, 53,  65.0,     None),
]

METER_READINGS = [
    dict(id=1, meter_id=1, reading_start=42_840_010, reading_end=42_914_150, reading_date=date(2026,4,30), sampling_period_days=30, reading_purpose="monthly", sample_id=None),
    dict(id=2, meter_id=2, reading_start= 2_500_000, reading_end= 2_860_000, reading_date=date(2026,4,30), sampling_period_days=30, reading_purpose="monthly", sample_id=None),
    dict(id=3, meter_id=3, reading_start=15_000_000, reading_end=17_400_000, reading_date=date(2026,4,30), sampling_period_days=30, reading_purpose="monthly", sample_id=None),
    dict(id=4, meter_id=4, reading_start=   800_000, reading_end=   833_000, reading_date=date(2026,4,30), sampling_period_days=30, reading_purpose="monthly", sample_id=None),
]

MONTHLY_FLOW_REPORTS = [
    dict(id=2, company_id=4, meter_id=2, report_month=4, report_year=2026, period_days=30,
         measurement_method="meter", beginning_read=2_500_000, end_read=2_860_000,
         total_flow_mg=0.36, monthly_avg_mgd=0.012, daily_max_mgd=0.016, weekly_max_mgd=0.014,
         submitted_by="Tim", review_status="reviewed", reviewed_by=4),
    dict(id=4, company_id=7, meter_id=3, report_month=4, report_year=2026, period_days=30,
         measurement_method="meter", beginning_read=15_000_000, end_read=17_400_000,
         total_flow_mg=2.4, monthly_avg_mgd=0.08, daily_max_mgd=0.11, weekly_max_mgd=0.16,
         submitted_by="Tim", review_status="reviewed", reviewed_by=4),
    dict(id=5, company_id=3, meter_id=1, report_month=4, report_year=2026, period_days=30,
         measurement_method="meter", beginning_read=42_840_010, end_read=42_914_150,
         total_flow_mg=7.414, monthly_avg_mgd=0.247133, daily_max_mgd=0.545, weekly_max_mgd=0.395,
         submitted_by="Tim", review_status="reviewed", reviewed_by=4),
    dict(id=6, company_id=5, meter_id=4, report_month=4, report_year=2026, period_days=30,
         measurement_method="meter", beginning_read=800_000, end_read=833_000,
         total_flow_mg=0.033, monthly_avg_mgd=0.0011, daily_max_mgd=0.0596, weekly_max_mgd=None,
         submitted_by="Tim", review_status="reviewed", reviewed_by=4),
]

ERG_MATRIX = [
    dict(id=1,  violation_category="discharge_limit", is_recurring=False, has_harm=False, response_level="warning",     fine_amount=0),
    dict(id=2,  violation_category="discharge_limit", is_recurring=True,  has_harm=False, response_level="ao",          fine_amount=250),
    dict(id=3,  violation_category="discharge_limit", is_recurring=False, has_harm=True,  response_level="ao",          fine_amount=2000),
    dict(id=4,  violation_category="discharge_limit", is_recurring=True,  has_harm=True,  response_level="civil",       fine_amount=5000),
    dict(id=5,  violation_category="reporting",       is_recurring=False, has_harm=False, response_level="phone_call",  fine_amount=0),
    dict(id=6,  violation_category="reporting",       is_recurring=True,  has_harm=False, response_level="ao",          fine_amount=250),
    dict(id=7,  violation_category="reporting",       is_recurring=False, has_harm=True,  response_level="ao",          fine_amount=5000),
    dict(id=8,  violation_category="reporting",       is_recurring=True,  has_harm=True,  response_level="civil",       fine_amount=5000),
    dict(id=9,  violation_category="monitoring",      is_recurring=False, has_harm=False, response_level="warning",     fine_amount=0),
    dict(id=10, violation_category="monitoring",      is_recurring=True,  has_harm=False, response_level="ao",          fine_amount=500),
    dict(id=11, violation_category="monitoring",      is_recurring=False, has_harm=True,  response_level="civil",       fine_amount=5000),
    dict(id=12, violation_category="monitoring",      is_recurring=True,  has_harm=True,  response_level="civil",       fine_amount=10000),
    dict(id=13, violation_category="schedule_miss",   is_recurring=False, has_harm=False, response_level="warning",     fine_amount=0),
    dict(id=14, violation_category="schedule_miss",   is_recurring=True,  has_harm=False, response_level="ao",          fine_amount=100),
    dict(id=15, violation_category="schedule_miss",   is_recurring=False, has_harm=True,  response_level="civil",       fine_amount=5000),
    dict(id=16, violation_category="schedule_miss",   is_recurring=True,  has_harm=True,  response_level="termination", fine_amount=0),
]

ERG_FINE_SCHEDULE = [
    dict(id=1, response_level="phone_call", fine_min=0,     fine_max=0),
    dict(id=2, response_level="warning",    fine_min=0,     fine_max=0),
    dict(id=3, response_level="nov",        fine_min=0,     fine_max=0),
    dict(id=4, response_level="ao",         fine_min=250,   fine_max=5000),
    dict(id=5, response_level="civil",      fine_min=5000,  fine_max=50000),
    dict(id=6, response_level="criminal",   fine_min=10000, fine_max=100000),
    dict(id=7, response_level="termination",fine_min=0,     fine_max=0),
]

# (id, company_id, parameter_id, permit_limit_id, sample_id, violation_type, violation_date, violation_severity, exceedance_percent)
VIOLATIONS = [
    (  1, 3,  1,  8, 16, "avg_exceeds",        date(2026, 4,22), "major",       15500.0),
    (  2, 3,  2,  9, 16, "avg_exceeds",        date(2026, 4,22), "major",       7140.0),
    (  3, 3,  7, 18, 16, "avg_exceeds",        date(2026, 4,22), "major",       50900.0),
    (266, 4, 15, 37, None, "missing_sample",   date(2022, 5,31), "significant", None),
    (267, 4, 15, 37, None, "missing_sample",   date(2022, 6,30), "significant", None),
    (268, 4, 15, 37, None, "missing_sample",   date(2022, 7,30), "significant", None),
    (269, 4, 15, 37, None, "missing_sample",   date(2022, 8,29), "significant", None),
    (270, 4, 15, 37, None, "missing_sample",   date(2022, 9,28), "significant", None),
    (271, 4, 15, 37, None, "missing_sample",   date(2022,10,28), "significant", None),
    (272, 4, 15, 37, None, "missing_sample",   date(2022,11,27), "significant", None),
    (273, 4, 15, 37, None, "missing_sample",   date(2022,12,27), "significant", None),
    (274, 4, 15, 37, None, "missing_sample",   date(2023, 1,26), "significant", None),
    (275, 4, 15, 37, None, "missing_sample",   date(2023, 2,25), "significant", None),
    (276, 4, 15, 37, None, "missing_sample",   date(2023, 3,27), "significant", None),
    (277, 4, 15, 37, None, "missing_sample",   date(2023, 4,26), "significant", None),
    (282, 7,  1, 53, 24, "max_exceeds",        date(2026, 4, 8), "major",       116.667),
    (283, 7,  1, 53, 24, "weekly_avg_exceeds", date(2026, 4, 8), "major",       160.0),
    (284, 7,  1, 53, 24, "avg_exceeds",        date(2026, 4, 8), "major",       261.111),
]

# auto_generated_response is omitted — regenerated when coordinator approves.
ENFORCEMENT_HISTORY = [
    dict(id=7, company_id=7, violation_id=282, response_level="criminal", status="pending", fine_amount=10000.0),
    dict(id=8, company_id=7, violation_id=283, response_level="criminal", status="pending", fine_amount=10000.0),
    dict(id=9, company_id=7, violation_id=284, response_level="criminal", status="pending", fine_amount=10000.0),
]

SURCHARGE_CALCULATIONS = [
    dict(id=4, company_id=3, month=4, year=2026, bod_charge=-422.94,  tss_charge=-1727.36, color_charge=0.0, total_charge=-2150.30,  invoice_id="INV-3-202604"),
    dict(id=5, company_id=4, month=4, year=2026, bod_charge=-16.21,   tss_charge=-75.66,   color_charge=0.0, total_charge=-91.87,    invoice_id="INV-4-202604"),
    dict(id=6, company_id=5, month=4, year=2026, bod_charge=-180.14,  tss_charge=-314.65,  color_charge=0.0, total_charge=-494.79,   invoice_id="INV-5-202604"),
]

# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------

def _upsert(conn, stmt, rows):
    if rows:
        conn.execute(text(stmt), rows)
        conn.commit()


with app.app_context():
    # --- Users (ORM for password hashing) ---
    for u in USERS:
        if not db.session.get(User, u["id"]):
            user = User(id=u["id"], username=u["username"], email=u["email"],
                        role=u["role"], company_id=u["company_id"])
            user.set_password(USER_PASSWORD)
            db.session.add(user)
            print(f"  inserted user {u['username']}")
        else:
            print(f"  skipped user {u['username']} (exists)")
    db.session.commit()

    with db.engine.connect() as conn:
        # Companies
        _upsert(conn, """
            INSERT INTO tbl_company (id, name, contact_person, phone, email, is_active)
            VALUES (:id,:name,:contact_person,:phone,:email,:is_active)
            ON CONFLICT (id) DO NOTHING
        """, COMPANIES)
        print(f"  companies: {len(COMPANIES)} rows")

        # Parameters (including placeholders for orphaned FK targets)
        _upsert(conn, """
            INSERT INTO tbl_parameters (id, name, abbreviation, conversion_factor)
            VALUES (:id,:name,:abbreviation,:conversion_factor)
            ON CONFLICT (id) DO NOTHING
        """, PARAMETERS)
        print(f"  parameters: {len(PARAMETERS)} rows")

        # Frequencies (including placeholders)
        _upsert(conn, """
            INSERT INTO tbl_frequency (id, frequency_code, description)
            VALUES (:id,:frequency_code,:description)
            ON CONFLICT (id) DO NOTHING
        """, FREQUENCIES)
        print(f"  frequencies: {len(FREQUENCIES)} rows")

        # Limit types (including placeholder)
        _upsert(conn, """
            INSERT INTO tbl_limit_type (id, type_name, description)
            VALUES (:id,:type_name,:description)
            ON CONFLICT (id) DO NOTHING
        """, LIMIT_TYPES)
        print(f"  limit_types: {len(LIMIT_TYPES)} rows")

        # Permits
        _upsert(conn, """
            INSERT INTO tbl_permits (id, company_id, permit_number, effective_date, expiration_date, is_active)
            VALUES (:id,:company_id,:permit_number,:effective_date,:expiration_date,:is_active)
            ON CONFLICT (id) DO NOTHING
        """, PERMITS)
        print(f"  permits: {len(PERMITS)} rows")

        # Permit limits
        pl_rows = [dict(
            id=r[0], permit_id=r[1], parameter_id=r[2],
            daily_max_concentration=r[3], daily_max_loading=r[4],
            weekly_max_concentration=r[5], weekly_max_loading=r[6],
            monthly_avg_concentration=r[7], monthly_avg_loading=r[8],
            frequency_id=r[9], limit_type_id=r[10], sample_type=r[11],
            is_monitor_report=r[12], is_range_limit=r[13],
            min_value=r[14], max_value=r[15], range_unit=r[16],
            is_flow_limit=r[17], averaging_period=r[18],
        ) for r in PERMIT_LIMITS]
        _upsert(conn, """
            INSERT INTO tbl_permit_limits (
                id, permit_id, parameter_id,
                daily_max_concentration, daily_max_loading,
                weekly_max_concentration, weekly_max_loading,
                monthly_avg_concentration, monthly_avg_loading,
                frequency_id, limit_type_id, sample_type,
                is_monitor_report, is_range_limit,
                min_value, max_value, range_unit,
                is_flow_limit, averaging_period
            ) VALUES (
                :id,:permit_id,:parameter_id,
                :daily_max_concentration,:daily_max_loading,
                :weekly_max_concentration,:weekly_max_loading,
                :monthly_avg_concentration,:monthly_avg_loading,
                :frequency_id,:limit_type_id,:sample_type,
                :is_monitor_report,:is_range_limit,
                :min_value,:max_value,:range_unit,
                :is_flow_limit,:averaging_period
            ) ON CONFLICT (id) DO NOTHING
        """, pl_rows)
        print(f"  permit_limits: {len(pl_rows)} rows")

        # Flow meters
        _upsert(conn, """
            INSERT INTO tbl_flow_meters (id, company_id, meter_id, description, installation_date, pulse_factor, unit, meter_type, is_active)
            VALUES (:id,:company_id,:meter_id,:description,:installation_date,:pulse_factor,:unit,:meter_type,:is_active)
            ON CONFLICT (id) DO NOTHING
        """, FLOW_METERS)
        print(f"  flow_meters: {len(FLOW_METERS)} rows")

        # Samples
        s_rows = [dict(
            id=r[0], company_id=r[1], permit_id=r[2], sample_date=r[3],
            sampler_name=r[4], temperature=r[5], coc_form_data=r[6],
            flow_mgd=r[7], sampling_days=r[8], submitted_by=r[9],
            review_status=r[10], reviewed_by=r[11], is_corrected=r[12],
        ) for r in SAMPLES]
        _upsert(conn, """
            INSERT INTO tbl_sample (id, company_id, permit_id, sample_date, sampler_name, temperature,
                coc_form_data, flow_mgd, sampling_days, submitted_by, review_status, reviewed_by, is_corrected)
            VALUES (:id,:company_id,:permit_id,:sample_date,:sampler_name,:temperature,
                :coc_form_data,:flow_mgd,:sampling_days,:submitted_by,:review_status,:reviewed_by,:is_corrected)
            ON CONFLICT (id) DO NOTHING
        """, s_rows)
        print(f"  samples: {len(s_rows)} rows")

        # Sample results
        sr_rows = [dict(id=r[0], sample_id=r[1], permit_limit_id=r[2],
                        concentration_result=r[3], loading_result=r[4]) for r in SAMPLE_RESULTS]
        _upsert(conn, """
            INSERT INTO tbl_sample_results (id, sample_id, permit_limit_id, concentration_result, loading_result)
            VALUES (:id,:sample_id,:permit_limit_id,:concentration_result,:loading_result)
            ON CONFLICT (id) DO NOTHING
        """, sr_rows)
        print(f"  sample_results: {len(sr_rows)} rows")

        # Meter readings
        _upsert(conn, """
            INSERT INTO tbl_meter_readings (id, meter_id, reading_start, reading_end, reading_date,
                sampling_period_days, reading_purpose, sample_id)
            VALUES (:id,:meter_id,:reading_start,:reading_end,:reading_date,
                :sampling_period_days,:reading_purpose,:sample_id)
            ON CONFLICT (id) DO NOTHING
        """, METER_READINGS)
        print(f"  meter_readings: {len(METER_READINGS)} rows")

        # Monthly flow reports
        _upsert(conn, """
            INSERT INTO tbl_monthly_flow_reports (id, company_id, meter_id, report_month, report_year,
                period_days, measurement_method, beginning_read, end_read,
                total_flow_mg, monthly_avg_mgd, daily_max_mgd, weekly_max_mgd,
                submitted_by, review_status, reviewed_by)
            VALUES (:id,:company_id,:meter_id,:report_month,:report_year,
                :period_days,:measurement_method,:beginning_read,:end_read,
                :total_flow_mg,:monthly_avg_mgd,:daily_max_mgd,:weekly_max_mgd,
                :submitted_by,:review_status,:reviewed_by)
            ON CONFLICT (id) DO NOTHING
        """, MONTHLY_FLOW_REPORTS)
        print(f"  monthly_flow_reports: {len(MONTHLY_FLOW_REPORTS)} rows")

        # ERG matrix
        _upsert(conn, """
            INSERT INTO tbl_erg_matrix (id, violation_category, is_recurring, has_harm, response_level, fine_amount)
            VALUES (:id,:violation_category,:is_recurring,:has_harm,:response_level,:fine_amount)
            ON CONFLICT (id) DO NOTHING
        """, ERG_MATRIX)
        print(f"  erg_matrix: {len(ERG_MATRIX)} rows")

        # ERG fine schedule
        _upsert(conn, """
            INSERT INTO tbl_erg_fine_schedule (id, response_level, fine_min, fine_max)
            VALUES (:id,:response_level,:fine_min,:fine_max)
            ON CONFLICT (id) DO NOTHING
        """, ERG_FINE_SCHEDULE)
        print(f"  erg_fine_schedule: {len(ERG_FINE_SCHEDULE)} rows")

        # Violations
        v_rows = [dict(
            id=r[0], company_id=r[1], parameter_id=r[2], permit_limit_id=r[3],
            sample_id=r[4], violation_type=r[5], violation_date=r[6],
            violation_severity=r[7], exceedance_percent=r[8],
        ) for r in VIOLATIONS]
        _upsert(conn, """
            INSERT INTO tbl_violations (id, company_id, parameter_id, permit_limit_id, sample_id,
                violation_type, violation_date, violation_severity, exceedance_percent)
            VALUES (:id,:company_id,:parameter_id,:permit_limit_id,:sample_id,
                :violation_type,:violation_date,:violation_severity,:exceedance_percent)
            ON CONFLICT (id) DO NOTHING
        """, v_rows)
        print(f"  violations: {len(v_rows)} rows")

        # Enforcement history
        _upsert(conn, """
            INSERT INTO tbl_enforcement_history (id, company_id, violation_id, response_level, status, fine_amount)
            VALUES (:id,:company_id,:violation_id,:response_level,:status,:fine_amount)
            ON CONFLICT (id) DO NOTHING
        """, ENFORCEMENT_HISTORY)
        print(f"  enforcement_history: {len(ENFORCEMENT_HISTORY)} rows")

        # Surcharge calculations
        _upsert(conn, """
            INSERT INTO tbl_surcharge_calculations (id, company_id, month, year, bod_charge, tss_charge, color_charge, total_charge, invoice_id)
            VALUES (:id,:company_id,:month,:year,:bod_charge,:tss_charge,:color_charge,:total_charge,:invoice_id)
            ON CONFLICT (id) DO NOTHING
        """, SURCHARGE_CALCULATIONS)
        print(f"  surcharge_calculations: {len(SURCHARGE_CALCULATIONS)} rows")

        # Advance all sequences
        sequences = [
            ("tbl_users_id_seq",                    "tbl_users"),
            ("tbl_company_id_seq",                  "tbl_company"),
            ("tbl_parameters_id_seq",               "tbl_parameters"),
            ("tbl_frequency_id_seq",                "tbl_frequency"),
            ("tbl_limit_type_id_seq",               "tbl_limit_type"),
            ("tbl_permits_id_seq",                  "tbl_permits"),
            ("tbl_permit_limits_id_seq",            "tbl_permit_limits"),
            ("tbl_flow_meters_id_seq",              "tbl_flow_meters"),
            ("tbl_sample_id_seq",                   "tbl_sample"),
            ("tbl_sample_results_id_seq",           "tbl_sample_results"),
            ("tbl_meter_readings_id_seq",           "tbl_meter_readings"),
            ("tbl_monthly_flow_reports_id_seq",     "tbl_monthly_flow_reports"),
            ("tbl_erg_matrix_id_seq",               "tbl_erg_matrix"),
            ("tbl_erg_fine_schedule_id_seq",        "tbl_erg_fine_schedule"),
            ("tbl_violations_id_seq",               "tbl_violations"),
            ("tbl_enforcement_history_id_seq",      "tbl_enforcement_history"),
            ("tbl_surcharge_calculations_id_seq",   "tbl_surcharge_calculations"),
        ]
        for seq, tbl in sequences:
            conn.execute(text(f"SELECT setval('{seq}', (SELECT MAX(id) FROM {tbl}))"))
        conn.commit()
        print("  sequences advanced")

    print("\nSeed complete.")
