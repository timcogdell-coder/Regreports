# Regreports PIMS — Pretreatment Information Management System

Flask + PostgreSQL backend · React/TypeScript frontend · DigitalOcean hosting

## Local Development

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env         # then edit DATABASE_URL and SECRET_KEY
python app.py
```

### Frontend
```bash
cd frontend
npm install
npm start
```

### Database
Create a local PostgreSQL database named `regreports_dev`.
The app will create all tables automatically on first run.

## Deployment (DigitalOcean)
1. Push to GitHub `main` branch
2. DigitalOcean auto-deploys via `.do/app.yaml`
3. Set `SECRET_KEY` and `DATABASE_URL` as secrets in DigitalOcean App Platform

## Architecture
- `backend/models.py` — PostgreSQL schema (SQLAlchemy)
- `backend/engines/compliance_engine.py` — Violation detection
- `backend/engines/erg_engine.py` — ERG enforcement decision matrix
- `backend/engines/surcharge_engine.py` — Monthly surcharge calculation
- `frontend/src/components/` — Role-based dashboards (IU, Coordinator, Admin, Finance)
