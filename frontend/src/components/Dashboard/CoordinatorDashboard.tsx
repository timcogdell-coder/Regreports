import React, { useEffect, useState } from "react";
import { User, EnforcementAction, Violation } from "../../types";
import { getPendingEnforcement, approveEnforcement,
         getViolations, getCompanies, getSamplingSchedule, logout } from "../../api/client";
import NotificationBell from "../NotificationBell";

interface Props { user: User; onLogout: () => void; }

export default function CoordinatorDashboard({ user, onLogout }: Props) {
  const [tab, setTab]               = useState<"pending"|"violations"|"schedule">("pending");
  const [actions, setActions]       = useState<EnforcementAction[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [companies, setCompanies]   = useState<any[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>("");
  const [scheduleRows, setScheduleRows]   = useState<any[]>([]);
  const [scheduleCompany, setScheduleCompany] = useState<string>("");
  const [selected, setSelected]     = useState<EnforcementAction | null>(null);
  const [notes, setNotes]           = useState("");
  const [signature, setSignature]   = useState("");
  const [processing, setProcessing] = useState(false);
  const [fetchError, setFetchError] = useState<string>("");
  const [loading, setLoading]       = useState(true);

  const reload = () => {
    const err = (label: string) => (e: any) =>
      setFetchError(`${label}: ${e?.response?.data?.error ?? e?.message ?? "failed"}`);
    setFetchError("");
    setLoading(true);
    Promise.all([
      getPendingEnforcement().then(r => setActions(r.data)).catch(err("Enforcement")),
      getViolations().then(r => setViolations(r.data)).catch(err("Violations")),
      getCompanies().then(r => setCompanies(r.data)).catch(err("Companies")),
      getSamplingSchedule().then(r => setScheduleRows(r.data)).catch(err("Schedule")),
    ]).finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const handleApprove = async () => {
    if (!selected || !signature) return;
    setProcessing(true);
    await approveEnforcement(selected.id, { notes, e_signature: signature });
    setSelected(null); setNotes(""); setSignature(""); reload();
    setProcessing(false);
  };

  const handleLogout = () => { logout().finally(() => onLogout()); };

  const companyName = (id: number) =>
    companies.find(c => c.id === id)?.name ?? `Company #${id}`;

  const filteredViolations = companyFilter
    ? violations.filter((v: any) => String(v.company_id) === companyFilter)
    : violations;

  return (
    <div style={s.page}>
      <div style={s.stickyTop}>
        <header style={s.header}>
          <span style={s.brand}>Regreports PIMS</span>
          <span style={s.role}>Coordinator</span>
          <NotificationBell onGoToSchedule={() => {
            setTab("schedule");
            getSamplingSchedule().then(r => setScheduleRows(r.data));
          }} />
          <button style={s.logoutBtn} onClick={handleLogout}>Sign Out</button>
        </header>

        <div style={s.tabs}>
          <button style={{...s.tab, ...(tab==="pending" ? s.activeTab : {})}}
            onClick={() => setTab("pending")}>
            Pending Approvals {actions.length > 0 && `(${actions.length})`}
          </button>
          <button style={{...s.tab, ...(tab==="violations" ? s.activeTab : {})}}
            onClick={() => setTab("violations")}>
            Violations {violations.length > 0 && `(${violations.length})`}
          </button>
          <button style={{...s.tab, ...(tab==="schedule" ? s.activeTab : {}),
            ...(scheduleRows.filter(r=>r.status==="overdue").length > 0 ? {color:"#c53030"} : {})}}
            onClick={() => setTab("schedule")}>
            Schedule {scheduleRows.filter(r=>r.status==="overdue").length > 0
              && `(${scheduleRows.filter(r=>r.status==="overdue").length} overdue)`}
          </button>
        </div>
      </div>

      <div style={s.content}>

        {loading && (
          <div style={{ textAlign:"center", padding:48, color:"#718096" }}>
            <div style={{ fontSize:28, marginBottom:8 }}>⏳</div>
            Loading data…
          </div>
        )}

        {fetchError && (
          <div style={{ background:"#fff5f5", border:"1px solid #fc8181", borderRadius:6,
                         color:"#c53030", padding:"10px 14px", margin:"0 0 14px", fontSize:13 }}>
            <strong>Data load error —</strong> {fetchError}
            <br /><span style={{opacity:0.7, fontSize:11}}>
              Check that the backend is running and you are logged in.
            </span>
          </div>
        )}

        {!loading && tab === "pending" && (
          <div style={s.splitPane}>
            <div style={s.list}>
              {actions.length === 0
                ? <p style={s.empty}>No pending enforcement actions.</p>
                : actions.map(a => (
                  <div key={a.id} style={{...s.card, ...(selected?.id===a.id ? s.selectedCard : {})}}
                       onClick={() => setSelected(a)}>
                    <div style={s.cardTop}>
                      <strong>{a.response_level.replace("_"," ").toUpperCase()}</strong>
                      {a.fine_amount > 0 && <span style={s.fine}>${a.fine_amount.toFixed(2)}</span>}
                    </div>
                    <div style={s.cardSub}>
                      {companyName(a.company_id)} · Violation #{a.violation_id}
                    </div>
                  </div>
                ))
              }
            </div>

            {selected && (
              <div style={s.detail}>
                <h3 style={s.detailTitle}>Review Enforcement Action #{selected.id}</h3>
                <div style={s.letterBox}>{selected.auto_generated_response}</div>
                <label style={s.label}>Coordinator Notes</label>
                <textarea style={s.textarea} value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add notes or modifications…" />
                <label style={s.label}>Electronic Signature (type full name)</label>
                <input style={s.input} value={signature}
                  onChange={e => setSignature(e.target.value)}
                  placeholder="Full name as electronic signature" />
                <div style={s.actionRow}>
                  <button style={s.approveBtn} onClick={handleApprove}
                    disabled={!signature || processing}>
                    {processing ? "Approving…" : "Approve & Send"}
                  </button>
                  <button style={s.cancelBtn} onClick={() => setSelected(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && tab === "schedule" && (
          <div>
            <div style={s.filterBar}>
              <label style={s.filterLabel}>Filter by Company</label>
              <select style={s.filterSelect} value={scheduleCompany}
                onChange={e => {
                  setScheduleCompany(e.target.value);
                  getSamplingSchedule(e.target.value ? parseInt(e.target.value) : undefined)
                    .then(r => setScheduleRows(r.data));
                }}>
                <option value="">All companies</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {scheduleCompany && (
                <button style={s.clearFilter} onClick={() => {
                  setScheduleCompany("");
                  getSamplingSchedule().then(r => setScheduleRows(r.data));
                }}>Clear filter</button>
              )}
              <div style={{display:"flex", gap:8, marginLeft:"auto", flexWrap:"wrap" as const}}>
                {scheduleRows.filter(r=>r.status==="overdue").length  > 0 && <span style={s.chipOverdue}>{scheduleRows.filter(r=>r.status==="overdue").length} Overdue</span>}
                {scheduleRows.filter(r=>r.status==="due_soon").length > 0 && <span style={s.chipDueSoon}>{scheduleRows.filter(r=>r.status==="due_soon").length} Due Soon</span>}
                {scheduleRows.filter(r=>r.status==="never").length    > 0 && <span style={s.chipNever}>{scheduleRows.filter(r=>r.status==="never").length} Never Sampled</span>}
                {scheduleRows.filter(r=>r.status==="current").length  > 0 && <span style={s.chipCurrent}>{scheduleRows.filter(r=>r.status==="current").length} Current</span>}
              </div>
            </div>

            {scheduleRows.length === 0
              ? <p style={{color:"#718096", padding:16}}>No frequency requirements found.</p>
              : <table style={s.table}>
                  <thead><tr>
                    <th style={s.th}>Company</th>
                    <th style={s.th}>Permit</th>
                    <th style={s.th}>Parameter</th>
                    <th style={s.th}>Frequency</th>
                    <th style={s.th}>Sample Type</th>
                    <th style={s.th}>Last Sampled</th>
                    <th style={s.th}>Next Due</th>
                    <th style={s.th}>Status</th>
                  </tr></thead>
                  <tbody>{scheduleRows.map((r: any, i: number) => (
                    <tr key={i} style={{
                      background: r.status==="overdue" ? "#fff5f5" : r.status==="due_soon" ? "#fffff0" : undefined
                    }}>
                      <td style={s.td}><strong>{r.company_name}</strong></td>
                      <td style={s.td}>{r.permit_number}</td>
                      <td style={s.td}>{r.parameter_name}</td>
                      <td style={s.td}>{r.frequency_description}</td>
                      <td style={{...s.td, textTransform:"capitalize"}}>{r.sample_type ?? "—"}</td>
                      <td style={s.td}>{r.last_sample_date ?? <em style={{color:"#a0aec0"}}>Never</em>}</td>
                      <td style={s.td}>{r.next_due_date ?? "—"}</td>
                      <td style={s.td}>
                        {r.status==="overdue"  && <span style={s.schedOverdue}>Overdue {r.days_overdue}d</span>}
                        {r.status==="due_soon" && <span style={s.schedDueSoon}>Due Soon</span>}
                        {r.status==="never"    && <span style={s.schedNever}>Never Sampled</span>}
                        {r.status==="current"  && <span style={s.schedCurrent}>Current</span>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
            }
          </div>
        )}

        {!loading && tab === "violations" && (
          <div>
            {/* Filter bar */}
            <div style={s.filterBar}>
              <label style={s.filterLabel}>Filter by Company</label>
              <select style={s.filterSelect} value={companyFilter}
                onChange={e => setCompanyFilter(e.target.value)}>
                <option value="">All companies</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {companyFilter && (
                <button style={s.clearFilter} onClick={() => setCompanyFilter("")}>
                  Clear filter
                </button>
              )}
              <span style={s.filterCount}>
                {filteredViolations.length} violation{filteredViolations.length !== 1 ? "s" : ""}
              </span>
            </div>

            {filteredViolations.length === 0 ? (
              <p style={s.allGood}>✓ No violations on record{companyFilter ? " for this company" : ""}</p>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Date</th>
                    <th style={s.th}>Company</th>
                    <th style={s.th}>Parameter</th>
                    <th style={s.th}>Type</th>
                    <th style={s.th}>Severity</th>
                    <th style={s.th}>Exceedance</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredViolations.map((v: any) => (
                    <tr key={v.id}
                      style={{background: v.violation_severity === "major" ? "#fff5f5" : undefined}}>
                      <td style={s.td}>{v.violation_date}</td>
                      <td style={s.td}><strong>{companyName(v.company_id)}</strong></td>
                      <td style={s.td}>{v.parameter_name}</td>
                      <td style={s.td}>{v.violation_type.replace("_", " ")}</td>
                      <td style={s.td}>
                        <span style={
                          v.violation_severity === "major"    ? s.sevMajor :
                          v.violation_severity === "significant" ? s.sevSignificant :
                          s.sevMinor
                        }>
                          {v.violation_severity}
                        </span>
                      </td>
                      <td style={s.td}>{v.exceedance_percent?.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:         { minHeight:"100vh", background:"#f0f4f8" },
  stickyTop:    { position:"sticky", top:0, zIndex:100,
                  boxShadow:"0 2px 8px rgba(0,0,0,0.12)" },
  header:       { background:"#1a365d", color:"#fff", padding:"12px 24px",
                  display:"flex", alignItems:"center", gap:16 },
  brand:        { fontSize:20, fontWeight:700, flex:1 },
  role:         { fontSize:13, background:"#2b6cb0", padding:"3px 10px", borderRadius:12 },
  logoutBtn:    { marginLeft:"auto", background:"transparent", color:"#fff",
                  border:"1px solid #fff", borderRadius:5, padding:"4px 12px", cursor:"pointer" },
  tabs:         { display:"flex", gap:4, padding:"16px 24px 0", background:"#fff",
                  borderBottom:"2px solid #e2e8f0" },
  tab:          { padding:"8px 20px", border:"none", background:"transparent",
                  cursor:"pointer", fontSize:14, color:"#4a5568", borderRadius:"5px 5px 0 0" },
  activeTab:    { background:"#ebf8ff", color:"#1a365d", fontWeight:700,
                  borderBottom:"2px solid #2b6cb0" },
  content:      { padding:24 },
  splitPane:    { display:"flex", gap:20 },
  list:         { width:280, flexShrink:0 },
  card:         { background:"#fff", borderRadius:8, padding:14, marginBottom:10,
                  cursor:"pointer", border:"2px solid transparent",
                  boxShadow:"0 1px 4px rgba(0,0,0,0.08)" },
  selectedCard: { borderColor:"#2b6cb0" },
  cardTop:      { display:"flex", justifyContent:"space-between", fontWeight:600, fontSize:14 },
  cardSub:      { fontSize:12, color:"#718096", marginTop:4 },
  fine:         { color:"#c53030", fontWeight:700 },
  detail:       { flex:1, background:"#fff", borderRadius:8, padding:20,
                  boxShadow:"0 1px 4px rgba(0,0,0,0.08)" },
  detailTitle:  { fontSize:16, fontWeight:700, color:"#1a365d", marginBottom:14 },
  letterBox:    { background:"#f7fafc", border:"1px solid #e2e8f0", borderRadius:6,
                  padding:14, fontFamily:"monospace", fontSize:12, whiteSpace:"pre-wrap",
                  marginBottom:16, maxHeight:260, overflowY:"auto" },
  label:        { display:"block", fontSize:12, fontWeight:600, color:"#4a5568", marginBottom:4 },
  textarea:     { display:"block", width:"100%", padding:"8px 10px", marginBottom:14,
                  border:"1px solid #cbd5e0", borderRadius:5, fontSize:13,
                  minHeight:80, resize:"vertical" },
  input:        { display:"block", width:"100%", padding:"8px 10px", marginBottom:14,
                  border:"1px solid #cbd5e0", borderRadius:5, fontSize:14 },
  actionRow:    { display:"flex", gap:10 },
  approveBtn:   { padding:"8px 20px", background:"#276749", color:"#fff",
                  border:"none", borderRadius:5, fontWeight:600, cursor:"pointer" },
  cancelBtn:    { padding:"8px 20px", background:"#718096", color:"#fff",
                  border:"none", borderRadius:5, cursor:"pointer" },
  empty:        { color:"#718096", padding:16 },
  allGood:      { color:"#276749", fontWeight:600, padding:16 },
  filterBar:    { display:"flex", alignItems:"center", gap:12, marginBottom:16,
                  background:"#fff", padding:"12px 16px", borderRadius:8,
                  boxShadow:"0 1px 4px rgba(0,0,0,0.08)" },
  filterLabel:  { fontSize:13, fontWeight:600, color:"#4a5568", whiteSpace:"nowrap" },
  filterSelect: { padding:"6px 10px", border:"1px solid #cbd5e0", borderRadius:5,
                  fontSize:13, minWidth:200 },
  clearFilter:  { padding:"5px 12px", background:"#718096", color:"#fff", border:"none",
                  borderRadius:5, cursor:"pointer", fontSize:12 },
  filterCount:  { fontSize:12, color:"#718096", marginLeft:"auto" },
  table:        { width:"100%", borderCollapse:"collapse" as const, background:"#fff",
                  borderRadius:8, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.08)" },
  th:           { padding:"9px 12px", background:"#f7fafc", borderBottom:"2px solid #e2e8f0",
                  textAlign:"left" as const, fontSize:12, fontWeight:700, color:"#1a202c" },
  td:           { padding:"9px 12px", borderBottom:"1px solid #edf2f7",
                  fontSize:13, color:"#2d3748" },
  chipOverdue:  { padding:"4px 12px", borderRadius:12, fontSize:12, fontWeight:700,
                  background:"#fff5f5", color:"#c53030", border:"1px solid #feb2b2" },
  chipDueSoon:  { padding:"4px 12px", borderRadius:12, fontSize:12, fontWeight:700,
                  background:"#fffff0", color:"#744210", border:"1px solid #f6e05e" },
  chipNever:    { padding:"4px 12px", borderRadius:12, fontSize:12, fontWeight:700,
                  background:"#f7fafc", color:"#4a5568", border:"1px solid #cbd5e0" },
  chipCurrent:  { padding:"4px 12px", borderRadius:12, fontSize:12, fontWeight:700,
                  background:"#f0fff4", color:"#276749", border:"1px solid #9ae6b4" },
  schedOverdue: { fontSize:12, fontWeight:700, color:"#c53030" },
  schedDueSoon: { fontSize:12, fontWeight:700, color:"#744210" },
  schedNever:   { fontSize:12, color:"#718096" },
  schedCurrent: { fontSize:12, fontWeight:600, color:"#276749" },
  sevMajor:     { fontSize:12, fontWeight:700, color:"#c53030" },
  sevSignificant:{ fontSize:12, fontWeight:600, color:"#c05621" },
  sevMinor:     { fontSize:12, color:"#718096" },
};
