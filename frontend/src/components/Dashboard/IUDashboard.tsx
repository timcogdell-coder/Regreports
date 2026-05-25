import React, { useEffect, useState } from "react";
import { User, Sample, Violation } from "../../types";
import { getSamples, getViolations, getCompanies, getPermit, getSamplingSchedule, deleteSample, deleteSampleResult, addSampleResult, logout, getMeterReadings, getFlowReports, deleteFlowReport, getSncReport } from "../../api/client";
import api from "../../api/client";
import SampleForm from "../Samples/SampleForm";
import MonthlyFlowForm from "../Samples/MonthlyFlowForm";
import NotificationBell from "../NotificationBell";

type TabName = "home"|"submit"|"samples"|"violations"|"schedule"|"flow"|"snc";
interface Props { user: User; onLogout: () => void; initialTab?: TabName; }

const VIOLATION_PLAIN: Record<string, string> = {
  max_exceeds:        "Daily maximum exceeded",
  avg_exceeds:        "Monthly average exceeded",
  weekly_avg_exceeds: "Weekly average exceeded",
  below_min:          "Below minimum limit",
  above_max:          "Above maximum limit",
  flow_exceeds:       "Flow limit exceeded",
};

export default function IUDashboard({ user, onLogout, initialTab }: Props) {
  const [tab, setTab]               = useState<TabName>(initialTab ?? "home");
  const [samples, setSamples]       = useState<Sample[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [schedule, setSchedule]     = useState<any[]>([]);
  const [meterReadings, setMeterReadings] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [activePermit, setActivePermit] = useState<any | null>(null);
  const [fetchError, setFetchError] = useState<string>("");
  const [loading, setLoading]       = useState(true);
  const [selectedSample, setSelectedSample] = useState<any | null>(null);
  const [editResults, setEditResults]       = useState<Record<number, string>>({});
  const [editingResultIdx, setEditingResultIdx] = useState<number | null>(null);
  const [saveStatus, setSaveStatus]         = useState<string>("");
  const [saving, setSaving]                 = useState(false);
  const [permitLimits, setPermitLimits]     = useState<any[]>([]);
  const [showAddResult, setShowAddResult]   = useState(false);
  const [addLimitId, setAddLimitId]         = useState<string>("");
  const [addConc, setAddConc]               = useState<string>("");
  const [addSaving, setAddSaving]           = useState(false);
  const [editingHeader, setEditingHeader]   = useState(false);
  const [headerDate, setHeaderDate]         = useState<string>("");
  const [headerSampler, setHeaderSampler]   = useState<string>("");
  const [editingAllResults, setEditingAllResults] = useState(false);
  const [allPermitLimits, setAllPermitLimits]     = useState<any[]>([]);
  const [showParameters, setShowParameters]       = useState(false);
  const [submitMode, setSubmitMode]               = useState<"sample"|"flow">("sample");
  const [flowReports, setFlowReports]             = useState<any[]>([]);
  const [sncData, setSncData]                     = useState<any | null>(null);
  const [sncLoading, setSncLoading]               = useState(false);
  const [sncYear, setSncYear]                     = useState<number>(new Date().getFullYear());
  const [sncHalf, setSncHalf]                     = useState<number>(new Date().getMonth() < 6 ? 1 : 2);

  useEffect(() => {
    setFetchError("");
    setLoading(true);
    const err = (label: string) => (e: any) =>
      setFetchError(`${label}: ${e?.response?.data?.error ?? e?.message ?? "failed"}`);

    Promise.all([
      getSamples(user.company_id ?? undefined)
        .then(r => setSamples(r.data)).catch(err("Samples")),
      getViolations(user.company_id ?? undefined)
        .then(r => setViolations(r.data)).catch(err("Violations")),
      getSamplingSchedule(user.company_id ?? undefined)
        .then(r => setSchedule(r.data)).catch(err("Schedule")),
      getMeterReadings(user.company_id ?? undefined)
        .then(r => setMeterReadings(r.data)).catch(() => {}),
      getFlowReports(user.company_id ?? undefined)
        .then(r => setFlowReports(r.data)).catch(() => {}),
      getCompanies().then(r => {
        const co = r.data.find((c: any) => c.id === user.company_id);
        if (co) setCompanyName(co.name);
      }).catch(() => {}),
      api.get("/permits").then(r => {
        const today = new Date().toISOString().split("T")[0];
        const active = r.data.find((p: any) =>
          p.company_id === user.company_id &&
          p.effective_date <= today &&
          p.expiration_date >= today
        ) ?? r.data.find((p: any) => p.company_id === user.company_id);
        if (active) {
          setActivePermit(active);
          getPermit(active.id).then(pr => setAllPermitLimits(
            [...(pr.data.limits ?? [])].sort((a: any, b: any) => a.parameter_name.localeCompare(b.parameter_name))
          )).catch(() => {});
        }
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [user.company_id]);

  const handleDeleteResult = async (resultId: number, paramName: string) => {
    if (!selectedSample) return;
    if (!window.confirm(`Delete the "${paramName}" result? Compliance will be re-evaluated.`)) return;
    setSaveStatus("");
    try {
      await deleteSampleResult(selectedSample.id, resultId);
      handleOpenSample({ id: selectedSample.id } as Sample);
      getSamples(user.company_id ?? undefined).then(d => setSamples(d.data));
      setSaveStatus("Result deleted.");
    } catch (err: any) {
      setSaveStatus(`Error: ${err.response?.data?.error ?? "Failed to delete result."}`);
    }
  };

  const handleDeleteSample = async () => {
    if (!selectedSample) return;
    if (!window.confirm(`Delete all results for ${selectedSample.sample_date}? This cannot be undone.`)) return;
    setSaveStatus("");
    try {
      await deleteSample(selectedSample.id);
      setSelectedSample(null);
      getSamples(user.company_id ?? undefined).then(d => setSamples(d.data));
    } catch (err: any) {
      setSaveStatus(`Error: ${err.response?.data?.error ?? "Failed to delete sample."}`);
    }
  };

  const handleOpenAddResult = () => {
    if (!selectedSample) return;
    getPermit(selectedSample.permit_id).then((r: any) => {
      const existingIds = new Set((selectedSample.results ?? []).map((res: any) => res.permit_limit_id));
      const missing = (r.data.limits ?? []).filter((l: any) => !existingIds.has(l.id));
      setPermitLimits(missing.sort((a: any, b: any) => a.parameter_name.localeCompare(b.parameter_name)));
      setAddLimitId(missing.length > 0 ? String(missing[0].id) : "");
      setAddConc("");
      setShowAddResult(true);
    });
  };

  const handleSubmitAddResult = async () => {
    if (!selectedSample || !addLimitId) return;
    setAddSaving(true);
    setSaveStatus("");
    try {
      await addSampleResult(selectedSample.id, {
        permit_limit_id: parseInt(addLimitId),
        concentration:   addConc !== "" ? parseFloat(addConc) : null,
      });
      setShowAddResult(false);
      setAddLimitId(""); setAddConc("");
      handleOpenSample({ id: selectedSample.id } as Sample);
      getSamples(user.company_id ?? undefined).then(d => setSamples(d.data));
      setSaveStatus("Parameter added.");
    } catch (err: any) {
      setSaveStatus(`Error: ${err.response?.data?.error ?? "Failed to add result."}`);
    } finally {
      setAddSaving(false);
    }
  };

  const handleLogout = () => { logout().finally(() => onLogout()); };

  const handleOpenSample = (sample: Sample) => {
    setSaveStatus("");
    setEditingHeader(false);
    setEditingAllResults(false);
    api.get(`/samples/${sample.id}`).then(r => {
      const detail = r.data;
      setSelectedSample(detail);
      const initial: Record<number, string> = {};
      (detail.results ?? []).forEach((res: any, i: number) => {
        initial[i] = res.concentration_result != null ? String(res.concentration_result) : "";
      });
      setEditResults(initial);
    });
  };

  const canEdit = selectedSample != null && selectedSample.review_status !== "reviewed";

  const loadSnc = (year: number, half: number) => {
    setSncLoading(true);
    getSncReport({ year, half, company_id: user.company_id ?? undefined })
      .then(r => setSncData(r.data?.[0] ?? null))
      .catch(() => setSncData(null))
      .finally(() => setSncLoading(false));
  };

  // ── Derived values for home dashboard ────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  const daysUntilExpiry = activePermit
    ? Math.ceil((new Date(activePermit.expiration_date).getTime() - Date.now()) / 86400000)
    : null;
  const permitExpired = daysUntilExpiry != null && daysUntilExpiry < 0;

  const thisYear = new Date().getFullYear();
  const violationsThisYear = violations.filter(v => v.violation_date.startsWith(String(thisYear)));
  const majorCount      = violationsThisYear.filter(v => v.violation_severity === "major").length;
  const significantCount= violationsThisYear.filter(v => v.violation_severity === "significant").length;
  const minorCount      = violationsThisYear.filter(v => v.violation_severity === "minor").length;

  const overdueItems = schedule.filter(r => r.status === "overdue");
  const dueSoonItems = schedule.filter(r => r.status === "due_soon");
  const upcomingItems = [...overdueItems, ...dueSoonItems].slice(0, 5);

  const recentSamples = [...samples].slice(0, 4);

  return (
    <div style={s.page}>
      <div style={s.stickyTop}>
        <header style={s.header}>
          <span style={s.brand}>Regreports PIMS</span>
          {companyName && <span style={s.companyBadge}>{companyName}</span>}
          <span style={s.role}>Industrial User</span>
          <NotificationBell onGoToSchedule={() => setTab("schedule")} companyId={user.company_id ?? undefined} />
          <button style={s.logoutBtn} onClick={handleLogout}>Sign Out</button>
        </header>

        <div style={s.tabs}>
          {(["home","submit","samples","violations","schedule","flow","snc"] as const).map(t => {
            const overdue  = schedule.filter(r => r.status === "overdue").length;
            const dueSoon  = schedule.filter(r => r.status === "due_soon").length;
            const openViol = violations.length;
            const label =
              t === "home"     ? "Dashboard"
            : t === "schedule" ? `Schedule${overdue > 0 ? ` (${overdue})` : dueSoon > 0 ? ` (${dueSoon})` : ""}`
            : t === "violations" ? `Violations${openViol > 0 ? ` (${openViol})` : ""}`
            : t === "flow"     ? "Flow History"
            : t === "snc"      ? "SNC Status"
            : t.charAt(0).toUpperCase() + t.slice(1);
            return (
              <button key={t} style={{...s.tab, ...(tab===t ? s.activeTab : {}),
                ...(t==="schedule" && overdue>0 ? {color:"#c53030"} : {}),
                ...(t==="violations" && majorCount>0 ? {color:"#c53030"} : {})}}
                onClick={() => {
                  setTab(t);
                  setSelectedSample(null);
                  if (t === "snc") loadSnc(sncYear, sncHalf);
                }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={s.content}>
        {loading && (
          <div style={{ textAlign:"center", padding:48, color:"#718096" }}>
            Loading…
          </div>
        )}

        {fetchError && (
          <div style={{ background:"#fff5f5", border:"1px solid #fc8181", borderRadius:6,
                         color:"#c53030", padding:"10px 14px", margin:"0 0 14px", fontSize:13 }}>
            <strong>Data load error —</strong> {fetchError}
          </div>
        )}

        {/* ── HOME DASHBOARD ─────────────────────────────────────────────── */}
        {!loading && tab === "home" && (
          <div>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20}}>
              <h2 style={{...s.sectionTitle, margin:0}}>
                {companyName ? `Welcome, ${companyName}` : "Dashboard"}
              </h2>
              <button style={s.submitBtn} onClick={() => setTab("submit")}>
                + Submit New Sample
              </button>
            </div>

            <div style={s.cardGrid}>

              {/* Permit Status */}
              <div style={{...s.dashCard, borderTop: permitExpired ? "3px solid #fc8181" : "3px solid #68d391"}}>
                <div style={s.dashCardLabel}>Current Permit</div>
                {activePermit ? (
                  <>
                    <div style={s.dashCardValue}>{activePermit.permit_number}</div>
                    <div style={s.dashCardSub}>
                      {activePermit.effective_date} → {activePermit.expiration_date}
                    </div>
                    <div style={{marginTop:8, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
                      <span style={permitExpired ? s.badgeFail : s.badgePass}>
                        {permitExpired ? "Expired" : "Active"}
                      </span>
                      {daysUntilExpiry != null && (
                        <span style={{fontSize:12, fontWeight:700,
                          color: permitExpired ? "#c53030" : daysUntilExpiry < 90 ? "#c05621" : "#718096"}}>
                          {permitExpired
                            ? `Expired ${Math.abs(daysUntilExpiry)} days ago`
                            : `${daysUntilExpiry} days until expiry`}
                        </span>
                      )}
                    </div>
                    {allPermitLimits.length > 0 && (
                      <div style={{marginTop:10}}>
                        <button style={s.linkBtn}
                          onClick={() => setShowParameters(v => !v)}>
                          {allPermitLimits.length} parameters monitored {showParameters ? "▲" : "▼"}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={s.dashCardSub}>No active permit found</div>
                )}
              </div>

              {/* Compliance Health */}
              <div style={{...s.dashCard, borderTop: violationsThisYear.length > 0 ? "3px solid #fc8181" : "3px solid #68d391"}}>
                <div style={s.dashCardLabel}>Compliance — {thisYear}</div>
                {violationsThisYear.length === 0 ? (
                  <>
                    <div style={{...s.dashCardValue, color:"#276749"}}>Clean</div>
                    <div style={s.dashCardSub}>No violations this year</div>
                  </>
                ) : (
                  <>
                    <div style={{...s.dashCardValue, color:"#c53030"}}>{violationsThisYear.length}</div>
                    <div style={{display:"flex", gap:8, marginTop:6, flexWrap:"wrap"}}>
                      {majorCount > 0       && <span style={s.chipMajor}>{majorCount} Major</span>}
                      {significantCount > 0 && <span style={s.chipSig}>{significantCount} Significant</span>}
                      {minorCount > 0       && <span style={s.chipMinor}>{minorCount} Minor</span>}
                    </div>
                    <div style={{marginTop:10}}>
                      {violations.slice(0,3).map((v, i) => (
                        <div key={v.id} style={{fontSize:12, padding:"4px 0",
                          borderBottom: i < 2 ? "1px solid #edf2f7" : "none", color:"#4a5568"}}>
                          <span style={{fontWeight:600}}>{v.violation_date}</span>
                          {" — "}{v.parameter_name}:{" "}
                          <span style={{color:"#c53030"}}>
                            {VIOLATION_PLAIN[v.violation_type] ?? v.violation_type.replace(/_/g," ")}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button style={{...s.linkBtn, marginTop:8}}
                      onClick={() => setTab("violations")}>
                      View all violations →
                    </button>
                  </>
                )}
              </div>

              {/* Upcoming Sampling */}
              <div style={{...s.dashCard, borderTop: overdueItems.length > 0 ? "3px solid #fc8181" : dueSoonItems.length > 0 ? "3px solid #f6ad55" : "3px solid #68d391"}}>
                <div style={s.dashCardLabel}>Sampling Status</div>
                {upcomingItems.length === 0 ? (
                  <>
                    <div style={{...s.dashCardValue, color:"#276749", fontSize:16}}>All current</div>
                    <div style={s.dashCardSub}>No overdue or upcoming samples</div>
                    {schedule.filter(r => r.status === "current").length > 0 && (
                      <div style={{marginTop:8, fontSize:12, color:"#718096"}}>
                        Next due: {schedule.filter(r => r.status === "current")
                          .sort((a: any, b: any) => (a.next_due_date ?? "").localeCompare(b.next_due_date ?? ""))[0]?.next_due_date ?? "—"}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {upcomingItems.map((r: any, i: number) => (
                      <div key={i} style={{display:"flex", justifyContent:"space-between",
                                           alignItems:"flex-start", padding:"5px 0",
                                           borderBottom: i < upcomingItems.length-1 ? "1px solid #edf2f7" : "none"}}>
                        <div>
                          <div style={{fontSize:13, fontWeight:600}}>{r.parameter_name}</div>
                          {r.next_due_date && (
                            <div style={{fontSize:11, color:"#718096"}}>Due {r.next_due_date}</div>
                          )}
                        </div>
                        <span style={r.status === "overdue" ? s.schedOverdue : s.schedDueSoon}>
                          {r.status === "overdue"
                            ? `${r.days_overdue}d overdue`
                            : "Due soon"}
                        </span>
                      </div>
                    ))}
                    <button style={{...s.linkBtn, marginTop:10}}
                      onClick={() => setTab("schedule")}>
                      View full schedule →
                    </button>
                  </>
                )}
              </div>

              {/* Recent Submissions */}
              <div style={s.dashCard}>
                <div style={s.dashCardLabel}>Recent Submissions</div>
                {recentSamples.length === 0 ? (
                  <>
                    <div style={s.dashCardSub}>No submissions yet</div>
                    <button style={{...s.linkBtn, marginTop:10}} onClick={() => setTab("submit")}>
                      Submit your first sample →
                    </button>
                  </>
                ) : (
                  <>
                    {recentSamples.map((row: any) => {
                      const hasViolation = (row as any).violation_count > 0;
                      const isOpen = selectedSample?.id === row.id;
                      return (
                        <div key={row.id}
                          onClick={() => { handleOpenSample(row); setTab("samples"); }}
                          style={{
                            padding:"8px 10px", borderBottom:"1px solid #edf2f7", cursor:"pointer",
                            borderRadius:6, marginBottom:2,
                            background: isOpen ? "#ebf8ff" : "transparent",
                            border: isOpen ? "1px solid #90cdf4" : "1px solid transparent",
                            transition:"background 0.15s",
                          }}>
                          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                            <span style={{fontSize:13, fontWeight:600, color: isOpen ? "#2b6cb0" : "#2d3748"}}>
                              {row.sample_date}
                            </span>
                            <span style={(row as any).review_status === "reviewed" ? s.badgeReviewed : s.badgePending}>
                              {(row as any).review_status === "reviewed" ? "Reviewed" : "Pending"}
                            </span>
                          </div>
                          {hasViolation && (
                            <div style={{fontSize:11, color:"#c53030", marginTop:2}}>
                              {(row as any).violation_count} exceedance{(row as any).violation_count !== 1 ? "s" : ""} detected
                            </div>
                          )}
                          {isOpen && (
                            <div style={{fontSize:11, color:"#2b6cb0", marginTop:3, fontStyle:"italic"}}>
                              Open in Samples tab →
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button style={{...s.linkBtn, marginTop:10}}
                      onClick={() => setTab("samples")}>
                      View all submissions →
                    </button>
                  </>
                )}
              </div>

            </div>

            {/* My Permit Parameters */}
            {showParameters && allPermitLimits.length > 0 && (
              <div style={{marginTop:20, background:"#fff", borderRadius:8,
                           boxShadow:"0 1px 4px rgba(0,0,0,0.08)", overflow:"hidden"}}>
                <div style={{padding:"12px 16px", background:"#f7fafc", borderBottom:"2px solid #e2e8f0",
                             display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                  <span style={{fontSize:13, fontWeight:700, color:"#1a365d", textTransform:"uppercase", letterSpacing:"0.05em"}}>
                    My Permit Parameters — {activePermit?.permit_number}
                  </span>
                  <button style={s.linkBtn} onClick={() => setShowParameters(false)}>Hide ▲</button>
                </div>
                <table style={{...s.table, boxShadow:"none", margin:0}}>
                  <thead><tr>
                    <th style={s.th}>Parameter</th>
                    <th style={s.th}>Sample Type</th>
                    <th style={s.th}>Daily Max</th>
                    <th style={s.th}>Monthly Avg</th>
                    <th style={s.th}>Frequency</th>
                    <th style={s.th}>Notes</th>
                  </tr></thead>
                  <tbody>{allPermitLimits.map((l: any) => (
                    <tr key={l.id}>
                      <td style={s.td}><strong>{l.parameter_name}</strong></td>
                      <td style={{...s.td, textTransform:"capitalize"}}>{l.sample_type ?? "—"}</td>
                      <td style={s.td}>
                        {l.is_monitor_report
                          ? <span style={s.mrBadge}>Monitor & Report</span>
                          : l.is_range_limit
                            ? <span style={s.rangeBadge}>{l.min_value ?? "—"}–{l.max_value ?? "—"} {l.range_unit ?? "s.u."}</span>
                            : l.daily_max_concentration != null
                              ? `${l.daily_max_concentration} mg/L`
                              : l.daily_max_loading != null
                                ? `${l.daily_max_loading} lbs/day`
                                : "—"}
                      </td>
                      <td style={s.td}>
                        {l.monthly_avg_concentration != null
                          ? `${l.monthly_avg_concentration} mg/L`
                          : l.monthly_avg_loading != null
                            ? `${l.monthly_avg_loading} lbs/day`
                            : "—"}
                      </td>
                      <td style={s.td}>{l.frequency_description ?? "—"}</td>
                      <td style={s.td}>
                        {l.is_flow_limit && <span style={{fontSize:11, color:"#2b6cb0", fontWeight:600}}>Flow limit</span>}
                        {l.is_monitor_report && <span style={{fontSize:11, color:"#ed8936", fontWeight:600}}>MR only</span>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── SUBMIT ─────────────────────────────────────────────────────── */}
        {!loading && tab === "submit" && (
          <div>
            {/* Mode toggle */}
            <div style={{display:"flex", gap:0, marginBottom:20, borderRadius:8, overflow:"hidden",
                         border:"1px solid #b794f4", width:"fit-content"}}>
              <button type="button"
                onClick={() => setSubmitMode("sample")}
                style={{padding:"9px 22px", fontSize:13, fontWeight:600, cursor:"pointer", border:"none",
                        borderRight:"1px solid #b794f4",
                        background: submitMode === "sample" ? "#553c9a" : "#f7f4ff",
                        color:      submitMode === "sample" ? "#fff"     : "#553c9a"}}>
                Sample Entry
              </button>
              <button type="button"
                onClick={() => setSubmitMode("flow")}
                style={{padding:"9px 22px", fontSize:13, fontWeight:600, cursor:"pointer", border:"none",
                        background: submitMode === "flow" ? "#553c9a" : "#f7f4ff",
                        color:      submitMode === "flow" ? "#fff"     : "#553c9a"}}>
                Monthly Flow Reading
              </button>
            </div>

            {submitMode === "sample" ? (
              <SampleForm companyId={user.company_id!} companyName={companyName}
                onSubmitted={() => {
                  setTab("samples");
                  getSamples(user.company_id ?? undefined).then(r => setSamples(r.data));
                }} />
            ) : (
              <MonthlyFlowForm companyId={user.company_id!}
                onSubmitted={() => {
                  getFlowReports(user.company_id ?? undefined).then(r => setFlowReports(r.data));
                }} />
            )}
          </div>
        )}

        {/* ── SAMPLES ────────────────────────────────────────────────────── */}
        {!loading && tab === "samples" && (
          <div style={selectedSample ? s.twoCol : undefined}>
            <section style={selectedSample ? {minWidth:320, maxWidth:420} : undefined}>
              <h2 style={s.sectionTitle}>My Submissions</h2>
              {samples.length === 0
                ? <p style={s.meta}>No submissions yet.</p>
                : <>
                    <p style={s.hint}>Double-click a row to view details</p>
                    <table style={s.table}>
                      <thead><tr>
                        <th style={s.th}>Date</th>
                        <th style={s.th}>Permit</th>
                        <th style={s.th}>Flow (MGD)</th>
                        <th style={s.th}>Sampler</th>
                        <th style={s.th}>Status</th>
                      </tr></thead>
                      <tbody>{samples.map(row => (
                        <tr key={row.id}
                          style={{
                            cursor:"pointer",
                            background: selectedSample?.id === row.id ? "#ebf8ff" : undefined,
                            outline: selectedSample?.id === row.id ? "2px solid #2b6cb0" : undefined,
                          }}
                          onDoubleClick={() => handleOpenSample(row)}>
                          <td style={s.td}>{row.sample_date}</td>
                          <td style={s.td}>{activePermit?.permit_number ?? row.permit_id}</td>
                          <td style={s.td}>{row.flow_mgd?.toFixed(4) ?? "—"}</td>
                          <td style={s.td}>{row.sampler_name ?? "—"}</td>
                          <td style={s.td}>
                            <span style={(row as any).review_status === "reviewed" ? s.badgeReviewed : s.badgePending}>
                              {(row as any).review_status === "reviewed" ? "Reviewed" : "Pending"}
                            </span>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </>
              }
            </section>

            {selectedSample && (
              <div style={{flex:1}}>
                <div style={s.detailCard}>
                  <div style={s.detailHeader}>
                    <h3 style={s.detailTitle}>
                      {selectedSample.company_name} — {selectedSample.permit_number}
                    </h3>
                    <button style={s.closeBtn} onClick={() => setSelectedSample(null)}>✕ Close</button>
                  </div>

                  {editingHeader ? (
                    <div style={{display:"flex", flexWrap:"wrap" as const, gap:12,
                                 padding:"12px 0", alignItems:"flex-end"}}>
                      <div>
                        <label style={s.metaLabel}>Sample Date</label>
                        <input type="date" value={headerDate}
                          onChange={e => setHeaderDate(e.target.value)}
                          style={{...s.editInput, width:160}} />
                      </div>
                      <div>
                        <label style={s.metaLabel}>Sampler Name</label>
                        <input type="text" value={headerSampler}
                          onChange={e => setHeaderSampler(e.target.value)}
                          placeholder="Sampler name"
                          style={{...s.editInput, width:200}} />
                      </div>
                      <div style={{display:"flex", gap:8}}>
                        <button style={s.actionSave} disabled={saving} onClick={async () => {
                          setSaving(true); setSaveStatus("");
                          try {
                            await api.put(`/samples/${selectedSample.id}`, {
                              sample_date:  headerDate,
                              sampler_name: headerSampler,
                            });
                            setEditingHeader(false);
                            handleOpenSample({ id: selectedSample.id } as Sample);
                            getSamples(user.company_id ?? undefined).then(r => setSamples(r.data));
                            setSaveStatus("Sample updated.");
                          } catch (e: any) {
                            setSaveStatus(`Error: ${e.response?.data?.error ?? "Failed to save."}`);
                          } finally { setSaving(false); }
                        }}>{saving ? "Saving…" : "Save"}</button>
                        <button style={s.actionCancel} onClick={() => setEditingHeader(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={s.detailMeta}>
                      <div style={s.metaItem}><span style={s.metaLabel}>Sample Date</span>{selectedSample.sample_date}</div>
                      <div style={s.metaItem}><span style={s.metaLabel}>Sampler</span>{selectedSample.sampler_name ?? "—"}</div>
                      <div style={s.metaItem}><span style={s.metaLabel}>Sample Flow</span>{selectedSample.flow_mgd != null ? `${selectedSample.flow_mgd.toFixed(4)} MGD` : "—"}</div>
                      <div style={s.metaItem}><span style={s.metaLabel}>Period</span>{selectedSample.sampling_days} days</div>
                      {canEdit && (
                        <button style={{...s.actionEdit, alignSelf:"center"}} onClick={() => {
                          setHeaderDate(selectedSample.sample_date ?? "");
                          setHeaderSampler(selectedSample.sampler_name ?? "");
                          setEditingHeader(true);
                        }}>Edit Header</button>
                      )}
                    </div>
                  )}

                  {selectedSample.results?.length > 0 && (
                    <>
                      <div style={{...s.sectionDivider, display:"flex", alignItems:"center",
                                   justifyContent:"space-between"}}>
                        <span>Lab Results</span>
                        {canEdit && !editingAllResults && (
                          <button style={s.actionEdit} onClick={() => {
                            const init: Record<number, string> = {};
                            selectedSample.results.forEach((r: any, i: number) => {
                              init[i] = r.concentration_result != null ? String(r.concentration_result) : "";
                            });
                            setEditResults(init);
                            setEditingAllResults(true);
                            setSaveStatus("");
                          }}>Edit Results</button>
                        )}
                        {canEdit && editingAllResults && (
                          <div style={{display:"flex", gap:8}}>
                            <button style={s.actionSave} disabled={saving} onClick={async () => {
                              setSaving(true); setSaveStatus("");
                              try {
                                const payload = selectedSample.results.map((r: any, i: number) => ({
                                  permit_limit_id: r.permit_limit_id,
                                  concentration:   editResults[i] !== "" ? parseFloat(editResults[i]) : null,
                                }));
                                await api.put(`/samples/${selectedSample.id}`, { results: payload });
                                setEditingAllResults(false);
                                handleOpenSample({ id: selectedSample.id } as Sample);
                                getSamples(user.company_id ?? undefined).then(r => setSamples(r.data));
                                setSaveStatus("Results saved.");
                              } catch (e: any) {
                                setSaveStatus(`Error: ${e.response?.data?.error ?? "Failed to save."}`);
                              } finally { setSaving(false); }
                            }}>{saving ? "Saving…" : "Save All"}</button>
                            <button style={s.actionCancel}
                              onClick={() => { setEditingAllResults(false); setSaveStatus(""); }}>
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                      <table style={{...s.table, marginBottom:8}}>
                        <thead><tr>
                          <th style={s.th}>Parameter</th>
                          <th style={s.th}>Result</th>
                          <th style={s.th}>Loading (lbs/day)</th>
                          <th style={s.th}>Permit Limit</th>
                          <th style={s.th}>Status</th>
                          {canEdit && !editingAllResults && <th style={s.th}>Delete</th>}
                        </tr></thead>
                        <tbody>{selectedSample.results.map((r: any, i: number) => {
                          const isPlantFlow = r.is_flow_limit;
                          const val        = editingAllResults ? (editResults[i] ?? "") : "";
                          const dispConc   = editingAllResults ? parseFloat(val) : r.concentration_result;
                          const hasConc    = dispConc != null && !isNaN(dispConc);
                          const conc       = hasConc ? dispConc : 0;
                          const calcLoading = (hasConc && selectedSample.flow_mgd && !isPlantFlow)
                            ? conc * selectedSample.flow_mgd * 8.34 : null;
                          const loadingOnly  = !r.daily_max_concentration && !r.is_range_limit && !!r.daily_max_loading;
                          const outOfRange   = r.is_range_limit && hasConc && (
                                               (r.min_value != null && conc < r.min_value) ||
                                               (r.max_value != null && conc > r.max_value));
                          const exceedsConc  = !r.is_range_limit && r.daily_max_concentration && hasConc && conc > r.daily_max_concentration;
                          const exceedsMonthlyAvg = !r.is_range_limit && !r.daily_max_concentration && !r.daily_max_loading &&
                                                     r.monthly_avg_concentration != null && hasConc && conc > r.monthly_avg_concentration;
                          const exceedsLoad  = (loadingOnly || r.is_range_limit) && r.daily_max_loading && calcLoading !== null && calcLoading > r.daily_max_loading;
                          const unit = isPlantFlow ? "MGD" : r.is_range_limit ? (r.range_unit ?? "s.u.") : "mg/L";

                          return (
                            <tr key={i} style={editingAllResults && (exceedsConc || exceedsLoad || outOfRange)
                              ? {background:"#fff5f5"} : undefined}>
                              <td style={s.td}>
                                <strong>{r.parameter_name}</strong>
                                {isPlantFlow && <span style={{fontSize:11, color:"#2b6cb0", marginLeft:4}}>(MGD)</span>}
                              </td>
                              <td style={{...s.td, padding:"4px 8px"}}>
                                {editingAllResults ? (
                                  <input style={s.editInput} type="number" step="any"
                                    value={val}
                                    onChange={e => setEditResults(prev => ({...prev, [i]: e.target.value}))} />
                                ) : (
                                  <>
                                    {r.concentration_result ?? "—"}
                                    {r.concentration_result != null && <span style={{fontSize:11, color:"#718096", marginLeft:4}}>{unit}</span>}
                                  </>
                                )}
                              </td>
                              <td style={s.td}>
                                {r.is_monitor_report || isPlantFlow ? "—"
                                  : editingAllResults
                                    ? (calcLoading !== null ? calcLoading.toFixed(4) : "—")
                                    : r.loading_result != null ? r.loading_result.toFixed(4) : "—"}
                              </td>
                              <td style={s.td}>
                                {r.is_monitor_report
                                  ? <span style={s.mrBadge}>MR</span>
                                  : isPlantFlow
                                    ? <span>
                                        {r.daily_max_concentration != null && <strong>{r.daily_max_concentration} MGD max</strong>}
                                        {r.monthly_avg_concentration != null && <span style={{marginLeft:6,fontSize:12,color:"#4a5568"}}>/ {r.monthly_avg_concentration} MGD avg</span>}
                                        {r.daily_max_concentration == null && r.monthly_avg_concentration == null && "—"}
                                      </span>
                                  : r.is_range_limit
                                    ? <><span style={s.rangeBadge}>{r.min_value ?? "—"}—{r.max_value ?? "—"} {r.range_unit ?? "s.u."}</span>
                                        {r.daily_max_loading != null && <span style={{marginLeft:6,fontSize:12,color:"#2d3748"}}>/ {r.daily_max_loading} lbs/d max</span>}</>
                                    : loadingOnly
                                      ? <strong>{r.daily_max_loading} lbs/day</strong>
                                      : r.daily_max_concentration
                                        ? <strong>{r.daily_max_concentration} mg/L</strong>
                                        : r.monthly_avg_concentration != null
                                          ? <span><strong>{r.monthly_avg_concentration} mg/L</strong> <span style={{fontSize:10,color:"#718096"}}>(mo. avg)</span></span>
                                          : "—"}
                              </td>
                              <td style={s.td}>
                                {r.is_monitor_report
                                  ? <span style={s.statusNA}>N/A</span>
                                  : r.is_range_limit
                                    ? (!hasConc
                                        ? <span style={s.statusNA}>—</span>
                                        : outOfRange || exceedsLoad
                                          ? <span style={s.statusFail}>{outOfRange ? "Out of Range" : "Load Exceeded"}</span>
                                          : <span style={s.statusPass}>In Range</span>)
                                    : !hasConc
                                      ? <span style={s.statusNA}>—</span>
                                      : (exceedsConc || exceedsLoad || exceedsMonthlyAvg)
                                        ? <span style={s.statusFail}>Exceedance</span>
                                        : <span style={s.statusPass}>Pass</span>}
                              </td>
                              {canEdit && !editingAllResults && (
                                <td style={{...s.td, whiteSpace:"nowrap"}}>
                                  <button style={s.actionDel}
                                    onClick={() => handleDeleteResult(r.id, r.parameter_name)}>
                                    Delete
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}</tbody>
                      </table>
                    </>
                  )}

                  {canEdit && (
                    <>
                      {saveStatus && (
                        <div style={{...s.saveMsg,
                          background: saveStatus.startsWith("Error") ? "#fff5f5" : "#f0fff4",
                          color:      saveStatus.startsWith("Error") ? "#c53030" : "#276749"}}>
                          {saveStatus}
                        </div>
                      )}
                      {showAddResult ? (
                        <div style={s.addResultCard}>
                          <div style={s.addResultTitle}>Add Missing Parameter</div>
                          {permitLimits.length === 0 ? (
                            <p style={{fontSize:13, color:"#718096", margin:0}}>All permit parameters already have results.</p>
                          ) : (
                            <div style={{display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap" as const}}>
                              <div style={{flex:"1 1 180px"}}>
                                <label style={s.addResultLabel}>Parameter</label>
                                <select style={s.addResultInput} value={addLimitId}
                                  onChange={e => setAddLimitId(e.target.value)}>
                                  {permitLimits.map((l: any) => (
                                    <option key={l.id} value={l.id}>{l.parameter_name}</option>
                                  ))}
                                </select>
                              </div>
                              <div style={{flex:"0 0 140px"}}>
                                <label style={s.addResultLabel}>
                                  {permitLimits.find((l: any) => String(l.id) === addLimitId)?.is_monitor_report
                                    ? "Value (MR)" : "Concentration (mg/L)"}
                                </label>
                                <input style={s.addResultInput} type="number" step="any"
                                  value={addConc} placeholder="Enter value"
                                  onChange={e => setAddConc(e.target.value)} />
                              </div>
                              <button style={s.actionSave} disabled={addSaving} onClick={handleSubmitAddResult}>
                                {addSaving ? "Saving…" : "Save"}
                              </button>
                              <button style={s.actionCancel}
                                onClick={() => { setShowAddResult(false); setAddConc(""); }}>
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <button style={s.addResultBtn} onClick={handleOpenAddResult}>
                          + Add Parameter
                        </button>
                      )}
                      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
                        <button style={s.cancelBtn}
                          onClick={() => { setEditingResultIdx(null); handleOpenSample({id: selectedSample.id} as Sample); }}>
                          Reset
                        </button>
                        <button style={s.deleteSampleBtn} onClick={handleDeleteSample}>
                          Delete Sample
                        </button>
                      </div>
                    </>
                  )}

                  {selectedSample.violations?.length > 0 && (
                    <>
                      <div style={s.sectionDivider}>Violations</div>
                      <div style={s.violationBox}>
                        {selectedSample.violations.map((v: any, i: number) => (
                          <div key={i} style={s.violationRow}>
                            <strong>{v.parameter_name}</strong>: {VIOLATION_PLAIN[v.violation_type] ?? v.violation_type.replace(/_/g," ")} —{" "}
                            {v.exceedance_percent?.toFixed(1)}% above limit
                            <span style={{...s.badgePending, marginLeft:8, textTransform:"capitalize" as const}}>
                              {v.violation_severity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {selectedSample.review_status === "reviewed" && selectedSample.review_comment && (
                    <>
                      <div style={s.sectionDivider}>POTW Review</div>
                      <div style={s.reviewBox}>
                        <div style={s.reviewedBadge}>Reviewed {selectedSample.reviewed_at?.slice(0,10)}</div>
                        <p style={s.reviewText}>{selectedSample.review_comment}</p>
                      </div>
                    </>
                  )}
                  {selectedSample.review_status !== "reviewed" && (
                    <div style={s.pendingBox}>Review pending by POTW coordinator.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VIOLATIONS ─────────────────────────────────────────────────── */}
        {!loading && tab === "violations" && (
          <section>
            <h2 style={s.sectionTitle}>Compliance Status</h2>
            {violations.length === 0 ? (
              <div style={{background:"#f0fff4", border:"1px solid #68d391", borderRadius:8,
                           padding:"20px 24px", color:"#276749", fontWeight:600, fontSize:15}}>
                ✓ No violations on record — your permit is in full compliance.
              </div>
            ) : (
              <>
                <div style={{display:"flex", gap:10, marginBottom:16, flexWrap:"wrap"}}>
                  {majorCount > 0       && <span style={s.chipMajor}>{majorCount} Major this year</span>}
                  {significantCount > 0 && <span style={s.chipSig}>{significantCount} Significant this year</span>}
                  {minorCount > 0       && <span style={s.chipMinor}>{minorCount} Minor this year</span>}
                </div>
                <table style={s.table}>
                  <thead><tr>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Parameter</th>
                    <th style={s.th}>What happened</th>
                    <th style={s.th}>Severity</th>
                    <th style={s.th}>% Above Limit</th>
                  </tr></thead>
                  <tbody>{violations.map(v => (
                    <tr key={v.id} style={{
                      background: v.violation_severity === "major"       ? "#fff5f5"
                                : v.violation_severity === "significant" ? "#fffff0"
                                : undefined
                    }}>
                      <td style={s.td}>{v.violation_date}</td>
                      <td style={s.td}><strong>{v.parameter_name}</strong></td>
                      <td style={s.td}>{VIOLATION_PLAIN[v.violation_type] ?? v.violation_type.replace(/_/g," ")}</td>
                      <td style={s.td}>
                        <span style={
                          v.violation_severity === "major"       ? s.chipMajor
                        : v.violation_severity === "significant" ? s.chipSig
                        : s.chipMinor}>
                          {v.violation_severity.charAt(0).toUpperCase() + v.violation_severity.slice(1)}
                        </span>
                      </td>
                      <td style={s.td}>{v.exceedance_percent?.toFixed(1)}%</td>
                    </tr>
                  ))}</tbody>
                </table>
              </>
            )}
          </section>
        )}

        {/* ── SCHEDULE ───────────────────────────────────────────────────── */}
        {!loading && tab === "schedule" && (
          <section>
            <h2 style={s.sectionTitle}>Sampling Schedule</h2>
            {schedule.length === 0 ? (
              <p style={s.meta}>No frequency requirements on record.</p>
            ) : (() => {
              const overdue  = schedule.filter(r => r.status === "overdue");
              const dueSoon  = schedule.filter(r => r.status === "due_soon");
              const never    = schedule.filter(r => r.status === "never");
              const current  = schedule.filter(r => r.status === "current");
              return (
                <>
                  <div style={s.schedSummary}>
                    {overdue.length  > 0 && <span style={s.chipOverdue}>{overdue.length} Overdue</span>}
                    {dueSoon.length  > 0 && <span style={s.chipDueSoon}>{dueSoon.length} Due Soon</span>}
                    {never.length    > 0 && <span style={s.chipNever}>{never.length} Never Sampled</span>}
                    {current.length  > 0 && <span style={s.chipCurrent}>{current.length} Current</span>}
                  </div>
                  <table style={s.table}>
                    <thead><tr>
                      <th style={s.th}>Parameter</th>
                      <th style={s.th}>Frequency</th>
                      <th style={s.th}>Sample Type</th>
                      <th style={s.th}>Last Sampled</th>
                      <th style={s.th}>Next Due</th>
                      <th style={s.th}>Status</th>
                    </tr></thead>
                    <tbody>{schedule.map((r: any, i: number) => (
                      <tr key={i} style={{
                        background: r.status === "overdue"  ? "#fff5f5"
                                  : r.status === "due_soon" ? "#fffff0"
                                  : undefined
                      }}>
                        <td style={s.td}><strong>{r.parameter_name}</strong></td>
                        <td style={s.td}>{r.frequency_description}</td>
                        <td style={{...s.td, textTransform:"capitalize"}}>{r.sample_type ?? "—"}</td>
                        <td style={s.td}>{r.last_sample_date ?? <em style={{color:"#a0aec0"}}>Never</em>}</td>
                        <td style={s.td}>{r.next_due_date ?? "—"}</td>
                        <td style={s.td}>
                          {r.status === "overdue"  && <span style={s.schedOverdue}>Overdue {r.days_overdue === 1 ? "1 day" : `${r.days_overdue} days`}</span>}
                          {r.status === "due_soon" && <span style={s.schedDueSoon}>Due Soon</span>}
                          {r.status === "never"    && <span style={s.schedNever}>Never Sampled</span>}
                          {r.status === "current"  && <span style={s.schedCurrent}>Current</span>}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </>
              );
            })()}
          </section>
        )}

        {/* ── FLOW HISTORY ───────────────────────────────────────────────── */}
        {!loading && tab === "flow" && (
          <section>
            {/* Monthly flow reports */}
            <h2 style={s.sectionTitle}>Monthly Flow Reports</h2>
            {flowReports.length === 0 ? (
              <p style={s.meta}>No monthly flow reports yet. Use the Submit tab → Monthly Flow Reading to add one.</p>
            ) : (
              <div style={{overflowX:"auto", marginBottom:32}}>
                <table style={s.table}>
                  <thead><tr>
                    <th style={s.th}>Period</th>
                    <th style={s.th}>Method</th>
                    <th style={{...s.th, textAlign:"right" as const}}>Total Flow (MG)</th>
                    <th style={{...s.th, textAlign:"right" as const}}>Monthly Avg (MGD)</th>
                    <th style={{...s.th, textAlign:"right" as const}}>Daily Max (MGD)</th>
                    <th style={{...s.th, textAlign:"right" as const}}>Weekly Max (MGD)</th>
                    <th style={s.th}>Status</th>
                  </tr></thead>
                  <tbody>{flowReports.map((r: any) => {
                    const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                    const status   = r.review_status ?? "pending";
                    const rejected = status === "rejected";
                    const reviewed = status === "reviewed";
                    const rowBg    = rejected ? "#fff5f5" : !reviewed ? "#fffff0" : undefined;
                    return (
                      <tr key={r.id} style={rowBg ? {background: rowBg} : undefined}>
                        <td style={{...s.td, fontWeight:600}}>{MONTHS_SHORT[r.report_month - 1]} {r.report_year}</td>
                        <td style={s.td}>
                          <span style={{fontSize:11, padding:"2px 7px", borderRadius:10, fontWeight:600,
                            background: r.measurement_method === "meter" ? "#ebf8ff"
                              : r.measurement_method === "time_volume" ? "#f0fff4" : "#faf5ff",
                            color: r.measurement_method === "meter" ? "#2b6cb0"
                              : r.measurement_method === "time_volume" ? "#276749" : "#553c9a"}}>
                            {r.measurement_method === "meter" ? "Meter"
                              : r.measurement_method === "time_volume" ? "Time-Volume" : "Direct"}
                          </span>
                        </td>
                        <td style={{...s.td, textAlign:"right" as const, fontWeight:600, color:"#2b6cb0"}}>
                          {r.total_flow_mg != null ? Number(r.total_flow_mg).toFixed(4) : "—"}
                        </td>
                        <td style={{...s.td, textAlign:"right" as const}}>
                          {r.monthly_avg_mgd != null ? Number(r.monthly_avg_mgd).toFixed(4) : "—"}
                        </td>
                        <td style={{...s.td, textAlign:"right" as const}}>
                          {r.daily_max_mgd != null ? Number(r.daily_max_mgd).toFixed(4) : "—"}
                        </td>
                        <td style={{...s.td, textAlign:"right" as const}}>
                          {r.weekly_max_mgd != null ? Number(r.weekly_max_mgd).toFixed(4) : "—"}
                        </td>
                        <td style={s.td}>
                          {rejected ? (
                            <>
                              <span style={{fontSize:11, padding:"2px 7px", borderRadius:10, fontWeight:700,
                                            background:"#fff5f5", color:"#c53030", border:"1px solid #fc8181"}}>
                                Rejected
                              </span>
                              {r.review_comment && (
                                <div style={{fontSize:11, color:"#c53030", marginTop:3, fontStyle:"italic"}}>
                                  {r.review_comment}
                                </div>
                              )}
                              <button
                                style={{marginTop:5, fontSize:11, padding:"3px 10px", borderRadius:5,
                                        border:"1px solid #fc8181", background:"#fff5f5", color:"#c53030",
                                        cursor:"pointer", fontWeight:600}}
                                onClick={() => {
                                  if (!window.confirm("Delete this rejected report so you can submit a corrected one?")) return;
                                  deleteFlowReport(r.id).then(() =>
                                    getFlowReports(user.company_id ?? undefined).then(res => setFlowReports(res.data))
                                  );
                                }}>
                                Delete &amp; Resubmit
                              </button>
                            </>
                          ) : (
                            <>
                              <span style={reviewed ? s.badgeReviewed : s.badgePending}>
                                {reviewed ? "Approved" : "Pending Review"}
                              </span>
                              {reviewed && r.review_comment && (
                                <div style={{fontSize:11, color:"#276749", marginTop:2}}>{r.review_comment}</div>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
                {flowReports.some((r: any) => r.review_status === "rejected") && (
                  <div style={{fontSize:12, color:"#c53030", background:"#fff5f5", border:"1px solid #fc8181",
                               borderRadius:5, padding:"7px 12px", marginTop:8}}>
                    One or more flow reports were rejected. Review the reason above, delete the rejected report, and resubmit with corrected values.
                  </div>
                )}
                {flowReports.some((r: any) => r.review_status === "pending") && (
                  <div style={{fontSize:12, color:"#744210", background:"#fffbeb", border:"1px solid #f6e05e",
                               borderRadius:5, padding:"7px 12px", marginTop:8}}>
                    Reports pending review are not used in surcharge calculations until approved by your coordinator.
                  </div>
                )}
              </div>
            )}

            {/* ── SAMPLE-EVENT meter readings ─────────────────────────── */}
            <h2 style={s.sectionTitle}>Sample Event Meter Readings</h2>
            {meterReadings.filter((r: any) => r.reading_purpose === "sample_event").length === 0 ? (
              <p style={s.meta}>No sample event readings yet. These are recorded automatically when you submit a sample.</p>
            ) : (
              <table style={s.table}>
                <thead><tr>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Meter</th>
                  <th style={{...s.th, textAlign:"right" as const}}>Start</th>
                  <th style={{...s.th, textAlign:"right" as const}}>End</th>
                  <th style={{...s.th, textAlign:"right" as const}}>Volume (MG)</th>
                </tr></thead>
                <tbody>{meterReadings
                  .filter((r: any) => r.reading_purpose === "sample_event")
                  .map((r: any) => {
                    const gallons = (r.reading_end - r.reading_start) * (r.pulse_factor || 1);
                    const volMG   = gallons / 1_000_000;
                    return (
                      <tr key={r.id}>
                        <td style={s.td}>{r.reading_date}</td>
                        <td style={s.td}>{r.meter_label}</td>
                        <td style={{...s.td, textAlign:"right" as const}}>{Number(r.reading_start).toLocaleString()}</td>
                        <td style={{...s.td, textAlign:"right" as const}}>{Number(r.reading_end).toLocaleString()}</td>
                        <td style={{...s.td, textAlign:"right" as const, fontWeight:600, color:"#2b6cb0"}}>
                          {volMG.toFixed(4)}
                        </td>
                      </tr>
                    );
                  })}</tbody>
              </table>
            )}
          </section>
        )}

        {/* ── SNC STATUS ─────────────────────────────────────────────────── */}
        {!loading && tab === "snc" && (
          <section>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18}}>
              <h2 style={{...s.sectionTitle, margin:0}}>Significant Non-Compliance (SNC) Status</h2>
              <div style={{display:"flex", gap:8, alignItems:"center"}}>
                <select
                  style={{padding:"5px 8px", border:"1px solid #cbd5e0", borderRadius:5, fontSize:13}}
                  value={sncYear}
                  onChange={e => { const y = Number(e.target.value); setSncYear(y); loadSnc(y, sncHalf); }}>
                  {Array.from({length:4},(_,i)=>new Date().getFullYear()-i).map(y=>(
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select
                  style={{padding:"5px 8px", border:"1px solid #cbd5e0", borderRadius:5, fontSize:13}}
                  value={sncHalf}
                  onChange={e => { const h = Number(e.target.value); setSncHalf(h); loadSnc(sncYear, h); }}>
                  <option value={1}>H1 (Jan–Jun)</option>
                  <option value={2}>H2 (Jul–Dec)</option>
                </select>
              </div>
            </div>

            {sncLoading && (
              <div style={{textAlign:"center", padding:40, color:"#718096"}}>Calculating SNC…</div>
            )}

            {!sncLoading && !sncData && (
              <div style={{background:"#fff", borderRadius:8, padding:24, boxShadow:"0 1px 4px rgba(0,0,0,0.08)",
                           textAlign:"center", color:"#718096"}}>
                No permit data found for this period. Select a different year or period.
              </div>
            )}

            {!sncLoading && sncData && (() => {
              const d = sncData;
              const sncParams = d.parameters.filter((p: any) => p.in_snc);
              return (
                <div>
                  {/* Facility determination banner */}
                  <div style={{
                    borderRadius:8, padding:"16px 20px", marginBottom:20,
                    background: d.facility_in_snc ? "#fff5f5" : "#f0fff4",
                    border: `2px solid ${d.facility_in_snc ? "#fc8181" : "#68d391"}`,
                    display:"flex", alignItems:"center", gap:16,
                  }}>
                    <span style={{fontSize:28}}>{d.facility_in_snc ? "⚠️" : "✅"}</span>
                    <div>
                      <div style={{fontSize:16, fontWeight:700,
                        color: d.facility_in_snc ? "#c53030" : "#276749"}}>
                        {d.facility_in_snc
                          ? "Facility IS in Significant Non-Compliance"
                          : "Facility is NOT in Significant Non-Compliance"}
                      </div>
                      <div style={{fontSize:13, color:"#4a5568", marginTop:2}}>
                        Reporting period: {d.period_start} through {d.period_end}
                        {d.facility_in_snc && sncParams.length > 0 &&
                          ` — ${sncParams.length} parameter${sncParams.length > 1 ? "s" : ""} triggered SNC`}
                      </div>
                    </div>
                  </div>

                  {/* Explanation */}
                  <div style={{background:"#ebf8ff", border:"1px solid #bee3f8", borderRadius:6,
                               padding:"10px 14px", marginBottom:16, fontSize:12, color:"#2c5282"}}>
                    <strong>How SNC is determined:</strong> EPA requires two tests each semi-annual period.
                    Test 1 (Frequency): if violations exceed 66% of required samples for a parameter, that parameter is in Frequency SNC.
                    Test 2 (TRC Magnitude): if readings that exceed the permit limit by more than 40% (BOD/TSS/FOG) or 20% (all others)
                    occur in more than 33% of required samples, that parameter is in TRC SNC.
                    Either test triggering = Facility in SNC.
                  </div>

                  {/* Parameter detail table */}
                  {d.parameters.length === 0 ? (
                    <p style={{color:"#718096", textAlign:"center", padding:24}}>
                      No parameters with permit limits found for this period.
                    </p>
                  ) : (
                    <div style={{overflowX:"auto"}}>
                      <table style={{...s.table, fontSize:12}}>
                        <thead>
                          <tr>
                            <th style={s.th}>Parameter</th>
                            <th style={{...s.th, textAlign:"center" as const}}>Req.</th>
                            <th style={{...s.th, textAlign:"center" as const}}>Violations</th>
                            <th style={{...s.th, textAlign:"center" as const}}>Freq %</th>
                            <th style={{...s.th, textAlign:"center" as const}}>Freq SNC</th>
                            <th style={{...s.th, textAlign:"center" as const}}>TRC Factor</th>
                            <th style={{...s.th, textAlign:"center" as const}}>Max Ratio</th>
                            <th style={{...s.th, textAlign:"center" as const}}>TRC Count</th>
                            <th style={{...s.th, textAlign:"center" as const}}>TRC Freq %</th>
                            <th style={{...s.th, textAlign:"center" as const}}>TRC SNC</th>
                            <th style={{...s.th, textAlign:"center" as const}}>In SNC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.parameters.map((p: any) => {
                            const rowBg = p.in_snc ? "#fff5f5" : undefined;
                            const td = {...s.td, textAlign:"center" as const, background:rowBg};
                            const tdLeft = {...s.td, background:rowBg};
                            return (
                              <tr key={p.permit_limit_id}>
                                <td style={tdLeft}>
                                  <strong>{p.parameter_name}</strong>
                                  {p.is_ph && <span style={{fontSize:10, color:"#c05621", marginLeft:4}}>(pH rule)</span>}
                                </td>
                                <td style={td}>{p.required_samples}</td>
                                <td style={td}>{p.violation_count}</td>
                                <td style={{...td, fontWeight:600, color: p.violation_frequency_pct > 66 ? "#c53030" : "#2d3748"}}>
                                  {p.violation_frequency_pct.toFixed(1)}%
                                </td>
                                <td style={td}>
                                  {p.frequency_snc
                                    ? <span style={{fontWeight:700, color:"#c53030"}}>YES</span>
                                    : <span style={{color:"#276749"}}>No</span>}
                                </td>
                                <td style={td}>{p.is_ph ? "—" : `${p.trc_factor}×`}</td>
                                <td style={td}>{p.max_ratio != null ? p.max_ratio.toFixed(2) : "—"}</td>
                                <td style={td}>{p.trc_exceedance_count}</td>
                                <td style={{...td, fontWeight:600, color: p.trc_frequency_pct > 33 ? "#c53030" : "#2d3748"}}>
                                  {p.is_ph ? <span style={{fontSize:10,color:"#718096"}}>special</span> : `${p.trc_frequency_pct.toFixed(1)}%`}
                                </td>
                                <td style={td}>
                                  {p.trc_snc
                                    ? <span style={{fontWeight:700, color:"#c53030"}}>YES</span>
                                    : <span style={{color:"#276749"}}>No</span>}
                                </td>
                                <td style={td}>
                                  {p.in_snc
                                    ? <span style={{fontWeight:700, color:"#c53030", fontSize:13}}>⚠ SNC</span>
                                    : <span style={{fontWeight:600, color:"#276749"}}>✓</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div style={{fontSize:11, color:"#a0aec0", marginTop:12}}>
                    Permit: {d.permit_number} &nbsp;|&nbsp; "Req." = required samples per permit frequency in period
                    &nbsp;|&nbsp; TRC: 1.4× for BOD, TSS, FOG; 1.2× for all others
                  </div>
                </div>
              );
            })()}
          </section>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:          { minHeight:"100vh", background:"#f0f4f8" },
  stickyTop:     { position:"sticky", top:0, zIndex:100, boxShadow:"0 2px 8px rgba(0,0,0,0.12)" },
  header:        { background:"#1a365d", color:"#fff", padding:"12px 24px",
                   display:"flex", alignItems:"center", gap:12 },
  brand:         { fontSize:20, fontWeight:700 },
  companyBadge:  { fontSize:13, background:"rgba(255,255,255,0.15)", padding:"3px 10px",
                   borderRadius:12, maxWidth:200, overflow:"hidden", textOverflow:"ellipsis",
                   whiteSpace:"nowrap" },
  role:          { fontSize:13, background:"#2b6cb0", padding:"3px 10px", borderRadius:12 },
  logoutBtn:     { marginLeft:"auto", background:"transparent", color:"#fff",
                   border:"1px solid #fff", borderRadius:5, padding:"4px 12px", cursor:"pointer" },
  tabs:          { display:"flex", gap:4, padding:"16px 24px 0", background:"#fff",
                   borderBottom:"2px solid #e2e8f0" },
  tab:           { padding:"8px 20px", border:"none", background:"transparent",
                   cursor:"pointer", fontSize:14, color:"#4a5568", borderRadius:"5px 5px 0 0" },
  activeTab:     { background:"#ebf8ff", color:"#1a365d", fontWeight:700,
                   borderBottom:"2px solid #2b6cb0" },
  content:       { padding:24 },
  twoCol:        { display:"flex", gap:24, alignItems:"flex-start" },
  sectionTitle:  { fontSize:18, fontWeight:700, color:"#1a365d", marginBottom:16 },
  hint:          { fontSize:12, color:"#a0aec0", marginBottom:8 },
  meta:          { fontSize:13, color:"#718096" },

  // Dashboard cards
  cardGrid:      { display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:16 },
  dashCard:      { background:"#fff", borderRadius:8, padding:"18px 20px",
                   boxShadow:"0 1px 4px rgba(0,0,0,0.08)", borderTop:"3px solid #e2e8f0" },
  dashCardLabel: { fontSize:11, fontWeight:700, color:"#718096", textTransform:"uppercase",
                   letterSpacing:"0.06em", marginBottom:8 },
  dashCardValue: { fontSize:28, fontWeight:700, color:"#1a365d", lineHeight:1.1, marginBottom:4 },
  dashCardSub:   { fontSize:13, color:"#718096" },
  submitBtn:     { padding:"12px 28px", background:"#2b6cb0", color:"#fff", border:"none",
                   borderRadius:6, fontSize:15, fontWeight:700, cursor:"pointer" },
  linkBtn:       { background:"none", border:"none", color:"#2b6cb0", fontSize:13,
                   fontWeight:600, cursor:"pointer", padding:0, textDecoration:"underline" },

  badgePass:     { fontSize:12, fontWeight:700, background:"#c6f6d5", color:"#276749",
                   padding:"3px 10px", borderRadius:8, display:"inline-block" },
  badgeFail:     { fontSize:12, fontWeight:700, background:"#fff5f5", color:"#c53030",
                   padding:"3px 10px", borderRadius:8, display:"inline-block" },
  badgePending:  { fontSize:11, fontWeight:700, background:"#fefcbf", color:"#744210",
                   padding:"2px 8px", borderRadius:8, display:"inline-block" },
  badgeReviewed: { fontSize:11, fontWeight:700, background:"#c6f6d5", color:"#276749",
                   padding:"2px 8px", borderRadius:8, display:"inline-block" },

  chipMajor:     { padding:"3px 10px", borderRadius:10, fontSize:12, fontWeight:700,
                   background:"#fff5f5", color:"#c53030", border:"1px solid #feb2b2", display:"inline-block" },
  chipSig:       { padding:"3px 10px", borderRadius:10, fontSize:12, fontWeight:700,
                   background:"#fffff0", color:"#744210", border:"1px solid #f6e05e", display:"inline-block" },
  chipMinor:     { padding:"3px 10px", borderRadius:10, fontSize:12, fontWeight:700,
                   background:"#f7fafc", color:"#4a5568", border:"1px solid #cbd5e0", display:"inline-block" },

  table:         { width:"100%", borderCollapse:"collapse" as const, background:"#fff",
                   borderRadius:8, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.08)" },
  th:            { padding:"9px 12px", background:"#f7fafc", borderBottom:"2px solid #e2e8f0",
                   textAlign:"left" as const, fontSize:12, fontWeight:700, color:"#1a202c" },
  td:            { padding:"9px 12px", borderBottom:"1px solid #edf2f7", fontSize:13, color:"#2d3748" },

  detailCard:    { background:"#fff", borderRadius:8, padding:20, boxShadow:"0 1px 4px rgba(0,0,0,0.08)" },
  detailHeader:  { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 },
  detailTitle:   { fontSize:16, fontWeight:700, color:"#1a365d", margin:0 },
  closeBtn:      { background:"transparent", border:"1px solid #cbd5e0", borderRadius:5,
                   padding:"4px 10px", cursor:"pointer", fontSize:12, color:"#718096" },
  detailMeta:    { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12,
                   background:"#f7fafc", borderRadius:6, padding:12, marginBottom:16 },
  metaItem:      { display:"flex", flexDirection:"column" as const, gap:2 },
  metaLabel:     { fontSize:11, fontWeight:600, color:"#718096", textTransform:"uppercase" as const,
                   letterSpacing:"0.05em" },
  sectionDivider:{ fontSize:11, fontWeight:700, color:"#718096", textTransform:"uppercase" as const,
                   letterSpacing:"0.08em", borderBottom:"1px solid #edf2f7",
                   paddingBottom:4, marginBottom:10, marginTop:16 },
  violationBox:  { background:"#fff5f5", border:"1px solid #fc8181", borderRadius:6,
                   padding:"10px 14px", marginBottom:8 },
  violationRow:  { fontSize:13, color:"#c53030", marginTop:6 },
  reviewBox:     { background:"#f0fff4", border:"1px solid #68d391", borderRadius:6, padding:"12px 14px" },
  reviewedBadge: { fontSize:11, fontWeight:700, color:"#276749", marginBottom:6 },
  reviewText:    { fontSize:13, color:"#2d3748", whiteSpace:"pre-wrap" as const, margin:0 },
  pendingBox:    { background:"#fffff0", border:"1px solid #f6e05e", borderRadius:6,
                   padding:"10px 14px", fontSize:13, color:"#744210", marginTop:12 },

  statusPass:    { fontSize:12, fontWeight:600, color:"#276749" },
  statusFail:    { fontSize:12, fontWeight:600, color:"#c53030" },
  statusNA:      { fontSize:12, color:"#a0aec0" },
  mrBadge:       { fontWeight:700, color:"#ed8936" },
  rangeBadge:    { fontWeight:700, color:"#1a202c" },

  editInput:     { width:"100%", padding:"4px 8px", border:"1px solid #cbd5e0", borderRadius:4,
                   fontSize:13, boxSizing:"border-box" as const },
  cancelBtn:     { padding:"7px 16px", background:"#718096", color:"#fff", border:"none",
                   borderRadius:5, cursor:"pointer", fontSize:13 },
  saveMsg:       { padding:"8px 12px", borderRadius:5, fontSize:13, marginBottom:8, fontWeight:500 },
  actionEdit:    { fontSize:11, fontWeight:600, padding:"2px 8px", marginRight:4,
                   background:"#ebf8ff", color:"#2b6cb0", border:"1px solid #bee3f8",
                   borderRadius:4, cursor:"pointer" },
  actionDel:     { fontSize:11, fontWeight:600, padding:"2px 8px",
                   background:"#fff5f5", color:"#c53030", border:"1px solid #feb2b2",
                   borderRadius:4, cursor:"pointer" },
  actionSave:    { fontSize:11, fontWeight:600, padding:"2px 8px", marginRight:4,
                   background:"#c6f6d5", color:"#276749", border:"1px solid #9ae6b4",
                   borderRadius:4, cursor:"pointer" },
  actionCancel:  { fontSize:11, fontWeight:600, padding:"2px 8px",
                   background:"#f7fafc", color:"#4a5568", border:"1px solid #cbd5e0",
                   borderRadius:4, cursor:"pointer" },

  schedSummary:  { display:"flex", gap:8, flexWrap:"wrap" as const, marginBottom:16 },
  chipOverdue:   { padding:"4px 12px", borderRadius:12, fontSize:12, fontWeight:700,
                   background:"#fff5f5", color:"#c53030", border:"1px solid #feb2b2" },
  chipDueSoon:   { padding:"4px 12px", borderRadius:12, fontSize:12, fontWeight:700,
                   background:"#fffff0", color:"#744210", border:"1px solid #f6e05e" },
  chipNever:     { padding:"4px 12px", borderRadius:12, fontSize:12, fontWeight:700,
                   background:"#f7fafc", color:"#4a5568", border:"1px solid #cbd5e0" },
  chipCurrent:   { padding:"4px 12px", borderRadius:12, fontSize:12, fontWeight:700,
                   background:"#f0fff4", color:"#276749", border:"1px solid #9ae6b4" },
  schedOverdue:  { fontSize:12, fontWeight:700, color:"#c53030" },
  schedDueSoon:  { fontSize:12, fontWeight:700, color:"#744210" },
  schedNever:    { fontSize:12, color:"#718096" },
  schedCurrent:  { fontSize:12, fontWeight:600, color:"#276749" },

  deleteSampleBtn:{ padding:"7px 16px", background:"#fff5f5", color:"#c53030",
                    border:"1px solid #feb2b2", borderRadius:5, fontSize:13,
                    fontWeight:600, cursor:"pointer" },
  addResultBtn:  { padding:"6px 14px", background:"#ebf8ff", color:"#2b6cb0",
                   border:"1px solid #bee3f8", borderRadius:5, fontSize:13,
                   fontWeight:600, cursor:"pointer", marginBottom:12, display:"inline-block" },
  addResultCard: { background:"#f7fafc", border:"1px solid #e2e8f0", borderRadius:6,
                   padding:"12px 14px", marginBottom:12 },
  addResultTitle:{ fontSize:12, fontWeight:700, color:"#4a5568", textTransform:"uppercase" as const,
                   letterSpacing:"0.06em", marginBottom:10 },
  addResultLabel:{ display:"block", fontSize:12, fontWeight:600, color:"#4a5568", marginBottom:3 },
  addResultInput:{ display:"block", width:"100%", padding:"6px 8px", border:"1px solid #cbd5e0",
                   borderRadius:4, fontSize:13, boxSizing:"border-box" as const },
};
