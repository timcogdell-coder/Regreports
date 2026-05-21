"""
Enforcement Response Guide (ERG) Engine
Applies the ERG decision matrix to auto-generate enforcement responses.

Response levels (in ascending severity):
  1. phone_call
  2. warning
  3. nov          (Notice of Violation)
  4. ao           (Administrative Order)
  5. civil
  6. criminal
  7. termination
"""
from datetime import date, timedelta
from models import db, Violation, EnforcementHistory, ERGMatrixEntry, ERGFineSchedule

# Fallback constants used only if the DB tables are empty
_FALLBACK_MATRIX = {
    ("discharge_limit", False, False): ("warning",    0),
    ("discharge_limit", True,  False): ("ao",         250),
    ("discharge_limit", False, True):  ("ao",         2000),
    ("discharge_limit", True,  True):  ("civil",      5000),
    ("reporting",       False, False): ("phone_call", 0),
    ("reporting",       True,  False): ("ao",         250),
    ("reporting",       False, True):  ("ao",         5000),
    ("reporting",       True,  True):  ("civil",      5000),
    ("monitoring",      False, False): ("warning",    0),
    ("monitoring",      True,  False): ("ao",         500),
    ("monitoring",      False, True):  ("civil",      5000),
    ("monitoring",      True,  True):  ("civil",      10000),
    ("schedule_miss",   False, False): ("warning",    0),
    ("schedule_miss",   True,  False): ("ao",         100),
    ("schedule_miss",   False, True):  ("civil",      5000),
    ("schedule_miss",   True,  True):  ("termination", 0),
}

_FALLBACK_FINE_SCHEDULE = {
    "phone_call":   (0,     0),
    "warning":      (0,     0),
    "nov":          (0,     0),
    "ao":           (250,   5000),
    "civil":        (5000,  50000),
    "criminal":     (10000, 100000),
    "termination":  (0,     0),
}


def _load_matrix() -> dict:
    """Load ERG matrix from DB; fall back to hardcoded defaults."""
    try:
        entries = ERGMatrixEntry.query.all()
        if entries:
            return {
                (e.violation_category, e.is_recurring, e.has_harm):
                (e.response_level, e.fine_amount)
                for e in entries
            }
    except Exception:
        pass
    return _FALLBACK_MATRIX


def _load_fine_schedule() -> dict:
    """Load fine schedule from DB; fall back to hardcoded defaults."""
    try:
        rows = ERGFineSchedule.query.all()
        if rows:
            return {r.response_level: (r.fine_min, r.fine_max) for r in rows}
    except Exception:
        pass
    return _FALLBACK_FINE_SCHEDULE


def generate_enforcement_response(violation: Violation) -> EnforcementHistory | None:
    """Apply ERG matrix to a violation and create a pending enforcement action."""
    is_recurring    = _is_recurring(violation)
    has_harm        = _assess_harm(violation)
    viol_category   = _categorize_violation(violation)

    matrix        = _load_matrix()
    fine_schedule = _load_fine_schedule()

    key = (viol_category, is_recurring, has_harm)
    response_level, fine_amount = matrix.get(key, ("warning", 0))

    # Escalate based on severity
    if violation.violation_severity == "major":
        response_level = _escalate(response_level)
        fine_amount = min(fine_amount * 2, fine_schedule.get(response_level, (0, 5000))[1])

    letter = _generate_letter(violation, response_level, fine_amount, is_recurring)

    action = EnforcementHistory(
        company_id              = violation.company_id,
        violation_id            = violation.id,
        response_level          = response_level,
        auto_generated_response = letter,
        fine_amount             = fine_amount,
        status                  = "pending",
    )
    db.session.add(action)
    db.session.commit()
    return action


def _is_recurring(violation: Violation) -> bool:
    """True if same company/parameter had a violation in the past 12 months."""
    cutoff = date.today() - timedelta(days=365)
    count = (Violation.query
             .filter_by(company_id=violation.company_id, parameter_id=violation.parameter_id)
             .filter(Violation.violation_date >= cutoff)
             .filter(Violation.id != violation.id)
             .count())
    return count > 0


def _assess_harm(violation: Violation) -> bool:
    """Major severity violations are considered harmful to the POTW."""
    return violation.violation_severity == "major"


def _categorize_violation(violation: Violation) -> str:
    """Map violation_type to ERG matrix category."""
    if violation.violation_type in ("max_exceeds", "avg_exceeds",
                                    "weekly_avg_exceeds", "flow_exceeds",
                                    "below_min", "above_max"):
        return "discharge_limit"
    if violation.violation_type == "missing_sample":
        return "monitoring"
    if violation.violation_type in ("late_report", "missing_report"):
        return "reporting"
    if violation.violation_type == "schedule_miss":
        return "schedule_miss"
    # Default — treat unknown types as discharge limit violations
    return "discharge_limit"


def _escalate(response_level: str) -> str:
    order = ["phone_call", "warning", "nov", "ao", "civil", "criminal", "termination"]
    idx = order.index(response_level) if response_level in order else 0
    return order[min(idx + 1, len(order) - 1)]


def _generate_letter(violation: Violation, response_level: str,
                     fine_amount: float, is_recurring: bool) -> str:
    param_name  = violation.parameter.name if violation.parameter else "Unknown Parameter"
    company     = violation.company.name if violation.company else "Unknown Company"
    level_label = response_level.replace("_", " ").upper()

    exceedance_line = (
        f"  - Exceedance: {violation.exceedance_percent:.1f}% above permitted limit"
        if violation.exceedance_percent is not None
        else "  - Exceedance: N/A"
    )

    letter = f"""ENFORCEMENT NOTICE — {level_label}

Date: {date.today().strftime('%B %d, %Y')}
To: {company}
Re: {param_name} Permit Violation — {violation.violation_date}

Dear Permit Holder,

This notice is to inform you that a review of your discharge monitoring data has identified
a violation of your permit limits for {param_name}.

Violation Details:
  - Parameter: {param_name}
  - Violation Type: {violation.violation_type.replace('_', ' ').title()}
  - Severity: {(violation.violation_severity or 'unknown').title()}
{exceedance_line}
  - {'This is a RECURRING violation.' if is_recurring else 'This is the first recorded violation for this parameter.'}

Required Response: {level_label}
{f'Fine Amount: ${fine_amount:,.2f}' if fine_amount > 0 else ''}

Please contact the Pretreatment Coordinator within 10 business days to discuss
corrective actions and a compliance schedule.

This notice was auto-generated pending Coordinator review and approval.
"""
    return letter
