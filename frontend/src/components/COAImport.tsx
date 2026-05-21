import React, { useRef, useState } from "react";
import { parseCOA } from "../api/client";

interface Props {
  companyId: number;
  companyName: string;
  parameters: any[];        // full parameter list from admin state
  onConfirm: (payload: any) => void;
  onCancel: () => void;
}

export default function COAImport({ companyId, companyName, parameters, onConfirm, onCancel }: Props) {
  const fileRef  = useRef<HTMLInputElement>(null);
  const [parsing,  setParsing]  = useState(false);
  const [preview,  setPreview]  = useState<any | null>(null);
  const [error,    setError]    = useState("");
  // Per-row overrides: rowKey → parameter_id chosen by user
  const [overrides, setOverrides] = useState<Record<string, number | null>>({});

  const handleFile = async (file: File) => {
    setParsing(true);
    setError("");
    setPreview(null);
    try {
      const res = await parseCOA(companyId, file);
      setPreview(res.data);
    } catch (e: any) {
      setError(e.response?.data?.error ?? "Failed to parse PDF");
    } finally {
      setParsing(false);
    }
  };

  const rowKey = (sIdx: number, rIdx: number) => `${sIdx}-${rIdx}`;

  const handleConfirm = () => {
    if (!preview) return;
    // Build payload for the first sample group (most COAs are single-sample)
    const sample = preview.samples[0];
    const results: any[] = [];
    sample.results.forEach((r: any, rIdx: number) => {
      const key   = rowKey(0, rIdx);
      const limId = overrides[key] !== undefined ? overrides[key] : r.permit_limit_id;
      if (limId && r.result !== null && !r.non_detect) {
        results.push({ permit_limit_id: limId, concentration: r.result });
      }
    });

    onConfirm({
      permit_id:      preview.permit_id,
      sample_date:    sample.date_collected ?? "",
      coa_job_id:     preview.job_id,
      results,
      _preview:       preview,   // passed through so the form can pre-fill the rest
    });
  };

  // ── Styles ──────────────────────────────────────────────────────────────
  const s: Record<string, React.CSSProperties> = {
    wrap:     { fontFamily:"inherit" },
    dropzone: { border:"2px dashed #b794f4", borderRadius:8, padding:"32px 24px",
                textAlign:"center", cursor:"pointer", background:"#faf5ff",
                color:"#553c9a", marginBottom:16 },
    table:    { width:"100%", borderCollapse:"collapse", fontSize:13, marginTop:12 },
    th:       { padding:"6px 10px", background:"#f7fafc", borderBottom:"2px solid #e2e8f0",
                textAlign:"left" as const, fontWeight:700, color:"#1a202c", whiteSpace:"nowrap" as const },
    td:       { padding:"6px 10px", borderBottom:"1px solid #edf2f7", verticalAlign:"middle" as const },
    btn:      { padding:"9px 22px", background:"#553c9a", color:"#fff",
                border:"none", borderRadius:5, fontWeight:600, cursor:"pointer" },
    outBtn:   { padding:"9px 22px", background:"#fff", color:"#718096",
                border:"2px solid #cbd5e0", borderRadius:5, fontWeight:600, cursor:"pointer" },
    select:   { padding:"3px 6px", border:"1px solid #cbd5e0", borderRadius:4,
                fontSize:12, maxWidth:200 },
    summary:  { display:"flex", gap:16, marginBottom:12, flexWrap:"wrap" as const },
  };

  const badge = (color: string, bg: string): React.CSSProperties => ({
    display:"inline-block", padding:"2px 8px", borderRadius:10,
    fontSize:11, fontWeight:700, background:bg, color,
  });
  const chip = (color: string, bg: string): React.CSSProperties => ({
    padding:"4px 12px", borderRadius:12, fontSize:12,
    fontWeight:700, background:bg, color,
  });

  return (
    <div style={s.wrap}>
      {/* ── Step 1: file picker ── */}
      {!preview && (
        <>
          <div style={s.dropzone}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}>
            {parsing
              ? "Parsing PDF…"
              : <>
                  <div style={{fontSize:32, marginBottom:8}}>📄</div>
                  <strong>Click or drag a COA PDF here</strong>
                  <div style={{fontSize:12, marginTop:4, color:"#718096"}}>
                    Eurofins Columbia format · results will be matched to {companyName}'s active permit
                  </div>
                </>
            }
          </div>
          <input ref={fileRef} type="file" accept=".pdf" style={{display:"none"}}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          {error && <p style={{color:"#c53030", fontSize:13}}>{error}</p>}
          <button style={s.outBtn} onClick={onCancel}>Cancel</button>
        </>
      )}

      {/* ── Step 2: review ── */}
      {preview && (
        <>
          <div style={{marginBottom:12}}>
            <strong>{preview.source_file}</strong>
            <span style={{color:"#718096", fontSize:12, marginLeft:12}}>
              Client: {preview.client} · Job: {preview.job_id} · Permit: {preview.permit_number}
            </span>
          </div>

          <div style={s.summary}>
            <span style={chip("#276749","#c6f6d5")}>{preview.in_permit} in permit</span>
            <span style={chip("#b7791f","#fefcbf")}>{preview.matched - preview.in_permit} matched, not in permit</span>
            <span style={chip("#c53030","#fed7d7")}>{preview.unmatched} unmatched</span>
          </div>

          {preview.samples.map((sample: any, sIdx: number) => (
            <div key={sIdx} style={{marginBottom:20}}>
              <div style={{fontSize:13, color:"#4a5568", marginBottom:6}}>
                Sample: <strong>{sample.client_sample_id}</strong>
                {sample.date_collected && <> · Collected: <strong>{sample.date_collected}</strong></>}
                {sample.matrix && <> · Matrix: {sample.matrix}</>}
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>COA Analyte</th>
                      <th style={s.th}>Result</th>
                      <th style={s.th}>Unit</th>
                      <th style={s.th}>Matched Parameter</th>
                      <th style={s.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sample.results.map((r: any, rIdx: number) => {
                      const key      = rowKey(sIdx, rIdx);
                      const override = overrides[key];
                      const limId    = override !== undefined ? override : r.permit_limit_id;
                      const inPermit = override !== undefined
                        ? override !== null
                        : r.in_permit;

                      return (
                        <tr key={rIdx} style={{background: r.non_detect ? "#f7fafc" : "white"}}>
                          <td style={s.td}>{r.analyte}</td>
                          <td style={{...s.td, textAlign:"right"}}>
                            {r.non_detect
                              ? <span style={{color:"#718096"}}>ND (&lt;{r.result})</span>
                              : <strong>{r.result}</strong>
                            }
                          </td>
                          <td style={s.td}>{r.unit}</td>
                          <td style={s.td}>
                            {r.matched && override === undefined
                              ? r.parameter_name
                              : (
                                <select style={s.select}
                                  value={limId ?? ""}
                                  onChange={e => {
                                    const val = e.target.value ? parseInt(e.target.value) : null;
                                    setOverrides(o => ({...o, [key]: val}));
                                  }}>
                                  <option value="">— skip —</option>
                                  {parameters.map((p: any) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                              )
                            }
                          </td>
                          <td style={s.td}>
                            {r.non_detect
                              ? <span style={badge("#718096","#edf2f7")}>Non-detect</span>
                              : inPermit
                                ? <span style={badge("#276749","#c6f6d5")}>In permit</span>
                                : r.matched
                                  ? <span style={badge("#b7791f","#fefcbf")}>Not in permit</span>
                                  : <span style={badge("#c53030","#fed7d7")}>Unmatched</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <p style={{fontSize:12, color:"#718096", marginBottom:12}}>
            Only rows marked <strong>In permit</strong> with numeric results will be imported.
            Non-detects and unmatched rows are excluded. You can still adjust meter readings
            and other fields on the next screen.
          </p>

          <div style={{display:"flex", gap:10}}>
            <button style={s.btn} onClick={handleConfirm}>
              Import {preview.samples[0]?.results.filter((r: any) => r.in_permit && !r.non_detect).length ?? 0} results →
            </button>
            <button style={s.outBtn} onClick={() => { setPreview(null); setOverrides({}); }}>
              ← Try another file
            </button>
            <button style={s.outBtn} onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
