import React, { useEffect, useRef, useState } from "react";
import { getSamplingSchedule } from "../api/client";

interface Props {
  onGoToSchedule: () => void;
  companyId?: number;
}

export default function NotificationBell({ onGoToSchedule, companyId }: Props) {
  const [items, setItems]   = useState<any[]>([]);
  const [open, setOpen]     = useState(false);
  const ref                 = useRef<HTMLDivElement>(null);

  const load = () =>
    getSamplingSchedule(companyId)
      .then(r => setItems(r.data.filter((x: any) => x.status === "overdue" || x.status === "due_soon")))
      .catch(() => {});

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const overdueItems  = items.filter(x => x.status === "overdue");
  const dueSoonItems  = items.filter(x => x.status === "due_soon");
  const count         = items.length;

  return (
    <div ref={ref} style={s.wrap}>
      <button style={s.bell} onClick={() => setOpen(o => !o)} title="Sample schedule alerts">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {count > 0 && (
          <span style={{...s.badge, background: overdueItems.length > 0 ? "#e53e3e" : "#dd6b20"}}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div style={s.dropdown}>
          <div style={s.dropHead}>
            Schedule Alerts
            <span style={s.dropCount}>{count}</span>
          </div>

          {count === 0 && (
            <p style={s.empty}>All parameters are on schedule.</p>
          )}

          {overdueItems.length > 0 && (
            <>
              <div style={s.groupLabel}>Overdue</div>
              {overdueItems.map((item, i) => (
                <div key={i} style={s.item}>
                  <div style={s.itemTop}>
                    {item.company_name && <span style={s.co}>{item.company_name}</span>}
                    <span style={s.param}>{item.parameter_name}</span>
                  </div>
                  <div style={s.itemSub}>
                    {item.days_overdue != null
                      ? `${item.days_overdue}d overdue`
                      : "Never sampled"
                    }
                    {item.next_due_date && ` · due ${item.next_due_date}`}
                  </div>
                </div>
              ))}
            </>
          )}

          {dueSoonItems.length > 0 && (
            <>
              <div style={{...s.groupLabel, color:"#c05621"}}>Due Soon</div>
              {dueSoonItems.map((item, i) => (
                <div key={i} style={s.item}>
                  <div style={s.itemTop}>
                    {item.company_name && <span style={s.co}>{item.company_name}</span>}
                    <span style={s.param}>{item.parameter_name}</span>
                  </div>
                  <div style={s.itemSub}>
                    {item.next_due_date ? `Due ${item.next_due_date}` : "Due soon"}
                  </div>
                </div>
              ))}
            </>
          )}

          <button style={s.viewBtn} onClick={() => { setOpen(false); onGoToSchedule(); }}>
            View full schedule
          </button>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap:       { position: "relative" },
  bell:       { position: "relative", background: "transparent", border: "none",
                color: "#fff", cursor: "pointer", padding: "4px 6px",
                display: "flex", alignItems: "center", borderRadius: 6 },
  badge:      { position: "absolute", top: -4, right: -4, minWidth: 17, height: 17,
                borderRadius: 9, fontSize: 10, fontWeight: 700, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 3px", lineHeight: 1 },
  dropdown:   { position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 500,
                background: "#fff", borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
                width: 320, maxHeight: 420, overflowY: "auto" as const,
                border: "1px solid #e2e8f0" },
  dropHead:   { display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px 8px", fontWeight: 700, fontSize: 13,
                color: "#1a365d", borderBottom: "1px solid #e2e8f0" },
  dropCount:  { background: "#e2e8f0", borderRadius: 10, fontSize: 11,
                padding: "1px 7px", color: "#4a5568", fontWeight: 600 },
  empty:      { padding: "16px 14px", color: "#718096", fontSize: 13, margin: 0 },
  groupLabel: { padding: "8px 14px 4px", fontSize: 11, fontWeight: 700,
                color: "#c53030", textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  item:       { padding: "7px 14px", borderBottom: "1px solid #f7fafc" },
  itemTop:    { display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" as const },
  co:         { fontSize: 12, fontWeight: 700, color: "#2d3748" },
  param:      { fontSize: 12, color: "#4a5568" },
  itemSub:    { fontSize: 11, color: "#718096", marginTop: 2 },
  viewBtn:    { display: "block", width: "100%", padding: "10px 14px",
                background: "#f7fafc", border: "none", borderTop: "1px solid #e2e8f0",
                cursor: "pointer", fontSize: 13, color: "#553c9a", fontWeight: 600,
                textAlign: "left" as const, borderRadius: "0 0 8px 8px" },
};
