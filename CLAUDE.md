# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Regreports PIMS (Pretreatment Information Management System) — a web app for municipal wastewater utilities to manage industrial user (IU) permits, track sample results, detect permit violations, calculate surcharges, and generate enforcement responses. Flask/PostgreSQL backend, React/TypeScript frontend, deployed on DigitalOcean App Platform.

## Development Commands

### Backend
```bash
cd backend
source venv/bin/activate          # Linux/Mac
pip install -r requirements.txt
cp .env.example .env              # then edit DATABASE_URL and SECRET_KEY
python app.py                     # runs on port 5000
```

### Frontend
```bash
cd frontend
npm install
npm start                         # runs on port 3000, proxies /api to localhost:5000
npm run build
npm test
```

### Database
Create a local PostgreSQL database named `regreports_dev`. Tables are created automatically via `db.create_all()` on first run. Schema migrations are handled inline in `app._migrate_columns()` — add new `ALTER TABLE` statements there rather than using a migration framework.

### Create admin user
```bash
cd backend && python create_admin.py
```

## Architecture

### Data flow: sample submission → violation → enforcement
1. IU submits a sample via `POST /api/samples` (`blueprints/samples.py`)
2. `engines/compliance_engine.check_compliance()` compares each `SampleResult` against `PermitLimit` rows; creates `Violation` records
3. `engines/erg_engine.generate_enforcement_response()` applies the ERG decision matrix to each violation; creates a pending `EnforcementHistory` record with a draft letter
4. Coordinator reviews, edits, and approves enforcement actions

### Data flow: monthly flow → surcharge
1. IU submits a `MonthlyFlowReport` (meter totalizer, time-volume, or direct entry)
2. Coordinator reviews and marks it `review_status="reviewed"`
3. `engines/surcharge_engine.calculate_monthly_surcharge()` pulls the reviewed flow report + that month's sample concentrations to compute BOD/TSS/Color surcharges
4. `engines/compliance_engine.check_flow_compliance()` separately checks flow values against plant flow permit limits

### Roles and access
Four roles enforced via `utils/decorators.roles_required`:
- `iu` — Industrial User: submits samples and flow reports for their own company only (`current_user.company_id` is enforced server-side)
- `coordinator` — reviews samples/flow reports, manages permits, triggers compliance checks
- `admin` — full access including user management
- `finance` — read-only access to surcharge/billing data

### Key backend files
- `models.py` — all SQLAlchemy models; table names use `tbl_` prefix
- `config.py` — surcharge rates/thresholds read from env vars (`BOD_RATE`, `TSS_RATE`, etc.)
- `engines/compliance_engine.py` — violation detection for concentration, loading, weekly avg, monthly avg, flow limits, and missing samples (15-day grace period)
- `engines/erg_engine.py` — ERG decision matrix loaded from `tbl_erg_matrix` DB table; falls back to hardcoded `_FALLBACK_MATRIX` if table is empty
- `engines/surcharge_engine.py` — surcharge formula: `charge = (excess_conc × total_flow_mg × 8.34 / 1000) × rate`
- `utils/audit.py` — `audit()` helper; flushes to `tbl_audit_log` in the same transaction as the data change

### Key frontend files
- `src/App.tsx` — role-based routing; renders the appropriate dashboard for the logged-in user's role
- `src/api/client.ts` — axios instance; all API calls go here
- `src/types/` — shared TypeScript types
- `src/components/Dashboard/` — one dashboard per role (IU, Coordinator, Admin, Finance)
- `src/components/Samples/` — `SampleForm.tsx` (sample entry), `MonthlyFlowForm.tsx` (flow report entry)

### Lab report parser
`backend/lab_report_parsers/regreports.py` — parses PDF lab reports (text-based via pdfplumber, scanned via OCR fallback). Tesseract/Poppler paths are currently hardcoded to Windows paths at the top of the file.

### Compliance engine: violation types
| `violation_type` | Trigger |
|---|---|
| `max_exceeds` | Daily max concentration or loading exceeded |
| `avg_exceeds` | Monthly average concentration or loading exceeded |
| `weekly_avg_exceeds` | 7-day ISO-week average exceeded |
| `flow_exceeds` | Monthly flow report value exceeds plant flow permit limit |
| `below_min` / `above_max` | Range limit (e.g. pH) out of bounds |
| `missing_sample` | Required sampling period passed with no submission |

Monthly and weekly avg violations are auto-cleared and re-evaluated on each new sample so that a corrective sample that brings the average back into compliance removes the violation automatically.

## Deployment

Push to GitHub `main` → DigitalOcean auto-deploys via `.do/app.yaml`. Set `SECRET_KEY` and `DATABASE_URL` as secrets in DigitalOcean App Platform. Production config replaces `postgres://` with `postgresql://` for SQLAlchemy compatibility.
