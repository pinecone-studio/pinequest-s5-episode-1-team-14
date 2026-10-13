import type { DataSource } from "@/lib/data-source";

const ICONS = {
  grid: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  book: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  chart: "M18 20V10M12 20V4M6 20v-6",
  play: "M5 3l14 9-14 9V3z",
  sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
  chevron: "M6 9l6 6 6-6",
  menu: "M3 12h18M3 6h18M3 18h18",
  arrow: "M5 12h14M12 5l7 7-7 7",
  plus: "M12 5v14M5 12h14",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3",
  check: "M20 6L9 17l-5-5",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  trend: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  up: "M12 19V5M5 12l7-7 7 7",
  down: "M12 5v14M19 12l-7 7-7-7",
  tag: "M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

const SOURCES: Record<DataSource, { tone: string; label: string }> = {
  live: { tone: "badge-green", label: "Шууд холбогдсон" },
  demo: { tone: "badge-amber", label: "Жишээ өгөгдөл" },
  offline: { tone: "badge-gray", label: "Холбогдоогүй" },
};

export function SourceBadge({ source }: { source: DataSource }) {
  return <span className={`badge ${SOURCES[source].tone}`}>{SOURCES[source].label}</span>;
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return <header className="page-header">
    <div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>
    {children && <div className="page-actions">{children}</div>}
  </header>;
}

export function Banner({ children }: { children: React.ReactNode }) {
  return <p className="banner"><Icon name="info" />{children}</p>;
}

export function Empty({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return <div className="empty">
    <div className="empty-icon"><Icon name="inbox" size={18} /></div>
    <h3>{title}</h3><p>{text}</p>{children}
  </div>;
}

// Өмнөх үетэй харьцуулсан өөрчлөлт: сум + тэмдэгтэй тоо (зөвхөн өнгөөр ялгахгүй).
export function Delta({ value, suffix }: { value: number; suffix: string }) {
  if (value === 0) return <span className="delta">{suffix} ижил</span>;
  return <span className={`delta ${value > 0 ? "delta-up" : "delta-down"}`}>
    <Icon name={value > 0 ? "up" : "down"} size={12} />{value > 0 ? "+" : "-"}{Math.abs(value)} {suffix}
  </span>;
}
