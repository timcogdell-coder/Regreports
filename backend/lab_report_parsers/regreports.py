"""
Regreports PIMS lab report PDF parser.

Supports digitally-generated PDFs (pdfplumber) and scanned/image PDFs
(OCR fallback via pdf2image + pytesseract).

Usage
-----
    from lab_report_parsers import parse
    report = parse("785-7807-1.pdf")
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import Optional

try:
    import pdfplumber
except ImportError:
    raise ImportError("pdfplumber is required: pip install pdfplumber")

_TESSERACT_CMD = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
_POPPLER_PATH  = r"C:\poppler\poppler-24.08.0\Library\bin"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class AnalyteResult:
    analyte: str
    result_raw: str
    result: Optional[float]
    non_detect: bool
    qualifier: Optional[str]
    reporting_limit: Optional[float]
    unit: str
    method: str
    analyzed: Optional[str]
    dilution_factor: Optional[float]

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class SampleGroup:
    client_sample_id: str
    lab_sample_id: Optional[str]
    date_collected: Optional[str]
    date_received: Optional[str]
    matrix: Optional[str]
    results: list[AnalyteResult] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["results"] = [r.to_dict() for r in self.results]
        return d


@dataclass
class LabReport:
    source_file: str
    client: Optional[str]
    job_id: Optional[str]
    lab: str = "Regreports PIMS"
    samples: list[SampleGroup] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "source_file": self.source_file,
            "client":      self.client,
            "job_id":      self.job_id,
            "lab":         self.lab,
            "samples":     [s.to_dict() for s in self.samples],
        }


# ---------------------------------------------------------------------------
# Regex helpers
# ---------------------------------------------------------------------------

# Require colon so "Client Sample Results" header doesn't match
_RE_CLIENT        = re.compile(r"(?:Client|Company|Facility):\s*(.+?)(?=\s+(?:Job\s*(?:ID|No)|Work\s*Order)|$)", re.I | re.MULTILINE)
_RE_JOB_ID        = re.compile(r"(?:Job\s*(?:ID|No|Number|#)|Work\s*Order)[:\s#]+([A-Z0-9\-]+)", re.I)
# Stop client sample ID before "Lab Sample ID:" on the same line
_RE_CLIENT_SAMPLE = re.compile(r"(?:Client\s*Sample\s*(?:ID|No)|Sample\s*(?:ID|No|Number))[:\s]+(.+?)(?=\s+Lab\s+Sample\s+|$)", re.I)
_RE_LAB_SAMPLE    = re.compile(r"(?:Lab\s*Sample\s*(?:ID|No)|Lab\s*(?:ID|No))[:\s]+(\S+)", re.I)
_RE_DATE_COLLECTED= re.compile(r"(?:Date\s*Collected|Collection\s*Date|Sampled)[:\s]+([0-9/\-]+(?:\s+[0-9:]+)?)", re.I)
_RE_DATE_RECEIVED = re.compile(r"(?:Date\s*Received|Received)[:\s]+([0-9/\-]+(?:\s+[0-9:]+)?)", re.I)
_RE_MATRIX        = re.compile(r"Matrix[:\s]+(.+)", re.I)
_RE_METHOD_LINE   = re.compile(r"Method[:\s]+(.+)", re.I)
_RE_NON_DETECT    = re.compile(r"^<\s*(.+)")
_RE_DATE_TOKEN    = re.compile(r"^\d{1,2}/\d{1,2}/\d{2,4}$")


def _first(pattern: re.Pattern, text: str) -> Optional[str]:
    m = pattern.search(text)
    return m.group(1).strip() if m else None


def _parse_float(value: str) -> Optional[float]:
    try:
        return float(re.sub(r"[^0-9.\-]", "", value or ""))
    except (ValueError, AttributeError):
        return None


def _strip_pipes(line: str) -> str:
    """Remove OCR pipe/box-drawing/underline artifacts around table cells."""
    return re.sub(r"^[\|_\-]+\s*|\s*[\|_]+\s*$", "", line).strip()


# ---------------------------------------------------------------------------
# Structured table parsing (digital PDFs via pdfplumber)
# ---------------------------------------------------------------------------

_HEADER_MAP = {
    "analyte":   "analyte",
    "parameter": "analyte",
    "result":    "result",
    "qualifier": "qualifier",
    "rl":        "rl",
    "mdl":       "rl",
    "unit":      "unit",
    "analyzed":  "analyzed",
    "dil":       "dil_fac",
}


def _identify_columns(header_row: list[Optional[str]]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for i, cell in enumerate(header_row):
        if cell is None:
            continue
        lower = cell.strip().lower()
        for key, field_name in _HEADER_MAP.items():
            if key in lower and field_name not in mapping:
                mapping[field_name] = i
    return mapping


def _parse_table(rows: list[list[Optional[str]]], method: str) -> list[AnalyteResult]:
    if not rows:
        return []
    col_map = _identify_columns(rows[0])
    if "analyte" not in col_map or "result" not in col_map:
        return []

    results: list[AnalyteResult] = []
    for row in rows[1:]:
        if not row:
            continue

        def get(field_name: str) -> str:
            idx = col_map.get(field_name)
            if idx is None or idx >= len(row):
                return ""
            return (row[idx] or "").strip()

        analyte = get("analyte")
        if not analyte or analyte.lower() in {"analyte", "parameter", ""}:
            continue

        result_raw = get("result")
        if not result_raw:
            continue

        nd_match   = _RE_NON_DETECT.match(result_raw)
        non_detect = nd_match is not None
        numeric    = nd_match.group(1) if nd_match else result_raw

        results.append(AnalyteResult(
            analyte         = analyte,
            result_raw      = result_raw,
            result          = _parse_float(numeric),
            non_detect      = non_detect,
            qualifier       = get("qualifier") or None,
            reporting_limit = _parse_float(get("rl")),
            unit            = get("unit"),
            method          = method,
            analyzed        = get("analyzed") or None,
            dilution_factor = _parse_float(get("dil_fac")),
        ))

    return results


# ---------------------------------------------------------------------------
# OCR result-line parser (scanned PDFs)
# ---------------------------------------------------------------------------

# Units that appear as a single token
_SINGLE_WORD_UNITS = {
    "ug/l", "mg/l", "su", "s.u.", "ntu", "%", "mg/kg", "ug/kg",
    "col/100ml", "cfu/100ml", "gpd", "mgd", "ppm", "ppb",
}

_RE_IS_NUMBER = re.compile(r"^<?\s*\d[\d,]*\.?\d*$")


def _is_number(s: str) -> bool:
    return bool(_RE_IS_NUMBER.match(s))


def _find_unit_in(tokens: list[str]) -> tuple[Optional[str], Optional[int]]:
    """
    Return (unit_string, unit_start_index) or (None, None).
    unit_start_index is the index of the first unit token in tokens.
    """
    # Two-word units first ("Degrees C")
    for i in range(len(tokens) - 1):
        if tokens[i].lower() in {"degrees", "deg"} and tokens[i + 1].lower() in {"c", "f"}:
            return f"{tokens[i]} {tokens[i + 1]}", i
    # Single-word units
    for i, tok in enumerate(tokens):
        if tok.lower().rstrip(".") in _SINGLE_WORD_UNITS:
            return tok, i
    return None, None


def _parse_ocr_result_line(raw_line: str, current_method: str) -> Optional[AnalyteResult]:
    """
    Parse one OCR'd result line.  Expects format:
        Analyte Name   result  [RL]  unit  date  [time]  [dil]  [analyst]

    Uses the date column as an anchor, then reads backwards to find
    unit → RL (optional) → result → analyte name.
    """
    line = _strip_pipes(raw_line)
    if not line:
        return None

    tokens = line.split()
    if len(tokens) < 3 or not tokens[0][0].isalpha():
        return None

    # Skip header rows
    if tokens[0].lower() in {"analyte", "parameter", "compound", "test"}:
        return None

    # Find the date token that anchors the row
    date_idx = None
    for i, tok in enumerate(tokens):
        if _RE_DATE_TOKEN.match(tok):
            date_idx = i
            break

    if date_idx is None or date_idx < 3:
        return None

    pre_date = tokens[:date_idx]

    # Find unit within pre_date
    unit, unit_start = _find_unit_in(pre_date)
    if unit is None:
        return None

    # Everything before the unit
    pre_unit = pre_date[:unit_start]
    if not pre_unit:
        return None

    # Count how many trailing tokens in pre_unit are pure numbers/non-detects
    trailing = 0
    for tok in reversed(pre_unit):
        if _is_number(tok):
            trailing += 1
        else:
            break

    if trailing == 0:
        return None

    if trailing >= 2:
        # result  RL  unit
        result_raw     = pre_unit[-2]
        rl_str         = pre_unit[-1]
        analyte_tokens = pre_unit[:-2]
    else:
        # result  unit  (no RL — e.g. Temperature, pH)
        result_raw     = pre_unit[-1]
        rl_str         = None
        analyte_tokens = pre_unit[:-1]

    if not analyte_tokens:
        return None

    analyte    = " ".join(analyte_tokens).strip(".,;!|")
    nd_match   = _RE_NON_DETECT.match(result_raw)
    non_detect = nd_match is not None
    numeric    = nd_match.group(1) if nd_match else result_raw

    # Use parenthesized method code embedded in analyte name if present
    method_in_name = re.search(r"\(([^)]+)\)\s*$", analyte)
    method = method_in_name.group(1) if method_in_name else current_method

    return AnalyteResult(
        analyte         = analyte,
        result_raw      = result_raw,
        result          = _parse_float(numeric),
        non_detect      = non_detect,
        qualifier       = None,
        reporting_limit = _parse_float(rl_str) if rl_str else None,
        unit            = unit,
        method          = method,
        analyzed        = None,
        dilution_factor = None,
    )


# ---------------------------------------------------------------------------
# Full OCR text → SampleGroups
# ---------------------------------------------------------------------------

def _parse_ocr_text(all_text: str) -> list[SampleGroup]:
    samples: list[SampleGroup] = []
    current_sample: Optional[SampleGroup] = None
    current_method = "Unknown"

    for raw_line in all_text.splitlines():
        line = _strip_pipes(raw_line)
        if not line:
            continue

        # --- Sample header ---
        cs = _RE_CLIENT_SAMPLE.search(line)
        if cs:
            current_sample = SampleGroup(
                client_sample_id = cs.group(1).strip(),
                lab_sample_id    = _first(_RE_LAB_SAMPLE, line),
                date_collected   = _first(_RE_DATE_COLLECTED, all_text),
                date_received    = _first(_RE_DATE_RECEIVED, all_text),
                matrix           = _first(_RE_MATRIX, all_text),
            )
            samples.append(current_sample)
            current_method = "Unknown"
            continue

        # --- Method header ---
        mm = _RE_METHOD_LINE.search(line)
        if mm:
            current_method = _strip_pipes(mm.group(1))
            continue

        if re.match(r"^(General Chemistry|Microbiology|Metals|Radiochemistry|Inorganics|Organics)", line, re.I):
            current_method = line
            continue

        # --- Result row ---
        result = _parse_ocr_result_line(line, current_method)
        if result:
            if current_sample is None:
                current_sample = SampleGroup(
                    client_sample_id = "Sample 1",
                    lab_sample_id    = None,
                    date_collected   = _first(_RE_DATE_COLLECTED, all_text),
                    date_received    = _first(_RE_DATE_RECEIVED, all_text),
                    matrix           = _first(_RE_MATRIX, all_text),
                )
                samples.append(current_sample)
            current_sample.results.append(result)

    return samples


# ---------------------------------------------------------------------------
# OCR extraction helper
# ---------------------------------------------------------------------------

def _ocr_pdf(pdf_path: str) -> str:
    import os
    try:
        import pytesseract
        from pdf2image import convert_from_path
    except ImportError as e:
        raise ImportError(f"OCR requires pytesseract and pdf2image: {e}")

    if os.path.exists(_TESSERACT_CMD):
        pytesseract.pytesseract.tesseract_cmd = _TESSERACT_CMD

    poppler = _POPPLER_PATH if os.path.isdir(_POPPLER_PATH) else None
    images  = convert_from_path(pdf_path, dpi=300, poppler_path=poppler)

    return "\n".join(
        pytesseract.image_to_string(img, config="--psm 6")
        for img in images
    )


# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------

class RegreportsParser:
    """Parse a lab report PDF, with automatic OCR fallback for scanned files."""

    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path

    def parse(self) -> LabReport:
        import os
        report = LabReport(
            source_file = os.path.basename(self.pdf_path),
            client      = None,
            job_id      = None,
        )

        # Check for text layer
        with pdfplumber.open(self.pdf_path) as pdf:
            all_text = "\n".join(p.extract_text() or "" for p in pdf.pages)

        # ── Scanned PDF → OCR path ──────────────────────────────────────────
        if not all_text.strip():
            all_text       = _ocr_pdf(self.pdf_path)
            report.client  = _first(_RE_CLIENT, all_text)
            report.job_id  = _first(_RE_JOB_ID, all_text)
            report.samples = _parse_ocr_text(all_text)
            return report

        # ── Digital PDF → pdfplumber path ───────────────────────────────────
        report.client = _first(_RE_CLIENT, all_text)
        report.job_id = _first(_RE_JOB_ID, all_text)

        current_sample: Optional[SampleGroup] = None
        current_method = "Unknown"

        with pdfplumber.open(self.pdf_path) as pdf:
            for page in pdf.pages:
                text  = page.extract_text() or ""
                lines = text.splitlines()

                for line in lines:
                    line = line.strip()

                    cs = _RE_CLIENT_SAMPLE.search(line)
                    if cs:
                        current_sample = SampleGroup(
                            client_sample_id = cs.group(1).strip(),
                            lab_sample_id    = _first(_RE_LAB_SAMPLE, text),
                            date_collected   = _first(_RE_DATE_COLLECTED, text),
                            date_received    = _first(_RE_DATE_RECEIVED, text),
                            matrix           = _first(_RE_MATRIX, text),
                        )
                        report.samples.append(current_sample)
                        current_method = "Unknown"
                        continue

                    mm = _RE_METHOD_LINE.search(line)
                    if mm:
                        current_method = mm.group(1).strip()
                        continue

                    if re.match(r"^(General Chemistry|Microbiology|Metals|Radiochemistry)", line, re.I):
                        current_method = line

                for table in (page.extract_tables() or []):
                    parsed = _parse_table(table, current_method)
                    if parsed and current_sample is not None:
                        current_sample.results.extend(parsed)

        return report


# ---------------------------------------------------------------------------
# Module-level convenience
# ---------------------------------------------------------------------------

def parse(pdf_path: str) -> dict:
    """Parse a lab report PDF and return a JSON-serialisable dict."""
    return RegreportsParser(pdf_path).parse().to_dict()
