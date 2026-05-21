import React, { useEffect, useState } from "react";
import { User } from "../../types";
import { logout, getCompanies, getMeterReadings, getMeters, createMeterReading } from "../../api/client";
import api from "../../api/client";

interface Props { user: User; onLogout: () => void; }

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// Default to previous month so the form is ready to run immediately
const now       = new Date();
const defMonth  = now.getMonth() === 0 ? 12 : now.getMonth();          // 1-12
const defYear   = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
const yearRange = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i);

export default function FinanceDashboard({ user, onLogout }: Props) {
  const [tab, setTab]         = useState<"calculate"|"history"|"meter-readings">("calculate");
  const [companies, setCompanies] = useState<any[]>([]);
  const [rates, setRates]     = useState<{ bod_rate: number; tss_rate: number; color_rate: number } | null>(null);

  // ── Calculate tab ────────────────────────────────────────────────────────────
  const [calcCompany, setCalcCompany]   = useState("");
  const [calcMonth,   setCalcMonth]     = useState(String(defMonth));
  const [calcYear,    setCalcYear]      = useState(String(defYear));
  const [calcRunning, setCalcRunning]   = useState(false);
  const [calcResult,  setCalcResult]    = useState<any | null>(null);
  const [calcError,   setCalcError]     = useState("");

  // ── History tab ───────────────────────────────────────────────────────────────
  const [history,         setHistory]         = useState<any[]>([]);
  const [histCompany,     setHistCompany]     = useState("");
  const [histFilterMonth, setHistFilterMonth] = useState("");
  const [histFilterYear,  setHistFilterYear]  = useState("");
  const [histLoading,     setHistLoading]     = useState(false);

  // ── Meter Readings tab ────────────────────────────────────────────────────────
  const [mrCompany,     setMrCompany]     = useState("");
  const [mrFilterMonth, setMrFilterMonth] = useState("");
  const [mrFilterYear,  setMrFilterYear]  = useState("");
  const [mrReadings,    setMrReadings]    = useState<any[]>([]);
  const [mrLoading,   setMrLoading]     = useState(false);
  const [mrActiveMeter, setMrActiveMeter] = useState<any | null>(null);
  const [mrDate,      setMrDate]        = useState("");
  const [mrStart,     setMrStart]       = useState("");
  const [mrEnd,       setMrEnd]         = useState("");
  const [mrDays,      setMrDays]        = useState("1");
  const [mrSaving,    setMrSaving]      = useState(false);
  const [mrError,     setMrError]       = useState("");
  const [mrSuccess,   setMrSuccess]     = useState("");

  const [initLoading, setInitLoading] = useState(true);
  const handleLogout = () => { logout().finally(() => onLogout()); };

  useEffect(() => {
    Promise.all([
      getCompanies().then(r => setCompanies(r.data)),
      api.get("/admin/config/potw").then(r => setRates(r.data)),
    ]).finally(() => setInitLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "history") loadHistory();
    if (tab === "meter-readings") loadMrReadings();
  }, [tab, histCompany, mrCompany]); // eslint-disable-line

  useEffect(() => {
    if (!mrCompany) { setMrActiveMeter(null); return; }
    getMeters(parseInt(mrCompany)).then(r => {
      const active = r.data.find((m: any) => m.is_active);
      setMrActiveMeter(active ?? null);
      if (active) {
        getMeterReadings(parseInt(mrCompany)).then(r2 => {
          const last = r2.data[r2.data.length - 1];
          if (last) setMrStart(String(last.reading_end));
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [mrCompany]); // eslint-disable-line

  const loadHistory = () => {
    setHistLoading(true);
    const params: any = {};
    if (histCompany) params.company_id = histCompany;
    api.get("/surcharges", { params })
      .then(r => setHistory(r.data))
      .finally(() => setHistLoading(false));
  };

  const loadMrReadings = () => {
    setMrLoading(true);
    getMeterReadings(mrCompany ? parseInt(mrCompany) : undefined)
      .then(r => setMrReadings(r.data))
      .finally(() => setMrLoading(false));
  };

  const submitMrReading = async () => {
    setMrError("");
    setMrSuccess("");
    if (!mrCompany)  { setMrError("Select a company."); return; }
    if (!mrActiveMeter) { setMrError("No active meter found for this company."); return; }
    if (!mrDate || !mrStart || !mrEnd) { setMrError("Date, start, and end readings are required."); return; }
    const start = parseFloat(mrStart);
    const end   = parseFloat(mrEnd);
    if (isNaN(start) || isNaN(end)) { setMrError("Start and end must be numbers."); return; }
    if (end <= start) { setMrError("End reading must be greater than start reading."); return; }
    setMrSaving(true);
    try {
      await createMeterReading({
        meter_id:             mrActiveMeter.id,
        reading_start:        start,
        reading_end:          end,
        reading_date:         mrDate,
        sampling_period_days: parseInt(mrDays) || 1,
      });
      setMrSuccess("Reading saved.");
      setMrStart(String(end));
      setMrEnd("");
      setMrDate("");
      loadMrReadings();
    } catch (err: any) {
      setMrError(err.response?.data?.error ?? "Failed to save reading.");
    } finally {
      setMrSaving(false);
    }
  };

  const runCalculation = async () => {
    if (!calcCompany) { setCalcError("Please select a company."); return; }
    setCalcRunning(true);
    setCalcError("");
    setCalcResult(null);
    try {
      const r = await api.post("/surcharges/calculate", {
        company_id: parseInt(calcCompany),
        month:      parseInt(calcMonth),
        year:       parseInt(calcYear),
      });
      setCalcResult(r.data);
    } catch (err: any) {
      setCalcError(err.response?.data?.error ?? "Calculation failed.");
    } finally {
      setCalcRunning(false);
    }
  };

  // ── Print meter reading history ───────────────────────────────────────────────
  const printMrHistory = (filtered: any[]) => {
    const periodLabel = [
      mrFilterMonth ? MONTHS[parseInt(mrFilterMonth) - 1] : null,
      mrFilterYear  || null,
    ].filter(Boolean).join(" ") || "All Periods";

    // Group records by company
    const byCompany: Record<string, any[]> = {};
    filtered.forEach(r => {
      const name = r.company_name ?? companyName(r.company_id);
      if (!byCompany[name]) byCompany[name] = [];
      byCompany[name].push(r);
    });

    const facilitySections = Object.entries(byCompany).map(([name, records]) => {
      const totalMG = records.reduce((sum, r) => {
        const vol = r.volume_mg ?? ((r.reading_end - r.reading_start) * (r.pulse_factor || 1)) / 1_000_000;
        return sum + Number(vol);
      }, 0);

      const rows = records.map(r => {
        const isCF = r.unit === "cubic_feet";
        const vol  = r.volume_native ?? r.volume_mg;
        return `
          <tr>
            <td>${r.reading_date}</td>
            <td style="font-family:monospace;font-size:11px">${r.meter_label}</td>
            <td>${r.meter_type === "sanitary" ? "Sanitary" : "Process"}</td>
            <td>${r.reading_purpose === "sample_event" ? "Sample Event" : "Monthly"}</td>
            <td style="text-align:right">${Number(r.reading_start).toLocaleString()}</td>
            <td style="text-align:right">${Number(r.reading_end).toLocaleString()}</td>
            <td style="text-align:right;font-weight:600">${isCF ? Number(vol).toFixed(2) : Number(vol).toFixed(4)}</td>
            <td>${isCF ? "CF" : "MG"}</td>
            <td style="text-align:right">${r.sampling_period_days ?? "—"}</td>
          </tr>`;
      }).join("");

      return `
        <div class="facility">
          <div class="facility-header">${name}</div>
          <table>
            <thead><tr>
              <th>Date</th><th>Meter</th><th>Meter Type</th><th>Purpose</th>
              <th style="text-align:right">Start</th><th style="text-align:right">End</th>
              <th style="text-align:right">Volume</th><th>Unit</th><th style="text-align:right">Days</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr class="subtotal">
                <td colspan="6" style="text-align:right">Total Volume (MG)</td>
                <td style="text-align:right">${totalMG.toFixed(4)}</td>
                <td>MG</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>`;
    }).join("");

    const win = window.open("", "_blank", "width=960,height=700");
    if (!win) { alert("Popup blocked — please allow popups for this site and try again."); return; }
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Meter Reading Report — ${periodLabel}</title>
      <style>
        body         { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #1a202c; }
        .report-hdr  { border-bottom: 2px solid #1a365d; padding-bottom: 10px; margin-bottom: 18px; }
        .report-hdr h1 { margin: 0; font-size: 20px; color: #1a365d; }
        .report-hdr p  { margin: 4px 0 0; color: #4a5568; font-size: 12px; }
        .facility        { margin-bottom: 28px; page-break-inside: avoid; }
        .facility-header { background: #2d3748; color: #fff; font-weight: 700; font-size: 13px;
                           padding: 6px 10px; border-radius: 4px 4px 0 0; }
        table  { width: 100%; border-collapse: collapse; }
        th     { background: #4a5568; color: #fff; padding: 5px 8px; text-align: left; font-size: 11px; }
        td     { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
        tr:nth-child(even) td { background: #f7fafc; }
        .subtotal td { background: #edf2f7 !important; font-weight: 700; border-top: 2px solid #cbd5e0; }
        .footer { margin-top: 24px; font-size: 10px; color: #718096;
                  border-top: 1px solid #e2e8f0; padding-top: 10px; }
        @media print { button { display: none; } .facility { page-break-inside: avoid; } }
      </style>
    </head><body>
      <div class="report-hdr">
        <h1>Meter Reading Report</h1>
        <p>Regreports PIMS &nbsp;|&nbsp; Period: ${periodLabel} &nbsp;|&nbsp;
           ${Object.keys(byCompany).length} facilit${Object.keys(byCompany).length === 1 ? "y" : "ies"} &nbsp;|&nbsp;
           ${filtered.length} record(s) &nbsp;|&nbsp; Printed: ${new Date().toLocaleDateString()}</p>
      </div>
      ${facilitySections}
      <div class="footer">Generated by Regreports PIMS · ${new Date().toLocaleString()}</div>
      <script>window.onload = () => { window.print(); window.close(); }<\/script>
    </body></html>`);
    win.document.close();
  };

  // ── Print combined surcharge report ──────────────────────────────────────────
  const printSurchargeReport = (records: any[]) => {
    if (records.length === 0) return;
    const periodLabel = [
      histFilterMonth ? MONTHS[parseInt(histFilterMonth) - 1] : null,
      histFilterYear  || null,
    ].filter(Boolean).join(" ") || "All Periods";

    const grandBOD   = records.reduce((s, r) => s + (r.bod_charge   ?? 0), 0);
    const grandTSS   = records.reduce((s, r) => s + (r.tss_charge   ?? 0), 0);
    const grandColor = records.reduce((s, r) => s + (r.color_charge ?? 0), 0);
    const grandTotal = records.reduce((s, r) => s + (r.total_charge ?? 0), 0);
    const fmt  = (v: number) => `$${Math.abs(v).toFixed(2)}${v < 0 ? " CR" : ""}`;
    const fmtN = (v: any, d = 4) => v != null ? Number(v).toFixed(d) : "—";

    const rows = records.map(r => {
      const name   = companyName(r.company_id);
      const period = `${MONTHS[r.month - 1]} ${r.year}`;
      const hasFlow = r.avg_flow_mg != null;
      return `
        <tr>
          <td style="font-family:monospace;font-size:11px">${r.invoice_id ?? "—"}</td>
          <td style="font-weight:600">${name}</td>
          <td>${period}</td>
          <td style="text-align:right">${hasFlow ? fmtN(r.avg_flow_mg) : "—"}</td>
          <td style="text-align:right">${hasFlow ? fmtN(r.total_flow_mg) : "—"}</td>
          <td style="text-align:right">${fmt(r.bod_charge ?? 0)}</td>
          <td style="text-align:right">${fmt(r.tss_charge ?? 0)}</td>
          <td style="text-align:right">${fmt(r.color_charge ?? 0)}</td>
          <td style="text-align:right;font-weight:700;color:${(r.total_charge ?? 0) > 0 ? "#c53030" : "#276749"}">${fmt(r.total_charge ?? 0)}</td>
        </tr>`;
    }).join("");

    const win = window.open("", "_blank", "width=1050,height=720");
    if (!win) { alert("Popup blocked — please allow popups for this site and try again."); return; }
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Surcharge Report — ${periodLabel}</title>
      <style>
        * { box-sizing: border-box; }
        body   { font-family: Arial, sans-serif; font-size: 12px; margin: 0; color: #1a202c; }
        .page  { padding: 28px 32px; }
        .rpt-header { display:flex; justify-content:space-between; align-items:flex-start;
                      border-bottom: 3px solid #1a365d; padding-bottom: 12px; margin-bottom: 20px; }
        .rpt-title  { font-size: 22px; font-weight: 700; color: #1a365d; margin: 0 0 4px; }
        .rpt-sub    { font-size: 12px; color: #4a5568; margin: 0; }
        .rpt-meta   { text-align: right; font-size: 11px; color: #718096; line-height: 1.8; }
        table  { width: 100%; border-collapse: collapse; margin-top: 4px; }
        th     { background: #1a365d; color: #fff; padding: 7px 10px;
                 text-align: left; font-size: 11px; white-space: nowrap; }
        td     { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
        tr:nth-child(even) td { background: #f7fafc; }
        .grand-total td { background: #1a365d !important; color: #fff;
                          font-weight: 700; font-size: 13px; border-top: 2px solid #2d3748; }
        .summary { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
        .stat    { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 6px;
                   padding: 10px 16px; min-width: 140px; }
        .stat-label { font-size: 10px; color: #718096; text-transform: uppercase;
                      letter-spacing: .5px; margin-bottom: 4px; }
        .stat-value { font-size: 18px; font-weight: 700; color: #1a365d; }
        .footer { margin-top: 28px; font-size: 10px; color: #718096;
                  border-top: 1px solid #e2e8f0; padding-top: 10px; }
        @media print {
          button { display: none; }
          .page  { padding: 16px; }
        }
      </style>
    </head><body><div class="page">
      <div class="rpt-header">
        <div>
          <p class="rpt-title">Surcharge Report</p>
          <p class="rpt-sub">Regreports PIMS — Pretreatment Program Billing</p>
        </div>
        <div class="rpt-meta">
          Period: <strong>${periodLabel}</strong><br>
          Facilities: <strong>${records.length}</strong><br>
          Printed: <strong>${new Date().toLocaleDateString()}</strong>
        </div>
      </div>

      <div class="summary">
        <div class="stat">
          <div class="stat-label">Total BOD</div>
          <div class="stat-value">${fmt(grandBOD)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Total TSS</div>
          <div class="stat-value">${fmt(grandTSS)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Total Color</div>
          <div class="stat-value">${fmt(grandColor)}</div>
        </div>
        <div class="stat" style="border-color:#1a365d">
          <div class="stat-label">Grand Total</div>
          <div class="stat-value" style="color:${grandTotal > 0 ? "#c53030" : "#276749"}">${fmt(grandTotal)}</div>
        </div>
      </div>

      <table>
        <thead><tr>
          <th>Invoice #</th>
          <th>Facility</th>
          <th>Period</th>
          <th style="text-align:right">Avg Flow (MGD)</th>
          <th style="text-align:right">Total Flow (MG)</th>
          <th style="text-align:right">BOD</th>
          <th style="text-align:right">TSS</th>
          <th style="text-align:right">Color</th>
          <th style="text-align:right">Total Due</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="grand-total">
            <td colspan="5">Grand Total — ${records.length} invoice${records.length !== 1 ? "s" : ""}</td>
            <td style="text-align:right">${fmt(grandBOD)}</td>
            <td style="text-align:right">${fmt(grandTSS)}</td>
            <td style="text-align:right">${fmt(grandColor)}</td>
            <td style="text-align:right">${fmt(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
      <div class="footer">
        Generated by Regreports PIMS · ${new Date().toLocaleString()} ·
        Negative amounts indicate a credit. Based on samples reviewed for the reporting period.
      </div>
    </div>
    <script>window.onload = () => { window.print(); window.close(); }<\/script>
    </body></html>`);
    win.document.close();
  };

  // ── Print invoice ────────────────────────────────────────────────────────────
  const printInvoice = (result: any, companyName: string) => {
    const period   = `${MONTHS[result.month - 1]} ${result.year}`;
    const hasDetail = result.avg_flow_mg != null;
    const fmt  = (v: any, d = 2) => (v != null ? Number(v).toFixed(d) : "—");
    const fmtD = (v: any) => (v != null ? (Number(v) < 0 ? `-$${Math.abs(Number(v)).toFixed(2)}` : `$${Number(v).toFixed(2)}`) : "—");

    const row = (param: string, threshold: any, avgConc: any, excessConc: any, lbs: any, rate: number, charge: any) => {
      const isCredit = Number(charge) < 0;
      const detail = hasDetail ? `
        <td style="text-align:right">${fmt(threshold)}</td>
        <td style="text-align:right">${avgConc != null ? fmt(avgConc) : "—"}</td>
        <td style="text-align:right;color:${Number(excessConc)>0?"#c53030":Number(excessConc)<0?"#276749":"inherit"}">${fmt(excessConc)}</td>
        <td style="text-align:right">${lbs != null ? Number(lbs).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—"}</td>
        <td style="text-align:right">$${rate.toFixed(2)}</td>` : "";
      return `<tr>
        <td>${param}</td>${detail}
        <td style="text-align:right;font-weight:700;color:${isCredit?"#276749":Number(charge)>0?"#c53030":"inherit"}">${fmtD(charge)}</td>
      </tr>`;
    };

    const colCount = hasDetail ? 7 : 2;
    const html = `<!DOCTYPE html><html><head>
      <title>Surcharge Invoice — ${companyName} — ${period}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 40px; color: #1a202c; }
        .header  { border-bottom: 3px solid #1a365d; padding-bottom: 12px; margin-bottom: 20px; }
        .title   { font-size: 22px; font-weight: 700; color: #1a365d; }
        .subtitle{ font-size: 13px; color: #4a5568; margin-top: 4px; }
        .meta    { display: flex; gap: 40px; margin: 16px 0 24px; flex-wrap: wrap; }
        .meta dt { font-size: 10px; color: #718096; text-transform: uppercase; letter-spacing:.5px; }
        .meta dd { font-size: 13px; font-weight: 600; margin: 2px 0 0; }
        table    { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th       { background: #1a365d; color: #fff; padding: 8px 12px; text-align: left; font-size: 11px; }
        td       { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
        .total   { background: #f7fafc; font-weight: 700; font-size: 14px; }
        .footer  { margin-top: 32px; font-size: 11px; color: #718096; border-top: 1px solid #e2e8f0; padding-top: 12px; }
        @media print { button { display:none; } }
      </style>
    </head><body>
      <div class="header">
        <div class="title">Surcharge Invoice</div>
        <div class="subtitle">Regreports PIMS — Pretreatment Program Billing</div>
      </div>
      <dl class="meta">
        <div><dt>Invoice No.</dt><dd>${result.invoice_id ?? "—"}</dd></div>
        <div><dt>Industrial User</dt><dd>${companyName}</dd></div>
        <div><dt>Reporting Period</dt><dd>${period}</dd></div>
        ${hasDetail ? `<div><dt>Total Flow (MG)</dt><dd>${fmt(result.total_flow_mg, 4)}</dd></div><div><dt>Avg Daily (MG)</dt><dd>${fmt(result.avg_daily_mg, 4)}</dd></div>` : ""}
        <div><dt>Days in Period</dt><dd>${result.days_in_month ?? "—"}</dd></div>
      </dl>
      <table>
        <thead><tr>
          <th>Parameter</th>
          ${hasDetail ? `<th style="text-align:right">Threshold (mg/L)</th><th style="text-align:right">Avg Conc (mg/L)</th><th style="text-align:right">Excess (mg/L)</th><th style="text-align:right">Monthly Loading (lbs)</th><th style="text-align:right">Rate ($/1,000 lbs)</th>` : ""}
          <th style="text-align:right">Charge</th>
        </tr></thead>
        <tbody>
          ${row("BOD",   result.bod_threshold,   result.bod_avg_conc,   result.bod_excess_conc,   result.bod_lbs,   rates?.bod_rate   ?? 0, result.bod_charge)}
          ${row("TSS",   result.tss_threshold,   result.tss_avg_conc,   result.tss_excess_conc,   result.tss_lbs,   rates?.tss_rate   ?? 0, result.tss_charge)}
          ${row("Color", result.color_threshold, result.color_avg_conc, result.color_excess_conc, result.color_lbs, rates?.color_rate ?? 0, result.color_charge)}
        </tbody>
        <tfoot>
          <tr class="total">
            <td colspan="${colCount - 1}">Total Amount Due</td>
            <td style="text-align:right">${fmtD(result.total_charge)}</td>
          </tr>
        </tfoot>
      </table>
      <div class="footer">Generated by Regreports PIMS · ${new Date().toLocaleDateString()} · Negative amounts indicate a credit. Based on samples reviewed for the reporting period.</div>
      <script>window.onload=()=>{ window.print(); window.close(); }</script>
    </body></html>`;

    const win = window.open("", "_blank");
    if (!win) { alert("Popup blocked — please allow popups for this site and try again."); return; }
    win.document.write(html);
    win.document.close();
  };

  const companyName = (id: number) =>
    companies.find(c => c.id === id)?.name ?? `Company #${id}`;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.stickyTop}>
        <header style={s.header}>
          <span style={s.brand}>Regreports PIMS</span>
          <span style={s.role}>Finance</span>
          {tab === "meter-readings" && mrReadings.length > 0 && (
            <button style={{...s.logoutBtn, background:"#2b6cb0", borderColor:"#90cdf4", marginLeft:0}}
              onClick={() => {
                const filtered = mrReadings.filter((r: any) => {
                  if (mrFilterMonth && !r.reading_date?.startsWith(`${mrFilterYear || r.reading_date?.slice(0,4)}-${mrFilterMonth}`)) return false;
                  if (mrFilterYear  && !r.reading_date?.startsWith(mrFilterYear)) return false;
                  return true;
                });
                printMrHistory(filtered);
              }}>
              🖨 Print Report
            </button>
          )}
          {tab === "history" && history.length > 0 && (
            <button style={{...s.logoutBtn, background:"#744210", borderColor:"#f6ad55", marginLeft:0}}
              onClick={() => {
                const filtered = history.filter((rec: any) => {
                  if (histFilterMonth && String(rec.month) !== histFilterMonth) return false;
                  if (histFilterYear  && String(rec.year)  !== histFilterYear)  return false;
                  return true;
                });
                printSurchargeReport(filtered);
              }}>
              🖨 Print Surcharge Report
            </button>
          )}
          <button style={s.logoutBtn} onClick={handleLogout}>Sign Out</button>
        </header>
        <div style={s.tabs}>
          {(["calculate","history","meter-readings"] as const).map(t => (
            <button key={t} style={{...s.tab, ...(tab === t ? s.activeTab : {})}}
              onClick={() => setTab(t)}>
              {t === "calculate" ? "Calculate Surcharge" : t === "history" ? "Invoice History" : "Meter Readings"}
            </button>
          ))}
        </div>
      </div>

      <div style={s.content}>

        {initLoading && (
          <div style={{ textAlign:"center", padding:48, color:"#718096" }}>
            <div style={{ fontSize:28, marginBottom:8 }}>⏳</div>
            Loading data…
          </div>
        )}

        {/* ── Calculate tab ───────────────────────────────────────────────── */}
        {!initLoading && tab === "calculate" && (
          <div style={s.twoCol}>

            {/* Left: form */}
            <div style={{minWidth:300, maxWidth:360}}>
              <h2 style={s.sectionTitle}>Run Surcharge Calculation</h2>

              {/* Rates info card */}
              {rates && (
                <div style={s.ratesCard}>
                  <div style={s.ratesTitle}>Current Rates</div>
                  <div style={s.ratesRow}>
                    <span>BOD</span>
                    <strong>${rates.bod_rate.toFixed(2)} / 1,000 lbs</strong>
                  </div>
                  <div style={s.ratesRow}>
                    <span>TSS</span>
                    <strong>${rates.tss_rate.toFixed(2)} / 1,000 lbs</strong>
                  </div>
                  <div style={s.ratesRow}>
                    <span>Color</span>
                    <strong>${rates.color_rate.toFixed(2)} / 1,000 lbs</strong>
                  </div>
                </div>
              )}

              {/* Form */}
              <div style={s.formCard}>
                <label style={s.label}>Industrial User
                  <select style={s.input} value={calcCompany} onChange={e => { setCalcCompany(e.target.value); setCalcResult(null); setCalcError(""); }}>
                    <option value="">— Select company —</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>

                <div style={{display:"flex", gap:12}}>
                  <label style={{...s.label, flex:1}}>Month
                    <select style={s.input} value={calcMonth} onChange={e => { setCalcMonth(e.target.value); setCalcResult(null); }}>
                      {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                    </select>
                  </label>
                  <label style={{...s.label, flex:1}}>Year
                    <select style={s.input} value={calcYear} onChange={e => { setCalcYear(e.target.value); setCalcResult(null); }}>
                      {yearRange.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </label>
                </div>

                {calcError && <div style={s.errMsg}>{calcError}</div>}

                <button style={s.btn} onClick={runCalculation} disabled={calcRunning}>
                  {calcRunning ? "Calculating…" : "Calculate"}
                </button>
              </div>
            </div>

            {/* Right: result */}
            <div style={{flex:1}}>
              {calcResult && (() => {
                const hasData = (calcResult.total_flow_mg ?? 0) > 0;
                const name    = companyName(calcResult.company_id);
                const period  = `${MONTHS[calcResult.month - 1]} ${calcResult.year}`;
                const fmtC = (v: number) => v < 0 ? `-$${Math.abs(v).toFixed(2)}` : `$${v.toFixed(2)}`;
                const rows = [
                  { label:"BOD",   threshold:calcResult.bod_threshold,   avgConc:calcResult.bod_avg_conc,   excessConc:calcResult.bod_excess_conc,   lbs:calcResult.bod_lbs,   charge:calcResult.bod_charge,   rate: rates?.bod_rate   ?? 0 },
                  { label:"TSS",   threshold:calcResult.tss_threshold,   avgConc:calcResult.tss_avg_conc,   excessConc:calcResult.tss_excess_conc,   lbs:calcResult.tss_lbs,   charge:calcResult.tss_charge,   rate: rates?.tss_rate   ?? 0 },
                  { label:"Color", threshold:calcResult.color_threshold, avgConc:calcResult.color_avg_conc, excessConc:calcResult.color_excess_conc, lbs:calcResult.color_lbs, charge:calcResult.color_charge, rate: rates?.color_rate ?? 0 },
                ];
                return (
                  <div style={s.resultCard}>
                    <div style={s.resultHeader}>
                      <div>
                        <div style={s.resultTitle}>{name}</div>
                        <div style={s.resultSub}>{period} · Invoice {calcResult.invoice_id}</div>
                      </div>
                      <button style={s.printBtn} onClick={() => printInvoice(calcResult, name)}>
                        Print Invoice
                      </button>
                    </div>

                    {!hasData ? (
                      <div style={{
                        ...s.noData,
                        background: calcResult.flow_report_status === "pending" ? "#fffbeb" : undefined,
                        borderColor: calcResult.flow_report_status === "pending" ? "#f6e05e" : undefined,
                        color: calcResult.flow_report_status === "pending" ? "#744210" : undefined,
                      }}>
                        {calcResult.flow_report_status === "pending"
                          ? "A monthly flow report has been submitted for this period but has not yet been approved by a coordinator. Surcharge calculation requires an approved flow report."
                          : calcResult.flow_report_status === "reviewed"
                            ? "Flow report is approved but no sample data was found for this period — surcharge is $0.00."
                            : "No monthly flow report found for this period — surcharge is $0.00."}
                      </div>
                    ) : (
                      <>
                        <div style={s.flowRow}>
                          <div style={s.flowStat}>
                            <span style={s.flowLabel}>Total Flow (MG)</span>
                            <strong style={s.flowValue}>{calcResult.total_flow_mg.toFixed(4)}</strong>
                          </div>
                          <div style={s.flowStat}>
                            <span style={s.flowLabel}>Avg Daily (MG)</span>
                            <strong style={s.flowValue}>{calcResult.avg_daily_mg.toFixed(4)}</strong>
                          </div>
                          <div style={s.flowStat}>
                            <span style={s.flowLabel}>Days in Period</span>
                            <strong style={s.flowValue}>{calcResult.days_in_month}</strong>
                          </div>
                        </div>

                        <table style={s.table}>
                          <thead><tr>
                            <th style={s.th}>Parameter</th>
                            <th style={{...s.th, textAlign:"right"}}>Threshold (mg/L)</th>
                            <th style={{...s.th, textAlign:"right"}}>Avg Conc (mg/L)</th>
                            <th style={{...s.th, textAlign:"right"}}>Excess (mg/L)</th>
                            <th style={{...s.th, textAlign:"right"}}>Monthly Loading (lbs)</th>
                            <th style={{...s.th, textAlign:"right"}}>Rate</th>
                            <th style={{...s.th, textAlign:"right"}}>Charge</th>
                          </tr></thead>
                          <tbody>
                            {rows.map(r => {
                              const noData = r.avgConc == null;
                              return (
                                <tr key={r.label} style={noData ? {color:"#a0aec0"} : r.excessConc > 0 ? {background:"#fff5f5"} : r.excessConc < 0 ? {background:"#f0fff4"} : undefined}>
                                  <td style={s.td}><strong>{r.label}</strong></td>
                                  <td style={{...s.td, textAlign:"right"}}>{r.threshold.toFixed(0)}</td>
                                  <td style={{...s.td, textAlign:"right"}}>{noData ? "—" : r.avgConc!.toFixed(2)}</td>
                                  <td style={{...s.td, textAlign:"right",
                                    color: r.excessConc > 0 ? "#c53030" : r.excessConc < 0 ? "#276749" : "inherit",
                                    fontWeight: r.excessConc !== 0 ? 700 : 400}}>
                                    {noData ? "—" : r.excessConc.toFixed(2)}
                                  </td>
                                  <td style={{...s.td, textAlign:"right",
                                    color: r.lbs > 0 ? "#c53030" : r.lbs < 0 ? "#276749" : "inherit"}}>
                                    {noData ? "—" : r.lbs.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
                                  </td>
                                  <td style={{...s.td, textAlign:"right", color:"#4a5568"}}>${r.rate.toFixed(2)}/klb</td>
                                  <td style={{...s.td, textAlign:"right", fontWeight:700,
                                    color: r.charge > 0 ? "#c53030" : r.charge < 0 ? "#276749" : "inherit"}}>
                                    {noData ? "—" : fmtC(r.charge)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{background:"#ebf4ff"}}>
                              <td style={{...s.td, fontWeight:700}} colSpan={6}>Total Surcharge Due</td>
                              <td style={{...s.td, textAlign:"right", fontWeight:700, fontSize:16,
                                color: calcResult.total_charge > 0 ? "#c53030" : calcResult.total_charge < 0 ? "#276749" : "inherit"}}>
                                {fmtC(calcResult.total_charge)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>

                        {calcResult.total_charge < 0 && (
                          <div style={{...s.noData, marginTop:12}}>
                            Average concentrations are below thresholds — this period results in a credit.
                          </div>
                        )}
                        {calcResult.total_charge === 0 && (
                          <div style={{...s.noData, marginTop:12}}>
                            Concentrations are at or within thresholds — no surcharge this period.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}

              {!calcResult && !calcRunning && (
                <div style={s.placeholder}>
                  <div style={s.placeholderIcon}>💲</div>
                  <div>Select a company and reporting period, then click <strong>Calculate</strong> to generate the surcharge bill.</div>
                </div>
              )}

              {calcRunning && (
                <div style={s.placeholder}>
                  <div style={s.placeholderIcon}>⏳</div>
                  <div>Running calculation…</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Meter Readings tab ──────────────────────────────────────────────── */}
        {!initLoading && tab === "meter-readings" && (
          <div style={s.twoCol}>

            {/* Left: manual entry form */}
            <div style={{minWidth:300, maxWidth:360}}>
              <h2 style={s.sectionTitle}>Add Monthly Meter Reading</h2>
              <p style={{fontSize:12, color:"#718096", marginTop:-8, marginBottom:12}}>
                Enter the meter reading at the start and end of the billing month.
                Sample-event readings are recorded automatically when samples are submitted.
              </p>
              <div style={s.formCard}>
                <label style={s.label}>Industrial User
                  <select style={s.input} value={mrCompany} onChange={e => {
                    setMrCompany(e.target.value);
                    setMrStart(""); setMrEnd(""); setMrError(""); setMrSuccess("");
                  }}>
                    <option value="">— Select company —</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>

                {mrCompany && !mrActiveMeter && (
                  <div style={s.errMsg}>No active flow meter found for this company.</div>
                )}
                {mrActiveMeter && (
                  <div style={{...s.ratesCard, marginBottom:12}}>
                    <div style={s.ratesTitle}>Active Meter</div>
                    <div style={{...s.ratesRow, flexDirection:"column", gap:4}}>
                      <span style={{fontWeight:700}}>{mrActiveMeter.meter_id}</span>
                      {mrActiveMeter.description && <span style={{color:"#718096",fontSize:12}}>{mrActiveMeter.description}</span>}
                      <span style={{color:"#718096",fontSize:12}}>Pulse factor: {mrActiveMeter.pulse_factor}</span>
                      <label style={{fontSize:12, fontWeight:600, color:"#2d3748", marginTop:4}}>
                        Volume unit:&nbsp;
                        <select style={{...s.input, width:"auto", display:"inline", padding:"3px 8px", fontSize:12}}
                          value={mrActiveMeter.unit || "gallons"}
                          onChange={async e => {
                            const newUnit = e.target.value;
                            try {
                              await api.put(`/admin/meters/${mrActiveMeter.id}`, { ...mrActiveMeter, unit: newUnit });
                              setMrActiveMeter({ ...mrActiveMeter, unit: newUnit });
                            } catch { alert("Failed to update meter unit."); }
                          }}>
                          <option value="gallons">Gallons (→ MG)</option>
                          <option value="cubic_feet">Cubic Feet (CF)</option>
                        </select>
                      </label>
                    </div>
                  </div>
                )}

                <label style={s.label}>Reading Date
                  <input type="date" style={s.input} value={mrDate}
                    onChange={e => { setMrDate(e.target.value); setMrError(""); setMrSuccess(""); }} />
                </label>

                <div style={{display:"flex", gap:12}}>
                  <label style={{...s.label, flex:1}}>Start Reading
                    <input type="number" style={s.input} value={mrStart} placeholder="0"
                      onChange={e => { setMrStart(e.target.value); setMrError(""); setMrSuccess(""); }} />
                  </label>
                  <label style={{...s.label, flex:1}}>End Reading
                    <input type="number" style={s.input} value={mrEnd} placeholder="0"
                      onChange={e => { setMrEnd(e.target.value); setMrError(""); setMrSuccess(""); }} />
                  </label>
                </div>

                {mrStart && mrEnd && parseFloat(mrEnd) > parseFloat(mrStart) && mrActiveMeter && (() => {
                  const isCF    = (mrActiveMeter.unit || "gallons") === "cubic_feet";
                  const gallons = (parseFloat(mrEnd) - parseFloat(mrStart)) * (mrActiveMeter.pulse_factor || 1);
                  const volMG   = gallons / 1_000_000;
                  const volCF   = gallons / 7.48052;
                  return (
                    <div style={{...s.ratesCard, marginBottom:12, background:"#ebf8ff", borderColor:"#90cdf4"}}>
                      <div style={s.ratesTitle}>Calculated Volume</div>
                      <div style={{fontSize:20, fontWeight:700, color:"#2b6cb0"}}>
                        {isCF ? `${volCF.toLocaleString("en-US", {maximumFractionDigits:2})} CF` : `${volMG.toFixed(4)} MG`}
                      </div>
                      {isCF && <div style={{fontSize:12, color:"#4a5568", marginTop:2}}>{volMG.toFixed(4)} MG (for surcharge)</div>}
                    </div>
                  );
                })()}

                <label style={s.label}>Reporting Period (days, optional)
                  <input type="number" min="1" style={s.input} value={mrDays}
                    placeholder="e.g. 31"
                    onChange={e => setMrDays(e.target.value)} />
                </label>

                {mrError   && <div style={s.errMsg}>{mrError}</div>}
                {mrSuccess && <div style={{...s.noData, marginBottom:8}}>{mrSuccess}</div>}

                <button style={s.btn} onClick={submitMrReading} disabled={mrSaving || !mrActiveMeter}>
                  {mrSaving ? "Saving…" : "Save Reading"}
                </button>
              </div>
            </div>

            {/* Right: readings table */}
            <div style={{flex:1}}>
              <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:14, flexWrap:"wrap"}}>
                <h2 style={{...s.sectionTitle, marginBottom:0}}>Reading History</h2>
                <select style={{...s.input, width:"auto", minWidth:180, marginBottom:0}}
                  value={mrCompany} onChange={e => { setMrCompany(e.target.value); setMrError(""); setMrSuccess(""); }}>
                  <option value="">All Companies</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select style={{...s.input, width:"auto", minWidth:120, marginBottom:0}}
                  value={mrFilterMonth} onChange={e => setMrFilterMonth(e.target.value)}>
                  <option value="">All Months</option>
                  {["January","February","March","April","May","June","July","August","September","October","November","December"]
                    .map((m, i) => <option key={i+1} value={String(i+1).padStart(2,"0")}>{m}</option>)}
                </select>
                <select style={{...s.input, width:"auto", minWidth:100, marginBottom:0}}
                  value={mrFilterYear} onChange={e => setMrFilterYear(e.target.value)}>
                  <option value="">All Years</option>
                  {Array.from({length:5}, (_,i) => new Date().getFullYear() - i)
                    .map(y => <option key={y} value={String(y)}>{y}</option>)}
                </select>
                {(mrFilterMonth || mrFilterYear) && (
                  <button style={{fontSize:11, color:"#553c9a", background:"none", border:"none",
                                  cursor:"pointer", textDecoration:"underline", padding:0}}
                    onClick={() => { setMrFilterMonth(""); setMrFilterYear(""); }}>
                    Clear
                  </button>
                )}
                <button style={s.outlineBtn} onClick={loadMrReadings} disabled={mrLoading}>
                  {mrLoading ? "Loading…" : "Refresh"}
                </button>
                <button style={s.printBtn} onClick={() => {
                  const filtered = mrReadings.filter((r: any) => {
                    if (mrFilterMonth && !r.reading_date?.startsWith(`${mrFilterYear || r.reading_date?.slice(0,4)}-${mrFilterMonth}`)) return false;
                    if (mrFilterYear  && !r.reading_date?.startsWith(mrFilterYear)) return false;
                    return true;
                  });
                  printMrHistory(filtered);
                }}>
                  Print
                </button>
              </div>

              {(() => {
                const filtered = mrReadings.filter((r: any) => {
                  if (mrFilterMonth && !r.reading_date?.startsWith(`${mrFilterYear || r.reading_date?.slice(0,4)}-${mrFilterMonth}`)) return false;
                  if (mrFilterYear  && !r.reading_date?.startsWith(mrFilterYear)) return false;
                  return true;
                });
                return filtered.length === 0 ? (
                <p style={s.meta}>{mrLoading ? "Loading…" : mrReadings.length === 0 ? "No meter readings found." : "No readings match the selected filters."}</p>
              ) : (
                <div style={{overflowX:"auto"}}>
                  <table style={s.table}>
                    <thead><tr>
                      <th style={s.th}>Date</th>
                      <th style={s.th}>Company</th>
                      <th style={s.th}>Meter</th>
                      <th style={s.th}>Meter Type</th>
                      <th style={s.th}>Purpose</th>
                      <th style={{...s.th, textAlign:"right"}}>Start</th>
                      <th style={{...s.th, textAlign:"right"}}>End</th>
                      <th style={{...s.th, textAlign:"right"}}>Volume</th>
                      <th style={s.th}>Unit</th>
                      <th style={{...s.th, textAlign:"right"}}>Days</th>
                    </tr></thead>
                    <tbody>
                      {filtered.map((r: any) => {
                        const isCF = r.unit === "cubic_feet";
                        const vol  = r.volume_native ?? r.volume_mg;
                        const isSampleEvent = r.reading_purpose === "sample_event";
                        return (
                        <tr key={r.id} style={isSampleEvent ? {background:"#faf5ff"} : {}}>
                          <td style={s.td}>{r.reading_date}</td>
                          <td style={s.td}>{companyName(r.company_id)}</td>
                          <td style={{...s.td, fontFamily:"monospace", fontSize:12}}>{r.meter_label}</td>
                          <td style={{...s.td, fontSize:11, fontWeight:600, textTransform:"uppercase",
                            color: r.meter_type === "sanitary" ? "#744210" : "#276749"}}>
                            {r.meter_type === "sanitary" ? "Sanitary" : "Process"}
                          </td>
                          <td style={s.td}>
                            <span style={{fontSize:11, fontWeight:600, padding:"2px 7px", borderRadius:10,
                                background: isSampleEvent ? "#e9d8fd" : "#bee3f8",
                                color:      isSampleEvent ? "#553c9a"  : "#2b6cb0"}}>
                              {isSampleEvent ? "Sample Event" : "Monthly"}
                            </span>
                          </td>
                          <td style={{...s.td, textAlign:"right"}}>{Number(r.reading_start).toLocaleString()}</td>
                          <td style={{...s.td, textAlign:"right"}}>{Number(r.reading_end).toLocaleString()}</td>
                          <td style={{...s.td, textAlign:"right", fontWeight:700, color:"#2b6cb0"}}>
                            {isCF ? Number(vol).toFixed(2) : Number(vol).toFixed(4)}
                          </td>
                          <td style={{...s.td, color:"#4a5568"}}>{isCF ? "CF" : "MG"}</td>
                          <td style={{...s.td, textAlign:"right"}}>{r.sampling_period_days ?? "—"}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
              })()}
            </div>
          </div>
        )}

        {/* ── History tab ─────────────────────────────────────────────────────── */}
        {!initLoading && tab === "history" && (
          <div>
            <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:20, flexWrap:"wrap"}}>
              <h2 style={{...s.sectionTitle, marginBottom:0}}>Invoice History</h2>
              <select style={{...s.input, width:"auto", minWidth:180, marginBottom:0}}
                value={histCompany} onChange={e => setHistCompany(e.target.value)}>
                <option value="">All Companies</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select style={{...s.input, width:"auto", minWidth:120, marginBottom:0}}
                value={histFilterMonth} onChange={e => setHistFilterMonth(e.target.value)}>
                <option value="">All Months</option>
                {["January","February","March","April","May","June","July","August","September","October","November","December"]
                  .map((m, i) => <option key={i+1} value={String(i+1)}>{m}</option>)}
              </select>
              <select style={{...s.input, width:"auto", minWidth:100, marginBottom:0}}
                value={histFilterYear} onChange={e => setHistFilterYear(e.target.value)}>
                <option value="">All Years</option>
                {Array.from({length:5}, (_,i) => new Date().getFullYear() - i)
                  .map(y => <option key={y} value={String(y)}>{y}</option>)}
              </select>
              {(histFilterMonth || histFilterYear) && (
                <button style={{fontSize:11, color:"#553c9a", background:"none", border:"none",
                                cursor:"pointer", textDecoration:"underline", padding:0}}
                  onClick={() => { setHistFilterMonth(""); setHistFilterYear(""); }}>
                  Clear
                </button>
              )}
              <button style={s.outlineBtn} onClick={loadHistory} disabled={histLoading}>
                {histLoading ? "Loading…" : "Refresh"}
              </button>
              <button style={s.printBtn} onClick={() => {
                const filtered = history.filter((rec: any) => {
                  if (histFilterMonth && String(rec.month) !== histFilterMonth) return false;
                  if (histFilterYear  && String(rec.year)  !== histFilterYear)  return false;
                  return true;
                });
                printSurchargeReport(filtered);
              }}>
                Print Report
              </button>
            </div>

            {(() => {
              const filtered = history.filter((rec: any) => {
                if (histFilterMonth && String(rec.month) !== histFilterMonth) return false;
                if (histFilterYear  && String(rec.year)  !== histFilterYear)  return false;
                return true;
              });
              return filtered.length === 0 ? (
              <p style={s.meta}>{histLoading ? "Loading…" : history.length === 0 ? "No surcharge records found." : "No records match the selected filters."}</p>
            ) : (
              <div style={{overflowX:"auto"}}>
                <table style={s.table}>
                  <thead><tr>
                    <th style={s.th}>Invoice</th>
                    <th style={s.th}>Company</th>
                    <th style={s.th}>Period</th>
                    <th style={{...s.th, textAlign:"right"}}>BOD</th>
                    <th style={{...s.th, textAlign:"right"}}>TSS</th>
                    <th style={{...s.th, textAlign:"right"}}>Color</th>
                    <th style={{...s.th, textAlign:"right"}}>Total</th>
                    <th style={s.th}></th>
                  </tr></thead>
                  <tbody>
                    {filtered.map((rec: any) => (
                      <tr key={rec.id} style={rec.total_charge > 0 ? {background:"#fffaf0"} : undefined}>
                        <td style={{...s.td, fontFamily:"monospace", fontSize:12}}>{rec.invoice_id}</td>
                        <td style={s.td}>{companyName(rec.company_id)}</td>
                        <td style={s.td}>{MONTHS[rec.month - 1]} {rec.year}</td>
                        <td style={{...s.td, textAlign:"right"}}>${rec.bod_charge.toFixed(2)}</td>
                        <td style={{...s.td, textAlign:"right"}}>${rec.tss_charge.toFixed(2)}</td>
                        <td style={{...s.td, textAlign:"right"}}>${rec.color_charge.toFixed(2)}</td>
                        <td style={{...s.td, textAlign:"right", fontWeight:700,
                          color: rec.total_charge > 0 ? "#c53030" : "#276749"}}>
                          ${rec.total_charge.toFixed(2)}
                        </td>
                        <td style={s.td}>
                          <button style={s.smallPrintBtn}
                            onClick={() => printInvoice(rec, companyName(rec.company_id))}>
                            Print
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{background:"#ebf4ff"}}>
                      <td style={{...s.td, fontWeight:700}} colSpan={6}>
                        Total ({filtered.length} invoice{filtered.length !== 1 ? "s" : ""})
                      </td>
                      <td style={{...s.td, textAlign:"right", fontWeight:700, fontSize:15}}>
                        ${filtered.reduce((sum: number, r: any) => sum + (r.total_charge ?? 0), 0).toFixed(2)}
                      </td>
                      <td style={s.td}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page:          { minHeight:"100vh", background:"#f0f4f8" },
  stickyTop:     { position:"sticky", top:0, zIndex:100,
                   boxShadow:"0 2px 8px rgba(0,0,0,0.12)" },
  header:        { background:"#1a365d", color:"#fff", padding:"12px 24px",
                   display:"flex", alignItems:"center", gap:16 },
  brand:         { fontSize:20, fontWeight:700, flex:1 },
  role:          { fontSize:13, background:"#744210", padding:"3px 10px", borderRadius:12 },
  logoutBtn:     { marginLeft:"auto", background:"transparent", color:"#fff",
                   border:"1px solid #fff", borderRadius:5, padding:"4px 12px", cursor:"pointer" },
  tabs:          { display:"flex", gap:4, padding:"16px 24px 0", background:"#fff",
                   borderBottom:"2px solid #e2e8f0" },
  tab:           { padding:"8px 20px", border:"none", background:"transparent",
                   cursor:"pointer", fontSize:14, color:"#4a5568", borderRadius:"5px 5px 0 0" },
  activeTab:     { background:"#fefcbf", color:"#744210", fontWeight:700,
                   borderBottom:"2px solid #d69e2e" },
  content:       { padding:24 },
  twoCol:        { display:"flex", gap:24 },
  sectionTitle:  { fontSize:18, fontWeight:700, color:"#1a365d", marginBottom:14 },
  label:         { display:"flex", flexDirection:"column", gap:4, fontSize:13,
                   fontWeight:600, color:"#2d3748", marginBottom:12 },
  input:         { padding:"7px 10px", borderRadius:6, border:"1px solid #cbd5e0",
                   fontSize:13, background:"#fff", width:"100%" },
  btn:           { padding:"9px 20px", background:"#744210", color:"#fff", border:"none",
                   borderRadius:6, fontSize:14, fontWeight:600, cursor:"pointer", width:"100%",
                   marginTop:4 },
  outlineBtn:    { padding:"7px 16px", background:"transparent", color:"#744210",
                   border:"1px solid #744210", borderRadius:6, fontSize:13,
                   fontWeight:600, cursor:"pointer" },
  errMsg:        { background:"#fff5f5", color:"#c53030", border:"1px solid #fed7d7",
                   borderRadius:6, padding:"8px 12px", fontSize:13, marginBottom:8 },
  ratesCard:     { background:"#fffff0", border:"1px solid #f6e05e", borderRadius:8,
                   padding:"12px 16px", marginBottom:16 },
  ratesTitle:    { fontSize:11, fontWeight:700, color:"#744210", textTransform:"uppercase",
                   letterSpacing:"0.5px", marginBottom:8 },
  ratesRow:      { display:"flex", justifyContent:"space-between", fontSize:13,
                   color:"#2d3748", marginBottom:4 },
  formCard:      { background:"#fff", borderRadius:10, padding:"20px",
                   boxShadow:"0 1px 4px rgba(0,0,0,0.08)" },
  resultCard:    { background:"#fff", borderRadius:10, padding:"24px",
                   boxShadow:"0 1px 4px rgba(0,0,0,0.08)" },
  resultHeader:  { display:"flex", justifyContent:"space-between", alignItems:"flex-start",
                   marginBottom:20 },
  resultTitle:   { fontSize:18, fontWeight:700, color:"#1a365d" },
  resultSub:     { fontSize:13, color:"#718096", marginTop:2 },
  flowRow:       { display:"flex", gap:24, background:"#f7fafc", borderRadius:8,
                   padding:"12px 16px", marginBottom:20 },
  flowStat:      { display:"flex", flexDirection:"column", gap:2 },
  flowLabel:     { fontSize:11, color:"#718096", textTransform:"uppercase", letterSpacing:"0.5px" },
  flowValue:     { fontSize:16, color:"#2d3748" },
  table:         { width:"100%", borderCollapse:"collapse" },
  th:            { background:"#1a365d", color:"#fff", padding:"8px 12px",
                   textAlign:"left", fontSize:12, whiteSpace:"nowrap" },
  td:            { padding:"9px 12px", borderBottom:"1px solid #e2e8f0", fontSize:13 },
  noData:        { background:"#f0fff4", color:"#276749", border:"1px solid #9ae6b4",
                   borderRadius:6, padding:"12px 16px", fontSize:13 },
  placeholder:   { display:"flex", flexDirection:"column", alignItems:"center",
                   justifyContent:"center", minHeight:240, color:"#718096",
                   fontSize:14, gap:12, textAlign:"center" },
  placeholderIcon: { fontSize:40 },
  printBtn:      { padding:"8px 18px", background:"#1a365d", color:"#fff", border:"none",
                   borderRadius:6, fontSize:13, fontWeight:600, cursor:"pointer" },
  smallPrintBtn: { padding:"4px 12px", background:"#1a365d", color:"#fff", border:"none",
                   borderRadius:5, fontSize:12, cursor:"pointer" },
  meta:          { color:"#718096", fontSize:13 },
};
