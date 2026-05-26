import React, { useEffect, useRef, useState } from "react";
import { getPermits, getPermit, getParameters, getSamples, submitSample, getFlowReports, getSamplingSchedule } from "../../api/client";
import { Permit, Parameter, PermitLimit } from "../../types";
import COAImport from "../COAImport";

interface Props { companyId: number; companyName: string; onSubmitted: () => void; }

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default function SampleForm({ companyId, companyName, onSubmitted }: Props) {
  const draftKey = `draft_sample_${companyId}`;

  const [showCOA, setShowCOA]               = useState(false);
  const [permits, setPermits]               = useState<Permit[]>([]);
  const [parameters, setParameters]         = useState<Parameter[]>([]);
  const [permitId, setPermitId]             = useState<number | "">("");
  const [limits, setLimits]                 = useState<PermitLimit[]>([]);
  const [sampleDate, setSampleDate]         = useState("");
  const [samplerName, setSamplerName]       = useState("");
  const [samplerSuggestions, setSamplerSuggestions] = useState<string[]>([]);
  const [samplerDropdownOpen, setSamplerDropdownOpen] = useState(false);
  const samplerComboRef = useRef<HTMLDivElement>(null);
  const [temperature, setTemperature]       = useState("");
  const [sampleFlowMgd, setSampleFlowMgd]   = useState("");
  const [results, setResults]               = useState<Record<number, string>>({});
  const [submitting, setSubmitting]         = useState(false);
  const [message, setMessage]               = useState<{type:"success"|"error", text:string} | null>(null);
  const [overdueAlerts, setOverdueAlerts]   = useState<any[]>([]);
  const [flowReports, setFlowReports]       = useState<any[]>([]);
  const [monthlyFlowReport, setMonthlyFlowReport] = useState<any | null>(null);
  const [draftSavedAt, setDraftSavedAt]     = useState<Date | null>(null);
  const [draftRestored, setDraftRestored]   = useState(false);
  const draftMounted = useRef(false);
  const resultInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    getPermits().then(r => setPermits(r.data.filter((p: Permit) => p.company_id === companyId)));
    getParameters().then(r => setParameters(r.data));
    getSamples(companyId).then(r => {
      const names: string[] = Array.from(
        new Set(r.data.map((s: any) => s.sampler_name).filter(Boolean))
      );
      setSamplerSuggestions(names);
    });
    getFlowReports(companyId).then(r => setFlowReports(r.data)).catch(() => {});

    // Restore saved draft if present
    const saved = (() => { try { return JSON.parse(localStorage.getItem(draftKey) || "null"); } catch { return null; } })();
    if (saved) {
      if (saved.permitId)    setPermitId(saved.permitId);
      if (saved.sampleDate)  setSampleDate(saved.sampleDate);
      if (saved.samplerName) setSamplerName(saved.samplerName);
      if (saved.temperature) setTemperature(saved.temperature);
      if (saved.results)     setResults(saved.results);
      setDraftRestored(true);
    }

    getSamplingSchedule(companyId).then(r => {
      setOverdueAlerts(r.data.filter((x: any) => x.status === "overdue" || x.status === "never"));
    }).catch(() => {});
  }, [companyId]);

  // Auto-save draft to localStorage whenever any field changes (skips initial mount)
  useEffect(() => {
    if (!draftMounted.current) { draftMounted.current = true; return; }
    const draft = { permitId, sampleDate, samplerName, temperature, results };
    try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch {}
    setDraftSavedAt(new Date());
  }, [permitId, sampleDate, samplerName, temperature, results]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (samplerComboRef.current && !samplerComboRef.current.contains(e.target as Node))
        setSamplerDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!permitId) return;
    getPermit(permitId as number)
      .then(r => setLimits(r.data.limits ?? []))
      .catch(() => {
        setLimits([]);
        setPermitId("");
      });
  }, [permitId]);

  // Find the monthly flow report matching the selected sample date's period
  useEffect(() => {
    if (!sampleDate) { setMonthlyFlowReport(null); return; }
    const d     = new Date(sampleDate + "T00:00:00");
    const month = d.getMonth() + 1;
    const year  = d.getFullYear();
    const found = flowReports.find(
      (r: any) => r.report_month === month && r.report_year === year
    ) ?? null;
    setMonthlyFlowReport(found);
  }, [sampleDate, flowReports]);

  const reportingPeriod = (() => {
    if (!sampleDate) return null;
    const d     = new Date(sampleDate + "T00:00:00");
    const year  = d.getFullYear();
    const month = d.getMonth();
    const days  = new Date(year, month + 1, 0).getDate();
    const start = new Date(year, month, 1).toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" });
    const end   = new Date(year, month + 1, 0).toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" });
    return { days, label: `${start} – ${end}` };
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sampleDate) {
      setMessage({ type: "error", text: "Please enter a sample date." });
      return;
    }
    setSubmitting(true); setMessage(null);
    try {
      const payload: any = {
        company_id:   companyId,
        permit_id:    permitId,
        sample_date:  sampleDate,
        sampler_name: samplerName,
        temperature:  parseFloat(temperature) || null,
        flow_mgd:     sampleFlowMgd !== "" ? parseFloat(sampleFlowMgd) : null,
        results: Object.entries(results)
          .filter(([, v]) => v !== "")
          .map(([limitId, conc]) => ({
            permit_limit_id: parseInt(limitId),
            concentration:   parseFloat(conc),
          })),
      };
      const res = await submitSample(payload);
      const { violations } = res.data;
      setMessage({
        type: violations.length > 0 ? "error" : "success",
        text: violations.length > 0
          ? `Submitted — ${violations.length} violation(s) detected. Enforcement notices generated.`
          : "Submitted — no violations detected. ✓",
      });
      try { localStorage.removeItem(draftKey); } catch {}
      setDraftSavedAt(null);
      setDraftRestored(false);
      setResults({});
      onSubmitted();
    } catch {
      setMessage({ type: "error", text: "Submission failed. Please check your entries." });
    } finally {
      setSubmitting(false);
    }
  };

  if (showCOA) {
    return (
      <div style={{...s.form, maxWidth:900}}>
        <h2 style={s.title}>Import from COA PDF</h2>
        <COAImport
          companyId={companyId}
          companyName={companyName}
          parameters={parameters}
          onCancel={() => setShowCOA(false)}
          onConfirm={payload => {
            if (payload.permit_id) setPermitId(payload.permit_id);
            if (payload.sample_date) setSampleDate(payload.sample_date);
            const prefilled: Record<number, string> = {};
            for (const r of payload.results) {
              if (r.permit_limit_id && r.concentration !== null) {
                prefilled[r.permit_limit_id] = String(r.concentration);
              }
            }
            setResults(prefilled);
            setShowCOA(false);
          }}
        />
      </div>
    );
  }

  const discardDraft = () => {
    try { localStorage.removeItem(draftKey); } catch {}
    setPermitId(""); setSampleDate(""); setSamplerName(""); setTemperature("");
    setResults({});
    setDraftSavedAt(null); setDraftRestored(false);
  };

  return (
    <form onSubmit={handleSubmit} style={s.form}>
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4}}>
        <h2 style={{...s.title, marginBottom:0}}>Submit Sample Data</h2>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          {draftSavedAt && (
            <span style={{fontSize:11, color:"#718096"}}>
              Draft saved {draftSavedAt.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}
            </span>
          )}
          <button type="button"
            style={{padding:"7px 16px", background:"#e9d8fd", color:"#553c9a",
                    border:"1px solid #b794f4", borderRadius:5, fontWeight:600,
                    cursor:"pointer", fontSize:13}}
            onClick={() => setShowCOA(true)}>
            📄 Import from COA PDF
          </button>
        </div>
      </div>

      {/* Draft restored banner */}
      {draftRestored && (
        <div style={{background:"#ebf8ff", border:"1px solid #90cdf4", borderRadius:6,
                     padding:"8px 14px", marginBottom:12, display:"flex",
                     alignItems:"center", justifyContent:"space-between"}}>
          <span style={{fontSize:12, color:"#2b6cb0"}}>
            Draft restored — your previous entries have been reloaded.
          </span>
          <button type="button" onClick={discardDraft}
            style={{fontSize:11, color:"#c53030", background:"none", border:"none",
                    cursor:"pointer", textDecoration:"underline", padding:0}}>
            Discard draft
          </button>
        </div>
      )}

      {/* Overdue sampling warning */}
      {overdueAlerts.length > 0 && (
        <div style={{background:"#fff5f5", border:"1px solid #feb2b2", borderRadius:6,
                     padding:"10px 14px", marginBottom:16}}>
          <strong style={{color:"#c53030", fontSize:13}}>
            ⚠ Overdue sampling requirements for this permit:
          </strong>
          <ul style={{margin:"6px 0 0 18px", padding:0, fontSize:12, color:"#742a2a"}}>
            {overdueAlerts.map((a: any, i: number) => (
              <li key={i}>
                <strong>{a.parameter_name}</strong>
                {a.status === "never"
                  ? " — never sampled"
                  : ` — ${a.days_overdue}d overdue (due ${a.next_due_date})`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Section 1: Permit & Period */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Permit Information</div>
        <div style={s.grid3}>
          <div style={{...s.fieldGroup, gridColumn:"1 / 2"}}>
            <label style={s.label}>Permit</label>
            <select style={s.input} value={permitId}
              onChange={e => setPermitId(parseInt(e.target.value))} required>
              <option value="">Select permit…</option>
              {permits.map(p => (
                <option key={p.id} value={p.id}>
                  {companyName || `Company #${p.company_id}`} — {p.permit_number}
                </option>
              ))}
            </select>
          </div>

          <div style={s.fieldGroup}>
            <label style={s.label}>Sample Date</label>
            <input style={s.input} type="date" value={sampleDate}
              onChange={e => setSampleDate(e.target.value)} required />
          </div>

          <div style={s.fieldGroup}>
            <label style={s.label}>Reporting Period</label>
            <div style={reportingPeriod ? s.computed : s.computedEmpty}>
              {reportingPeriod ? `${reportingPeriod.label} (${reportingPeriod.days} days)` : "Enter sample date"}
            </div>
          </div>
        </div>

        {/* Plant flow report status — informational only, separate from sample loading */}
        {sampleDate && (
          monthlyFlowReport ? (
            monthlyFlowReport.review_status === "reviewed" ? (
              <div style={s.flowReportBox}>
                <strong>Plant Flow Report — {MONTHS[monthlyFlowReport.report_month - 1]} {monthlyFlowReport.report_year}:</strong>{" "}
                Monthly Avg {monthlyFlowReport.monthly_avg_mgd?.toFixed(4)} MGD
                {monthlyFlowReport.daily_max_mgd != null && ` · Daily Max ${monthlyFlowReport.daily_max_mgd.toFixed(4)} MGD`}
                {" "}· <em>Reviewed</em> — used for plant flow permit limits &amp; surcharge.
              </div>
            ) : (
              <div style={{...s.flowReportWarn, borderColor:"#f6ad55", background:"#fffaf0", color:"#744210"}}>
                <strong>Plant Flow Report for {MONTHS[monthlyFlowReport.report_month - 1]} {monthlyFlowReport.report_year} is pending review.</strong>{" "}
                Monthly Avg: {monthlyFlowReport.monthly_avg_mgd?.toFixed(4)} MGD — used for plant flow limits &amp; surcharge (separate from sample loading).
              </div>
            )
          ) : (
            <div style={s.flowReportWarn}>
              <strong>No Plant Flow Report submitted</strong> for this period.
              Remember to submit your monthly plant flow report separately — it is used for flow permit limits and surcharge calculations.
            </div>
          )
        )}
      </div>

      {/* Section 2: Sample Collection */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Sample Collection</div>
        <div style={s.grid3}>
          <div style={s.fieldGroup}>
            <label style={s.label}>Sampler Name</label>
            <div ref={samplerComboRef} style={s.comboWrap}>
              <input style={s.input} value={samplerName}
                placeholder="Type or select…"
                onChange={e => { setSamplerName(e.target.value); setSamplerDropdownOpen(true); }}
                onFocus={() => setSamplerDropdownOpen(true)} />
              {samplerDropdownOpen && (() => {
                const filtered = samplerSuggestions.filter(n =>
                  n.toLowerCase().includes(samplerName.toLowerCase())
                );
                return filtered.length > 0 ? (
                  <div style={s.comboList}>
                    {filtered.map(name => (
                      <div key={name} style={s.comboOption}
                        onMouseDown={() => { setSamplerName(name); setSamplerDropdownOpen(false); }}>
                        {name}
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>
          </div>

          <div style={s.fieldGroup}>
            <label style={s.label}>Temperature (°C)</label>
            <input style={s.input} type="number" step="0.1" value={temperature}
              placeholder="Optional"
              onChange={e => setTemperature(e.target.value)} />
          </div>

          <div style={s.fieldGroup}>
            <label style={s.label}>
              Sample Flow (MGD)
              <span style={{fontWeight:400, color:"#718096", marginLeft:4, fontSize:11}}>
                — flow during this sampling event
              </span>
            </label>
            <input style={s.input} type="number" step="any" min="0"
              placeholder="e.g. 0.44"
              value={sampleFlowMgd}
              onChange={e => setSampleFlowMgd(e.target.value)} />
            {sampleFlowMgd !== "" && !isNaN(parseFloat(sampleFlowMgd)) && (
              <span style={{fontSize:11, color:"#718096", marginTop:3}}>
                Used to calculate pollutant loading (lbs/day)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Section 3: Lab Results — flow limits are checked via monthly flow report, not entered here */}
      {permitId !== "" && limits.filter(l => !l.is_flow_limit).length === 0 && limits.length === 0 && (
        <div style={{background:"#fffbeb", border:"1px solid #f6e05e", borderRadius:6,
                     padding:"10px 14px", marginBottom:16, fontSize:12, color:"#744210"}}>
          No parameters are configured for this permit yet. An administrator must add parameters &amp; limits before results can be entered.
        </div>
      )}
      {limits.filter(l => !l.is_flow_limit).length > 0 && (
        <div style={s.section}>
          <div style={s.sectionLabel}>Lab Results</div>
          <div style={s.grid3}>
            {limits.filter(l => !l.is_flow_limit).map((limit, i) => {
              const raw = results[limit.id] ?? "";
              const val = raw !== "" ? parseFloat(raw) : null;

              let status: "mr" | "pass" | "fail" | "range_ok" | "range_fail" | null = null;
              if (limit.is_monitor_report) {
                status = "mr";
              } else if (val !== null && !isNaN(val)) {
                if (limit.is_range_limit) {
                  const lo = limit.min_value ?? -Infinity;
                  const hi = limit.max_value ?? Infinity;
                  status = val >= lo && val <= hi ? "range_ok" : "range_fail";
                } else {
                  const maxC = limit.daily_max_concentration;
                  const minC = limit.daily_min_concentration;
                  if (maxC != null && val > maxC) status = "fail";
                  else if (minC != null && val < minC) status = "fail";
                  else status = "pass";
                }
              }

              let limitHintText: React.ReactNode = null;
              if (limit.is_monitor_report) {
                limitHintText = <span style={s.mrHint}>Monitor Report — no numeric limit</span>;
              } else if (limit.is_range_limit) {
                limitHintText = <span style={s.limitHint}>{limit.min_value}–{limit.max_value} {limit.range_unit}{limit.daily_max_loading != null ? ` / ${limit.daily_max_loading} lbs/d max` : ""}</span>;
              } else if (limit.daily_min_concentration != null || limit.daily_max_concentration != null || limit.weekly_max_concentration != null || limit.monthly_avg_concentration != null) {
                const parts: string[] = [];
                if (limit.daily_min_concentration != null) parts.push(`Min ${limit.daily_min_concentration} mg/L`);
                if (limit.daily_max_concentration != null) parts.push(`Max ${limit.daily_max_concentration} mg/L`);
                if (limit.weekly_max_concentration != null && !limit.weekly_max_concentration_is_mr) parts.push(`Wkly max ${limit.weekly_max_concentration} mg/L`);
                if (limit.monthly_avg_concentration != null && !limit.monthly_avg_concentration_is_mr) parts.push(`Mo. avg ${limit.monthly_avg_concentration} mg/L`);
                limitHintText = <span style={s.limitHint}>{parts.join(" / ")}</span>;
              } else if (limit.daily_max_loading) {
                limitHintText = <span style={s.limitHint}>Loading limit {limit.daily_max_loading} lbs/day</span>;
              }

              // Loading calculation: concentration (mg/L) × flow (MGD) × conversion factor
              const flowVal = sampleFlowMgd !== "" ? parseFloat(sampleFlowMgd) : null;
              const param   = parameters.find(p => p.id === limit.parameter_id);
              const cf      = param?.conversion_factor ?? 8.34;
              const loading = (
                val !== null && !isNaN(val) &&
                flowVal !== null && !isNaN(flowVal) && flowVal > 0 &&
                !limit.is_range_limit && !limit.is_monitor_report
              ) ? val * flowVal * cf : null;

              return (
                <div key={limit.id} style={s.paramCard}>
                  <div style={s.paramNameRow}>
                    <span style={s.paramName}>{limit.parameter_name}</span>
                    {limit.sample_type && (
                      <span style={
                        limit.sample_type === "composite" ? s.badgeComposite
                        : limit.sample_type === "grab"    ? s.badgeGrab
                        : s.badgeSampleType
                      }>
                        {limit.sample_type}
                      </span>
                    )}
                  </div>
                  {limitHintText && <div style={s.paramHint}>{limitHintText}</div>}
                  <div style={s.paramInputRow}>
                    <input
                      style={{...s.input, flex:1}}
                      type="number"
                      step="any"
                      placeholder="mg/L"
                      value={raw}
                      ref={el => { resultInputRefs.current[i] = el; }}
                      onChange={e => setResults(prev => ({...prev, [limit.id]: e.target.value}))}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const next = resultInputRefs.current[i + 1];
                          if (next) next.focus();
                        }
                      }}
                    />
                    {status === "mr"         && <span style={s.badgeMR}>MR</span>}
                    {status === "pass"        && <span style={s.badgePass}>✓ Pass</span>}
                    {status === "fail"        && <span style={s.badgeFail}>✗ Exceeds</span>}
                    {status === "range_ok"   && <span style={s.badgePass}>✓ In Range</span>}
                    {status === "range_fail" && <span style={s.badgeFail}>✗ Out of Range</span>}
                  </div>
                  {loading !== null && (
                    <div style={s.loadingRow}>
                      <span style={s.loadingLabel}>Loading:</span>
                      <span style={s.loadingValue}>{loading.toFixed(2)} lbs/day</span>
                      {limit.daily_max_loading != null && !limit.daily_max_loading_is_mr && (
                        loading <= limit.daily_max_loading
                          ? <span style={s.badgePass}>✓ Pass</span>
                          : <span style={s.badgeFail}>✗ Exceeds</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {message && (
        <div style={{...s.message,
          background: message.type === "success" ? "#c6f6d5" : "#fed7d7",
          color:      message.type === "success" ? "#276749" : "#c53030"}}>
          {message.text}
        </div>
      )}

      <div style={s.footer}>
        <button style={s.btn} type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit Sample Data"}
        </button>
        <button type="button" disabled={submitting}
          style={{padding:"10px 20px", background:"#276749", color:"#fff", border:"none",
                  borderRadius:6, fontWeight:600, fontSize:14, cursor:"pointer"}}
          onClick={() => {
            const draft = { permitId, sampleDate, samplerName, temperature, results };
            try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch {}
            setDraftSavedAt(new Date());
            setMessage({ type: "success", text: "Draft saved — you can return to finish this entry." });
          }}>
          Save Draft
        </button>
        <button type="button" disabled={submitting}
          style={{padding:"10px 20px", background:"#fff", color:"#c53030",
                  border:"1px solid #feb2b2", borderRadius:6, fontWeight:600,
                  fontSize:14, cursor:"pointer"}}
          onClick={() => {
            if (window.confirm("Discard this entry? All unsaved data will be cleared.")) {
              discardDraft();
              setMessage(null);
            }
          }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const INPUT_HEIGHT = 38;

const s: Record<string, React.CSSProperties> = {
  form:           { background:"#fff", borderRadius:10, padding:28,
                    boxShadow:"0 2px 8px rgba(0,0,0,0.10)", maxWidth:900 },
  title:          { fontSize:20, fontWeight:700, color:"#1a365d", marginBottom:24,
                    paddingBottom:12, borderBottom:"2px solid #e2e8f0" },
  section:        { marginBottom:24 },
  sectionLabel:   { fontSize:11, fontWeight:700, color:"#718096", textTransform:"uppercase" as const,
                    letterSpacing:"0.08em", marginBottom:10, paddingBottom:4,
                    borderBottom:"1px solid #edf2f7" },
  grid3:          { display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:"12px 16px" },
  paramCard:      { display:"flex", flexDirection:"column" as const, gap:4,
                    background:"#f7fafc", border:"1px solid #e2e8f0", borderRadius:8,
                    padding:"10px 12px" },
  paramName:      { fontSize:13, fontWeight:700, color:"#1a202c" },
  paramHint:      { fontSize:11, color:"#718096", marginBottom:2 },
  paramInputRow:  { display:"flex", alignItems:"center", gap:8 },
  badgePass:      { fontSize:11, fontWeight:700, color:"#276749", background:"#c6f6d5",
                    border:"1px solid #9ae6b4", borderRadius:4, padding:"2px 7px",
                    whiteSpace:"nowrap" as const },
  badgeFail:      { fontSize:11, fontWeight:700, color:"#c53030", background:"#fff5f5",
                    border:"1px solid #feb2b2", borderRadius:4, padding:"2px 7px",
                    whiteSpace:"nowrap" as const },
  badgeMR:        { fontSize:11, fontWeight:700, color:"#c05621", background:"#fffaf0",
                    border:"1px solid #f6ad55", borderRadius:4, padding:"2px 7px",
                    whiteSpace:"nowrap" as const },
  fieldGroup:     { display:"flex", flexDirection:"column" as const },
  label:          { fontSize:12, fontWeight:600, color:"#4a5568", marginBottom:5 },
  input:          { height:INPUT_HEIGHT, padding:"0 10px", border:"1px solid #cbd5e0",
                    borderRadius:6, fontSize:14, boxSizing:"border-box" as const,
                    background:"#fff", color:"#2d3748", outline:"none" },
  computed:       { height:INPUT_HEIGHT, padding:"0 10px", display:"flex", alignItems:"center",
                    background:"#ebf8ff", border:"1px solid #bee3f8",
                    borderRadius:6, fontSize:14, color:"#2b6cb0", fontWeight:600,
                    boxSizing:"border-box" as const },
  computedEmpty:  { height:INPUT_HEIGHT, padding:"0 10px", display:"flex", alignItems:"center",
                    background:"#f7fafc", border:"1px dashed #cbd5e0",
                    borderRadius:6, fontSize:13, color:"#a0aec0", fontStyle:"italic",
                    boxSizing:"border-box" as const },
  limitHint:      { fontWeight:400, color:"#a0aec0" },
  mrHint:         { fontWeight:600, fontSize:10, color:"#c05621", background:"#fffaf0",
                    border:"1px solid #f6ad55", borderRadius:4,
                    padding:"0 4px", marginLeft:4, verticalAlign:"middle" },
  mrBadge:        { height:INPUT_HEIGHT, padding:"0 10px", display:"flex", alignItems:"center",
                    background:"#fffaf0", border:"1px solid #f6ad55",
                    borderRadius:6, fontSize:13, color:"#c05621", fontWeight:600,
                    boxSizing:"border-box" as const },
  flowReportBox:  { fontSize:12, color:"#276749", background:"#f0fff4", border:"1px solid #9ae6b4",
                    borderRadius:5, padding:"7px 12px", marginTop:10 },
  flowReportWarn: { fontSize:12, color:"#744210", background:"#fffbeb", border:"1px solid #f6e05e",
                    borderRadius:5, padding:"7px 12px", marginTop:10 },
  comboWrap:      { position:"relative" as const },
  comboList:      { position:"absolute" as const, top:"100%", left:0, right:0, zIndex:100,
                    background:"#fff", border:"1px solid #cbd5e0", borderRadius:6,
                    boxShadow:"0 4px 12px rgba(0,0,0,0.12)", maxHeight:160,
                    overflowY:"auto" as const, marginTop:2 },
  comboOption:    { padding:"9px 12px", cursor:"pointer", fontSize:14,
                    borderBottom:"1px solid #edf2f7" },
  message:        { padding:"12px 16px", borderRadius:6, marginBottom:16,
                    fontSize:14, fontWeight:500 },
  footer:         { borderTop:"1px solid #edf2f7", paddingTop:16, marginTop:4,
                    display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" },
  btn:            { padding:"10px 32px", background:"#2b6cb0", color:"#fff",
                    border:"none", borderRadius:6, fontSize:15, fontWeight:600,
                    cursor:"pointer", letterSpacing:"0.02em" },
  paramNameRow:   { display:"flex", alignItems:"center", gap:6, marginBottom:2 },
  badgeComposite: { fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:4,
                    textTransform:"capitalize" as const, background:"#ebf8ff",
                    color:"#2b6cb0", border:"1px solid #90cdf4" },
  badgeGrab:      { fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:4,
                    textTransform:"capitalize" as const, background:"#f0fff4",
                    color:"#276749", border:"1px solid #9ae6b4" },
  badgeSampleType:{ fontSize:10, fontWeight:700, padding:"1px 6px", borderRadius:4,
                    textTransform:"capitalize" as const, background:"#f7fafc",
                    color:"#718096", border:"1px solid #e2e8f0" },
  loadingRow:     { display:"flex", alignItems:"center", gap:6, marginTop:2,
                    paddingTop:4, borderTop:"1px solid #edf2f7" },
  loadingLabel:   { fontSize:11, color:"#718096" },
  loadingValue:   { fontSize:11, fontWeight:700, color:"#2b6cb0" },
};
