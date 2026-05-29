"""
POST /samples/parse-coa

Accepts a COA PDF upload, parses it with lab_report_parsers, and attempts
to match each analyte to a permit limit for the company's active permit.
Returns a preview — nothing is saved until the user confirms via the normal
POST /samples endpoint.
"""

import os
import re
import tempfile
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import Parameter, Permit, PermitLimit

coa_bp = Blueprint("coa", __name__)

# ---------------------------------------------------------------------------
# Common aliases: COA analyte name fragments → parameter abbreviations
# Add more as you encounter them in real COA reports.
# ---------------------------------------------------------------------------
_ALIASES: dict[str, str] = {
    "biochemical oxygen demand":  "BOD",
    "bod":                        "BOD",
    "cbod":                       "CBOD",
    "carbonaceous":               "CBOD",
    "chemical oxygen demand":     "COD",
    "cod":                        "COD",
    "total suspended solids":     "TSS",
    "suspended solids":           "TSS",
    "tss":                        "TSS",
    "total dissolved solids":     "TDS",
    "tds":                        "TDS",
    "ammonia":                    "NH3",
    "ammonia nitrogen":           "NH3",
    "nh3":                        "NH3",
    "total kjeldahl nitrogen":    "TKN",
    "tkn":                        "TKN",
    "total phosphorus":           "TP",
    "phosphorus":                 "TP",
    "oil and grease":             "O&G",
    "oil & grease":               "O&G",
    "grease":                     "O&G",
    "o&g":                        "O&G",
    "ph":                         "pH",
    "alkalinity":                 "ALK",
    "total alkalinity":           "ALK",
    "chromium":                   "Cr",
    "copper":                     "Cu",
    "nickel":                     "Ni",
    "zinc":                       "Zn",
    "lead":                       "Pb",
    "cadmium":                    "Cd",
    "mercury":                    "Hg",
    "arsenic":                    "As",
    "silver":                     "Ag",
    "cyanide":                    "CN",
    "color":                      "Color",
    "colour":                     "Color",
    "temperature":                "Temp",
    "flow":                       "Flow",
}


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _match_analyte(analyte: str, parameters: list) -> tuple[object | None, int]:
    """Return (Parameter, score) — score 0 means no match."""
    name_lower   = analyte.strip().lower()
    name_norm    = _normalize(analyte)

    # 1. Alias lookup → abbreviation → parameter
    for alias_key, abbrev in _ALIASES.items():
        if alias_key in name_lower:
            for p in parameters:
                if _normalize(p.abbreviation) == _normalize(abbrev):
                    return p, 90

    # 2. Exact name match (case-insensitive)
    for p in parameters:
        if p.name.lower() == name_lower:
            return p, 100

    # 3. Exact abbreviation match
    for p in parameters:
        if p.abbreviation.lower() == name_lower:
            return p, 95

    # 4. Normalised substring — COA name contains parameter name
    for p in parameters:
        if _normalize(p.name) in name_norm or name_norm in _normalize(p.name):
            return p, 70

    # 5. Normalised abbreviation substring
    for p in parameters:
        if _normalize(p.abbreviation) in name_norm:
            return p, 60

    return None, 0


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@coa_bp.route("/parse-coa", methods=["POST"])
@login_required
def parse_coa():
    company_id = request.form.get("company_id", type=int)
    if not company_id:
        return jsonify({"error": "company_id required"}), 400

    # IU users can only import for their own company
    if current_user.role == "iu" and current_user.company_id != company_id:
        return jsonify({"error": "Not authorised"}), 403

    if "file" not in request.files or not request.files["file"].filename:
        return jsonify({"error": "PDF file required"}), 400

    pdf_file = request.files["file"]

    if os.path.splitext(pdf_file.filename)[1].lower() != ".pdf":
        return jsonify({"error": "Uploaded file must be a PDF"}), 400

    # Verify PDF magic bytes before writing to disk
    header = pdf_file.read(5)
    pdf_file.seek(0)
    if header != b"%PDF-":
        return jsonify({"error": "Uploaded file does not appear to be a valid PDF"}), 400

    # Write to temp file — pdfplumber needs a real path
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        pdf_file.save(tmp)
        tmp_path = tmp.name

    try:
        from lab_report_parsers import parse as parse_pdf
        parsed = parse_pdf(tmp_path)
    except Exception as exc:
        return jsonify({"error": f"Failed to parse PDF: {exc}"}), 422
    finally:
        os.unlink(tmp_path)

    if not parsed.get("samples"):
        return jsonify({"error": "No sample data found in this PDF"}), 422

    # Active permit for this company
    permit = (Permit.query
              .filter_by(company_id=company_id, is_active=True)
              .order_by(Permit.expiration_date.desc())
              .first())
    if not permit:
        return jsonify({"error": "No active permit found for this company"}), 404

    # All parameters in DB (for matching)
    all_parameters = Parameter.query.all()

    # Permit limits for this permit, keyed by parameter_id
    permit_limits   = PermitLimit.query.filter_by(permit_id=permit.id).all()
    limits_by_param = {pl.parameter_id: pl for pl in permit_limits}

    # Build preview rows for each sample group in the COA
    preview_samples = []
    for s in parsed["samples"]:
        rows = []
        for r in s["results"]:
            param, score = _match_analyte(r["analyte"], all_parameters)
            permit_limit = limits_by_param.get(param.id) if param else None

            rows.append({
                "analyte":          r["analyte"],
                "result_raw":       r["result_raw"],
                "result":           r["result"],
                "non_detect":       r["non_detect"],
                "unit":             r["unit"],
                "method":           r["method"],
                # Match info
                "parameter_id":     param.id   if param else None,
                "parameter_name":   param.name if param else None,
                "match_score":      score,
                "matched":          param is not None and score >= 60,
                # Permit limit link (None if parameter not in permit)
                "permit_limit_id":  permit_limit.id if permit_limit else None,
                "in_permit":        permit_limit is not None,
            })

        preview_samples.append({
            "client_sample_id": s["client_sample_id"],
            "lab_sample_id":    s["lab_sample_id"],
            "date_collected":   s["date_collected"],
            "matrix":           s["matrix"],
            "results":          rows,
        })

    return jsonify({
        "source_file":      parsed["source_file"],
        "client":           parsed["client"],
        "job_id":           parsed["job_id"],
        "permit_id":        permit.id,
        "permit_number":    permit.permit_number,
        "samples":          preview_samples,
        # Summary counts across all samples
        "total_analytes":   sum(len(s["results"]) for s in preview_samples),
        "matched":          sum(1 for s in preview_samples for r in s["results"] if r["matched"]),
        "in_permit":        sum(1 for s in preview_samples for r in s["results"] if r["in_permit"]),
        "unmatched":        sum(1 for s in preview_samples for r in s["results"] if not r["matched"]),
    }), 200
