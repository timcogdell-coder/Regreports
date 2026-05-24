from lab_report_parsers import parse
r = parse("lab report.pdf")
print("Client:", r["client"])
print("Job ID:", r["job_id"])
print("Samples:", len(r["samples"]))
for s in r["samples"]:
    print(f"  Sample: {s['client_sample_id']} ({len(s['results'])} results)")
    for res in s["results"][:5]:
        nd = " [ND]" if res["non_detect"] else ""
        print(f"    {res['analyte'][:40]:40s}  {str(res['result']):8s} {res['unit']}{nd}")
    if len(s["results"]) > 5:
        print(f"    ... and {len(s['results'])-5} more")
