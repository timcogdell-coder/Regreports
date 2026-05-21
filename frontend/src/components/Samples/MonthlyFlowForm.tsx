import React, { useEffect, useState } from "react";
import { getLastEndReading, createFlowReport } from "../../api/client";

interface Props {
  companyId: number;
  onSubmitted: () => void;
}

type Method = "meter" | "time_volume" | "direct";
type DirectMode = "total" | "avg";

interface TvRow { volume_gal: string; fill_time_sec: string; }

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const daysInMonth = (m: number, y: number) => new Date(y, m, 0).getDate();

export default function MonthlyFlowForm({ companyId, onSubmitted }: Props) {
  const now = new Date();
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const defaultYear  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  // Period
  const [reportMonth, setReportMonth] = useState(defaultMonth);
  const [reportYear,  setReportYear]  = useState(defaultYear);

  // Method
  const [method, setMethod] = useState<Method>("meter");

  // Meter state
  const [beginningRead, setBeginningRead] = useState("");
  const [endRead,       setEndRead]       = useState("");
  const [pulseFactor,   setPulseFactor]   = useState<number | null>(null);
  const [meterLabel,    setMeterLabel]    = useState<string | null>(null);
  const [hasMeter,      setHasMeter]      = useState<boolean | null>(null);
  const [prefillLabel,  setPrefillLabel]  = useState<string | null>(null);

  // Time-volume state
  const [tvRows,    setTvRows]    = useState<TvRow[]>([{ volume_gal: "", fill_time_sec: "" }]);
  const [tvOpHours, setTvOpHours] = useState("24");

  // Direct entry state
  const [directMode,    setDirectMode]    = useState<DirectMode>("total");
  const [directTotal,   setDirectTotal]   = useState("");
  const [directAvg,     setDirectAvg]     = useState("");

  // Peak flow (shared)
  const [dailyMax,  setDailyMax]  = useState("");
  const [weeklyMax, setWeeklyMax] = useState("");

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [message,    setMessage]    = useState<{type:"success"|"error"; text:string} | null>(null);

  const periodDays = daysInMonth(reportMonth, reportYear);

  useEffect(() => {
    getLastEndReading(companyId).then(r => {
      const d = r.data;
      if (!d) { setHasMeter(false); return; }
      setHasMeter(d.meter_id != null);
      setMeterLabel(d.meter_label ?? null);
      setPulseFactor(d.pulse_factor ?? null);
      if (d.source === "monthly_report" && d.end_read != null) {
        setBeginningRead(String(d.end_read));
        setPrefillLabel(`Pre-filled from ${MONTHS[d.from_month - 1]} ${d.from_year} report end reading.`);
      } else if (d.source === "meter_reading" && d.end_read != null) {
        setBeginningRead(String(d.end_read));
        setPrefillLabel("Pre-filled from last meter reading end value.");
      }
    }).catch(() => setHasMeter(false));
  }, [companyId]);

  // ── Live calculations ────────────────────────────────────────────────────

  const meterCalc = (() => {
    const beg = parseFloat(beginningRead);
    const end = parseFloat(endRead);
    if (isNaN(beg) || isNaN(end) || end <= beg) return null;
    const pf = pulseFactor ?? 1.0;
    const total = ((end - beg) * pf) / 1_000_000;
    return { total, avg: total / periodDays, pulses: end - beg };
  })();

  const tvCalc = (() => {
    const opH = parseFloat(tvOpHours);
    if (isNaN(opH) || opH <= 0 || opH > 24) return null;
    const gpms: number[] = [];
    for (const row of tvRows) {
      const vol  = parseFloat(row.volume_gal);
      const secs = parseFloat(row.fill_time_sec);
      if (isNaN(vol) || isNaN(secs) || vol <= 0 || secs <= 0) return null;
      gpms.push(vol / (secs / 60));
    }
    if (gpms.length === 0) return null;
    const avgGpm = gpms.reduce((a, b) => a + b, 0) / gpms.length;
    const total  = (avgGpm * 60 * opH * periodDays) / 1_000_000;
    return { avgGpm, total, avg: total / periodDays, rowGpms: gpms };
  })();

  const directCalc = (() => {
    if (directMode === "total") {
      const t = parseFloat(directTotal);
      if (isNaN(t) || t <= 0) return null;
      return { total: t, avg: t / periodDays };
    } else {
      const a = parseFloat(directAvg);
      if (isNaN(a) || a <= 0) return null;
      return { total: a * periodDays, avg: a };
    }
  })();

  const canSubmit = method === "meter"
    ? meterCalc !== null
    : method === "time_volume"
      ? tvCalc !== null
      : directCalc !== null;

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const base = {
        company_id:         companyId,
        report_month:       reportMonth,
        report_year:        reportYear,
        period_days:        periodDays,
        measurement_method: method,
        daily_max_mgd:      dailyMax  !== "" ? parseFloat(dailyMax)  : null,
        weekly_max_mgd:     weeklyMax !== "" ? parseFloat(weeklyMax) : null,
      };

      let payload: object;
      if (method === "meter") {
        payload = { ...base, beginning_read: parseFloat(beginningRead), end_read: parseFloat(endRead) };
      } else if (method === "time_volume") {
        payload = {
          ...base,
          operating_hours_per_day: parseFloat(tvOpHours),
          measurements: tvRows.map(r => ({
            volume_gal:    parseFloat(r.volume_gal),
            fill_time_sec: parseFloat(r.fill_time_sec),
          })),
        };
      } else {
        payload = {
          ...base,
          total_flow_mg:  directMode === "total" ? parseFloat(directTotal) : null,
          monthly_avg_mgd: directMode === "avg"  ? parseFloat(directAvg)   : null,
        };
      }

      const res = await createFlowReport(payload);
      const violations: any[] = res.data.violations ?? [];
      const period = `${MONTHS[reportMonth - 1]} ${reportYear}`;

      setMessage({
        type: violations.length > 0 ? "error" : "success",
        text: violations.length > 0
          ? `${period} flow report submitted — ${violations.length} flow limit violation(s): ${violations.map((v: any) => v.parameter_name).join(", ")}.`
          : `${period} flow report submitted — no flow limit violations.`,
      });

      // Advance meter begin for next entry
      if (method === "meter") {
        setBeginningRead(endRead);
        setPrefillLabel(`Pre-filled from ${period} report end reading.`);
        setEndRead("");
      }
      setDailyMax("");
      setWeeklyMax("");
      onSubmitted();
    } catch (err: any) {
      setMessage({ type: "error", text: err.response?.data?.error ?? "Submission failed." });
    } finally {
      setSubmitting(false);
    }
  };

  const yearRange = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} style={s.form}>
      <h2 style={s.title}>Monthly Flow Report</h2>

      {/* ── Method selector ── */}
      <div style={{display:"flex", gap:0, marginBottom:20, borderRadius:8, overflow:"hidden",
                   border:"1px solid #b794f4", width:"fit-content"}}>
        {(["meter","time_volume","direct"] as Method[]).map(m => (
          <button key={m} type="button"
            onClick={() => { setMethod(m); setMessage(null); }}
            style={{padding:"8px 18px", fontSize:13, fontWeight:600, cursor:"pointer", border:"none",
                    borderRight: m !== "direct" ? "1px solid #b794f4" : "none",
                    background: method === m ? "#553c9a" : "#f7f4ff",
                    color:      method === m ? "#fff"    : "#553c9a"}}>
            {m === "meter" ? "Meter Totalizer" : m === "time_volume" ? "Time-Volume" : "Direct Entry"}
          </button>
        ))}
      </div>

      {/* ── Reporting period ── */}
      <div style={s.section}>
        <div style={s.sectionLabel}>Reporting Period</div>
        <div style={{display:"flex", gap:12}}>
          <div style={{flex:1}}>
            <label style={s.label}>Month</label>
            <select style={s.input} value={reportMonth}
              onChange={e => { setReportMonth(parseInt(e.target.value)); setMessage(null); }}>
              {MONTHS.map((mn, i) => <option key={i+1} value={i+1}>{mn}</option>)}
            </select>
          </div>
          <div style={{flex:1}}>
            <label style={s.label}>Year</label>
            <select style={s.input} value={reportYear}
              onChange={e => { setReportYear(parseInt(e.target.value)); setMessage(null); }}>
              {yearRange.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{flex:1}}>
            <label style={s.label}>Days in Period</label>
            <div style={s.computed}>{periodDays} days</div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          METER TOTALIZER
      ═══════════════════════════════════════════════════════════ */}
      {method === "meter" && (
        <div style={s.section}>
          <div style={s.sectionLabel}>Meter Totalizer Readings</div>

          {hasMeter === false && (
            <div style={s.warnBox}>
              No active flow meter configured. Contact your coordinator to set one up.
              Volume will be calculated assuming 1 gal/pulse until a meter is added.
            </div>
          )}
          {hasMeter === true && meterLabel && (
            <div style={s.meterBox}>
              <strong>Meter:</strong> {meterLabel}
              {pulseFactor != null && <>&nbsp;·&nbsp;<strong>Pulse factor:</strong> {pulseFactor.toLocaleString()} gal/pulse</>}
            </div>
          )}
          {prefillLabel && <div style={s.infoBox}>{prefillLabel}</div>}

          <div style={{display:"flex", gap:12}}>
            <div style={{flex:1}}>
              <label style={s.label}>Beginning Reading (pulses)</label>
              <input style={s.input} type="number" step="any" required
                value={beginningRead}
                onChange={e => { setBeginningRead(e.target.value); setMessage(null); }}
                placeholder="Totalizer at month start" />
            </div>
            <div style={{flex:1}}>
              <label style={s.label}>End Reading (pulses)</label>
              <input style={s.input} type="number" step="any" required
                value={endRead}
                onChange={e => { setEndRead(e.target.value); setMessage(null); }}
                placeholder="Totalizer at month end" />
            </div>
          </div>

          {(beginningRead !== "" || endRead !== "") && (
            <div style={meterCalc ? s.calcBox : s.calcBoxWarn}>
              {!meterCalc && beginningRead !== "" && endRead !== "" ? (
                <span style={{fontSize:12, color:"#c53030"}}>End reading must be greater than beginning reading.</span>
              ) : meterCalc ? (
                <>
                  <div style={s.calcRow}><span>Pulses used</span><strong>{meterCalc.pulses.toLocaleString()}</strong></div>
                  <div style={s.calcRow}>
                    <span>Total Flow</span>
                    <strong>{meterCalc.total.toFixed(4)} MG ({(meterCalc.total * 1_000_000).toLocaleString(undefined, {maximumFractionDigits:0})} gal)</strong>
                  </div>
                  <div style={s.calcRow}><span>Monthly Average</span><strong>{meterCalc.avg.toFixed(4)} MGD</strong></div>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TIME-VOLUME
      ═══════════════════════════════════════════════════════════ */}
      {method === "time_volume" && (
        <div style={s.section}>
          <div style={s.sectionLabel}>Time-Volume Measurements</div>
          <p style={{...s.hint, marginTop:0, marginBottom:12}}>
            Fill a calibrated container and record how long it takes. Take multiple readings
            and average them for better accuracy. Operating hours converts your instantaneous
            flow rate to a daily and monthly volume.
          </p>

          <div style={{marginBottom:12}}>
            <label style={s.label}>Daily Operating Hours</label>
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <input style={{...s.input, maxWidth:140, marginBottom:0}} type="number"
                step="0.5" min="0.5" max="24"
                value={tvOpHours}
                onChange={e => { setTvOpHours(e.target.value); setMessage(null); }}
                placeholder="Hours/day" />
              <span style={{fontSize:12, color:"#718096"}}>hrs/day (max 24)</span>
            </div>
          </div>

          {/* Measurement rows */}
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:"6px 10px", alignItems:"end", marginBottom:10}}>
            <span style={{...s.label, marginBottom:0}}># Container Volume (gal)</span>
            <span style={{...s.label, marginBottom:0}}>Fill Time (sec)</span>
            <span style={{...s.label, marginBottom:0}}>GPM</span>
            {tvRows.map((row, i) => {
              const vol  = parseFloat(row.volume_gal);
              const secs = parseFloat(row.fill_time_sec);
              const gpm  = (!isNaN(vol) && !isNaN(secs) && vol > 0 && secs > 0)
                ? (vol / (secs / 60)).toFixed(2) : "—";
              return (
                <React.Fragment key={i}>
                  <input style={{...s.input, marginBottom:0}} type="number" step="any" min="0"
                    placeholder={`Meas. ${i+1}`}
                    value={row.volume_gal}
                    onChange={e => setTvRows(prev => prev.map((r, j) => j === i ? {...r, volume_gal: e.target.value} : r))} />
                  <input style={{...s.input, marginBottom:0}} type="number" step="any" min="0"
                    placeholder="Seconds"
                    value={row.fill_time_sec}
                    onChange={e => setTvRows(prev => prev.map((r, j) => j === i ? {...r, fill_time_sec: e.target.value} : r))} />
                  <div style={{display:"flex", alignItems:"center", gap:6}}>
                    <span style={{fontSize:13, color:"#2b6cb0", fontWeight:600, minWidth:56}}>{gpm}</span>
                    {tvRows.length > 1 && (
                      <button type="button"
                        onClick={() => setTvRows(prev => prev.filter((_, j) => j !== i))}
                        style={{fontSize:11, color:"#c53030", background:"none", border:"none",
                                cursor:"pointer", padding:"2px 4px", lineHeight:1}}>✕</button>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          <button type="button"
            onClick={() => setTvRows(prev => [...prev, { volume_gal: "", fill_time_sec: "" }])}
            style={{fontSize:12, color:"#553c9a", background:"none", border:"1px dashed #b794f4",
                    borderRadius:5, padding:"4px 12px", cursor:"pointer", marginBottom:12}}>
            + Add measurement
          </button>

          {tvCalc && (
            <div style={s.calcBox}>
              <div style={s.calcRow}>
                <span>Avg flow rate</span>
                <strong>{tvCalc.avgGpm.toFixed(2)} GPM</strong>
              </div>
              {tvRows.length > 1 && (
                <div style={{...s.calcRow, color:"#718096", fontSize:12}}>
                  <span>Individual readings</span>
                  <span>{tvCalc.rowGpms.map(g => g.toFixed(2)).join(", ")} GPM</span>
                </div>
              )}
              <div style={s.calcRow}>
                <span>Total Flow ({periodDays} days × {tvOpHours} hrs/day)</span>
                <strong>{tvCalc.total.toFixed(4)} MG</strong>
              </div>
              <div style={s.calcRow}>
                <span>Monthly Average</span>
                <strong>{tvCalc.avg.toFixed(4)} MGD</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          DIRECT ENTRY
      ═══════════════════════════════════════════════════════════ */}
      {method === "direct" && (
        <div style={s.section}>
          <div style={s.sectionLabel}>Direct Flow Entry</div>
          <p style={{...s.hint, marginTop:0, marginBottom:12}}>
            Enter the flow value you have already calculated. The other field is computed automatically.
          </p>

          {/* Toggle: enter total MG or avg MGD */}
          <div style={{display:"flex", gap:0, marginBottom:14, borderRadius:6, overflow:"hidden",
                       border:"1px solid #cbd5e0", width:"fit-content"}}>
            {(["total","avg"] as DirectMode[]).map(dm => (
              <button key={dm} type="button"
                onClick={() => { setDirectMode(dm); setMessage(null); }}
                style={{padding:"6px 16px", fontSize:12, fontWeight:600, cursor:"pointer",
                        border:"none", borderRight: dm === "total" ? "1px solid #cbd5e0" : "none",
                        background: directMode === dm ? "#2b6cb0" : "#f7fafc",
                        color:      directMode === dm ? "#fff"    : "#4a5568"}}>
                {dm === "total" ? "Enter Total MG" : "Enter Avg MGD"}
              </button>
            ))}
          </div>

          {directMode === "total" ? (
            <div style={{display:"flex", gap:12, alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <label style={s.label}>Total Monthly Flow (MG)</label>
                <input style={s.input} type="number" step="any" min="0"
                  value={directTotal}
                  onChange={e => { setDirectTotal(e.target.value); setMessage(null); }}
                  placeholder="e.g. 1.2345" />
              </div>
              <div style={{flex:1}}>
                <label style={s.label}>Monthly Average (computed)</label>
                <div style={s.computed}>
                  {directCalc ? `${directCalc.avg.toFixed(4)} MGD` : "—"}
                </div>
              </div>
            </div>
          ) : (
            <div style={{display:"flex", gap:12, alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <label style={s.label}>Monthly Average Flow (MGD)</label>
                <input style={s.input} type="number" step="any" min="0"
                  value={directAvg}
                  onChange={e => { setDirectAvg(e.target.value); setMessage(null); }}
                  placeholder="e.g. 0.0412" />
              </div>
              <div style={{flex:1}}>
                <label style={s.label}>Total Monthly Flow (computed)</label>
                <div style={s.computed}>
                  {directCalc ? `${directCalc.total.toFixed(4)} MG` : "—"}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Peak flow (shared) ── */}
      <div style={s.section}>
        <div style={s.sectionLabel}>
          Peak Flow Values <span style={{fontWeight:400, textTransform:"none", fontSize:11}}>(optional)</span>
        </div>
        <p style={{...s.hint, marginTop:0, marginBottom:10}}>
          Highest single-day and 7-day average flows observed during the month.
        </p>
        <div style={{display:"flex", gap:12}}>
          <div style={{flex:1}}>
            <label style={s.label}>Daily Maximum (MGD)</label>
            <input style={s.input} type="number" step="any" min="0"
              value={dailyMax} onChange={e => setDailyMax(e.target.value)}
              placeholder="Peak single-day flow" />
          </div>
          <div style={{flex:1}}>
            <label style={s.label}>Weekly Maximum (MGD)</label>
            <input style={s.input} type="number" step="any" min="0"
              value={weeklyMax} onChange={e => setWeeklyMax(e.target.value)}
              placeholder="Peak 7-day average" />
          </div>
        </div>
      </div>

      {message && (
        <div style={message.type === "success" ? s.successMsg : s.errMsg}>
          {message.text}
        </div>
      )}

      <div style={{display:"flex", gap:10, flexWrap:"wrap", alignItems:"center"}}>
        <button style={s.btn} type="submit" disabled={submitting || !canSubmit}>
          {submitting ? "Submitting…" : "Submit Flow Report"}
        </button>
      </div>
    </form>
  );
}

const s: Record<string, React.CSSProperties> = {
  form:        { maxWidth:700, background:"#fff", borderRadius:10, padding:"28px 32px",
                 boxShadow:"0 2px 12px rgba(0,0,0,0.08)" },
  title:       { fontSize:20, fontWeight:700, color:"#1a365d", marginTop:0, marginBottom:14 },
  hint:        { fontSize:12, color:"#718096", marginBottom:18 },
  section:     { background:"#f7fafc", border:"1px solid #e2e8f0", borderRadius:8,
                 padding:"16px 18px", marginBottom:16 },
  sectionLabel:{ fontSize:11, fontWeight:700, textTransform:"uppercase" as const,
                 color:"#553c9a", letterSpacing:"0.06em", marginBottom:12, display:"block" as const },
  label:       { fontSize:12, fontWeight:600, color:"#2d3748", display:"block" as const, marginBottom:4 },
  input:       { width:"100%", boxSizing:"border-box" as const, padding:"8px 10px", fontSize:13,
                 border:"1px solid #cbd5e0", borderRadius:6, background:"#fff", marginBottom:12 },
  computed:    { background:"#edf2f7", border:"1px solid #e2e8f0", borderRadius:6,
                 padding:"8px 10px", fontSize:13, color:"#4a5568", marginBottom:12 },
  infoBox:     { fontSize:12, color:"#2b6cb0", background:"#ebf8ff", border:"1px solid #90cdf4",
                 borderRadius:5, padding:"7px 12px", marginBottom:12 },
  meterBox:    { fontSize:12, color:"#276749", background:"#f0fff4", border:"1px solid #9ae6b4",
                 borderRadius:5, padding:"7px 12px", marginBottom:14 },
  warnBox:     { fontSize:12, color:"#744210", background:"#fffbeb", border:"1px solid #f6e05e",
                 borderRadius:5, padding:"10px 14px", marginBottom:14 },
  calcBox:     { background:"#ebf8ff", border:"1px solid #90cdf4", borderRadius:6,
                 padding:"12px 16px", marginTop:4, marginBottom:4 },
  calcBoxWarn: { background:"#fff5f5", border:"1px solid #feb2b2", borderRadius:6,
                 padding:"10px 14px", marginTop:4, marginBottom:4 },
  calcRow:     { display:"flex" as const, justifyContent:"space-between" as const, fontSize:13, marginBottom:4 },
  btn:         { padding:"10px 24px", background:"#553c9a", color:"#fff", border:"none",
                 borderRadius:6, fontWeight:700, fontSize:14, cursor:"pointer" },
  successMsg:  { background:"#c6f6d5", color:"#276749", border:"1px solid #9ae6b4",
                 borderRadius:6, padding:"10px 14px", marginBottom:14, fontSize:13 },
  errMsg:      { background:"#fed7d7", color:"#c53030", border:"1px solid #feb2b2",
                 borderRadius:6, padding:"10px 14px", marginBottom:14, fontSize:13 },
};
