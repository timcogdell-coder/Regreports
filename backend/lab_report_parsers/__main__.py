"""
CLI entry point:  python -m lab_report_parsers <pdf> [--format json|csv|text]
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from .regreports import RegreportsParser


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="lab-report-parse",
        description="Parse a lab report PDF into structured output.",
    )
    parser.add_argument("pdf", help="Path to the PDF file")
    parser.add_argument(
        "--format", choices=["json", "csv", "text"], default="text",
        help="Output format (default: text)"
    )
    args = parser.parse_args(argv)

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"Error: file not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    report = RegreportsParser(str(pdf_path)).parse()

    if args.format == "json":
        print(json.dumps(report.to_dict(), indent=2, default=str))

    elif args.format == "csv":
        writer = csv.writer(sys.stdout)
        writer.writerow([
            "source_file", "client", "job_id",
            "client_sample_id", "lab_sample_id",
            "date_collected", "date_received", "matrix",
            "analyte", "result_raw", "result", "non_detect",
            "qualifier", "reporting_limit", "unit", "method",
            "analyzed", "dilution_factor",
        ])
        for sample in report.samples:
            for r in sample.results:
                writer.writerow([
                    report.source_file, report.client, report.job_id,
                    sample.client_sample_id, sample.lab_sample_id,
                    sample.date_collected, sample.date_received, sample.matrix,
                    r.analyte, r.result_raw, r.result, r.non_detect,
                    r.qualifier, r.reporting_limit, r.unit, r.method,
                    r.analyzed, r.dilution_factor,
                ])

    else:  # text
        d = report.to_dict()
        print(f"Lab:    {d['lab']}")
        print(f"Client: {d['client']}")
        print(f"Job ID: {d['job_id']}")
        print(f"File:   {d['source_file']}")
        print()
        for s in d["samples"]:
            print(f"  Sample: {s['client_sample_id']}  (Lab: {s['lab_sample_id']})")
            print(f"  Collected: {s['date_collected']}  Received: {s['date_received']}  Matrix: {s['matrix']}")
            print(f"  {'Analyte':<35} {'Result':<12} {'Unit':<10} {'RL':<10} {'Method'}")
            print(f"  {'-'*35} {'-'*12} {'-'*10} {'-'*10} {'-'*20}")
            for r in s["results"]:
                print(f"  {r['analyte']:<35} {r['result_raw']:<12} {r['unit']:<10} "
                      f"{str(r['reporting_limit'] or ''):<10} {r['method']}")
            print()


if __name__ == "__main__":
    main()
