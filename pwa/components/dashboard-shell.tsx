"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const sections = [
  { label: "Ерөнхий тойм", href: "/dashboard", enabled: true },
  { label: "Дуудлагууд", href: "/calls", enabled: true },
  { label: "Захиалгууд", href: "/bookings", enabled: true },
  { label: "Мэдээллийн сан", href: "/knowledge", enabled: true },
  { label: "Тайлан", href: "/analytics", enabled: true },
  { label: "Туршилтын дуудлага", href: "/demo", enabled: false },
  { label: "Тохиргоо", href: "/settings", enabled: false },
];

function Navigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Үндсэн цэс">
      <ul className="nav-list">
        {sections.map((section) => {
          const content = <>
            <span>{section.label}</span>
            {!section.enabled && <small>Удахгүй</small>}
          </>;
          return <li key={section.href}>
            {section.enabled ? (
              <Link href={section.href} aria-current={pathname === section.href ? "page" : undefined}
                onClick={(event) => {
                  const menu = event.currentTarget.closest("details");
                  if (menu) { menu.open = false; menu.querySelector("summary")?.focus(); }
                }}>{content}</Link>
            ) : <button type="button" disabled>{content}</button>}
          </li>;
        })}
      </ul>
    </nav>
  );
}

function ThemeToggle() {
  const modes = ["auto", "light", "dark"] as const;
  const [mode, setMode] = useState<typeof modes[number]>("auto");
  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    setMode(saved === "light" || saved === "dark" ? saved : "auto");
  }, []);
  const index = modes.indexOf(mode);
  return <button type="button" className="theme-button" aria-label={`Загвар солих: ${["автомат", "цайвар", "бараан"][index]}`} onClick={() => {
    const next = modes[(index + 1) % modes.length];
    if (next === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* Keep the selected theme for this document. */ }
    setMode(next);
  }}>{["◐", "☀", "☾"][index]}</button>;
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="workspace">
    <a className="skip-link" href="#main-content">Үндсэн агуулга руу очих</a>
    <header className="workspace-header">
      <div className="topbar">
        <a className="brand" href="/" aria-label="AI Front-Desk — нүүр хуудас">AI Front-Desk</a>
        <ThemeToggle />
        <details className="mobile-menu">
          <summary><span aria-hidden="true">☰</span> Цэс</summary>
          <div className="mobile-navigation"><Navigation /></div>
        </details>
      </div>
      <div className="desktop-navigation"><Navigation /></div>
    </header>
    <main id="main-content" tabIndex={-1} className="dashboard-content">
        <p className="breadcrumb">Ажлын орчин <span aria-hidden="true">/</span> <strong>{sections.find((section) => section.href === pathname)?.label ?? "Удирдлагын самбар"}</strong></p>
        {children}
    </main>
    <footer className="page-footer"><span>© 2026 AI Front-Desk Mongolia</span>
      <a className="guide-link" href="https://github.com/pinecone-studio/pinequest-s5-episode-1-team-14#local-setup" target="_blank" rel="noreferrer">Ашиглах заавар <span aria-hidden="true">↗</span><span className="sr-only"> (шинэ цонхонд нээгдэнэ)</span></a>
    </footer>
  </div>;
}
