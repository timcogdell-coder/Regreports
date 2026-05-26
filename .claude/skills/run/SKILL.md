---
name: run
description: Launch and drive the Regreports PIMS app (Flask backend + React frontend) for manual or automated testing. Use when asked to run, start, test, verify, or screenshot the app.
---

# Run: Regreports PIMS

Flask/PostgreSQL backend on port 5000, React frontend on port 3000.
Playwright (installed in the backend venv) is the browser driver — `chromium-cli` is not available.

## Prerequisites

- PostgreSQL running locally with database `regreports_dev`
- `backend/.env` present (copy from `backend/.env.example` if missing)
- Backend venv created: `cd backend && python -m venv venv && pip install -r requirements.txt`
- Frontend deps installed: `cd frontend && npm install`
- Playwright + Chromium in the backend venv:
  ```bash
  source backend/venv/bin/activate
  pip install playwright
  python -m playwright install chromium
  ```

## Start

Check whether the servers are already running before launching:

```bash
# Backend (port 5000)
if ! lsof -i :5000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  cd /home/tim/Regreports/backend
  source venv/bin/activate
  python app.py &>/tmp/flask.log &
  echo "Flask PID: $!"
  until curl -sf http://localhost:5000/api/parameters >/dev/null 2>&1; do sleep 1; done
  echo "Flask ready"
else
  echo "Flask already running on :5000"
fi

# Frontend (port 3000)
if ! lsof -i :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  cd /home/tim/Regreports/frontend
  npm start &>/tmp/react.log &
  echo "React PID: $!"
  until curl -sf http://localhost:3000 >/dev/null 2>&1; do sleep 1; done
  echo "React ready"
else
  echo "React already running on :3000"
fi
```

Flask logs: `/tmp/flask.log` — React logs: `/tmp/react.log`

## Stop

```bash
pkill -f "python app.py" 2>/dev/null
pkill -f "react-scripts start" 2>/dev/null
```

## Drive with Playwright

Playwright lives in `backend/venv`. Always activate it first.

### Login helper

The login form has no `name` or `type="text"` attributes on the username input — select all inputs and index them:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    page.goto("http://localhost:3000", timeout=20000)
    page.wait_for_selector("input", timeout=15000)   # wait for React to paint

    inputs = page.query_selector_all("input")
    inputs[0].fill("Tim")          # username (adjust per DB)
    inputs[1].fill("miLo29108@")   # password
    page.click("button:has-text('Sign In')")
    page.wait_for_timeout(2000)    # wait for dashboard data to load
```

Run with:
```bash
source /home/tim/Regreports/backend/venv/bin/activate
python /path/to/your_script.py
```

### Smoke test (full login → dashboard → permits → compliance)

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # Login
    page.goto("http://localhost:3000", timeout=20000)
    page.wait_for_selector("input", timeout=15000)
    inputs = page.query_selector_all("input")
    inputs[0].fill("Tim")
    inputs[1].fill("miLo29108@")
    page.click("button:has-text('Sign In')")
    page.wait_for_timeout(2000)
    page.screenshot(path="/tmp/01_dashboard.png")
    assert "Companies" in page.inner_text("body")

    # Permits tab — exercises is_(True)/isnot(False) SQLAlchemy filters
    page.click("text=Permits")
    page.wait_for_timeout(2000)
    page.screenshot(path="/tmp/02_permits.png")
    assert "Cal-Maine" in page.inner_text("body")

    # Permit detail — exercises get_permit limits list
    page.click("text=Cal-Maine")
    page.wait_for_timeout(2000)
    page.screenshot(path="/tmp/03_permit_limits.png")
    assert "Parameters & Limits" in page.inner_text("body")

    # Compliance tab — exercises _trc_factor and SNC report
    page.click("text=Compliance")
    page.wait_for_timeout(2000)
    page.screenshot(path="/tmp/04_compliance.png")
    assert "Compliance Summary" in page.inner_text("body")

    browser.close()
    print("Smoke test passed")
```

## Admin credentials

Find existing admin users:
```bash
source /home/tim/Regreports/backend/venv/bin/activate
python -c "
from app import app
from models import User
with app.app_context():
    for u in User.query.filter_by(role='admin').all():
        print(u.username, u.email)
"
```

Create a new admin if needed:
```bash
cd /home/tim/Regreports/backend
source venv/bin/activate
python create_admin.py
```

## Gotchas

- **Port already in use**: both servers persist across sessions. Use the `lsof` check above rather than blindly launching.
- **Username input has no type/name**: use `page.query_selector_all("input")[0]` — don't use `input[type="text"]` or `input[name="username"]`, they won't match.
- **React paint delay**: call `page.wait_for_selector("input", timeout=15000)` before interacting — the page title resolves before React renders the form.
- **API is at `/api/...`**: the React dev server proxies `/api` to `localhost:5000`. Direct API smoke tests hit port 5000 directly.
- **No `/api/health` endpoint**: use `/api/parameters` (returns JSON array) to verify Flask is up.
