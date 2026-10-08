"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { label: "Ерөнхий тойм", href: "/dashboard", enabled: true, path: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" },
  { label: "Дуудлагууд", href: "/calls", enabled: true, path: "M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-7-7l2-2-2-5Z" },
  { label: "Захиалгууд", href: "/bookings", enabled: true, path: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM7 3v4m10-4v4M3 11h18m-13 5h3" },
  { label: "Мэдээллийн сан", href: "/knowledge", enabled: false, path: "M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15" },
  { label: "Тайлан", href: "/analytics", enabled: false, path: "M4 3v17h17M8 15v-4m5 4V7m5 8V4" },
  { label: "Туршилтын дуудлага", href: "/demo", enabled: false, path: "M9 4v16l12-8L9 4ZM3 5v14" },
  { label: "Тохиргоо", href: "/settings", enabled: false, path: "M4 7h16M4 17h16M8 4v6m8 4v6" },
];

function Navigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Үндсэн цэс">
      <p className="nav-caption">АЖЛЫН ОРЧИН</p>
      <ul className="nav-list">
        {sections.map((section) => {
          const content = <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={section.path} /></svg>
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

function Brand() {
  return <div className="brand">
    <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
    <div><strong>frontdesk<span> .</span></strong><small>MONGOLIA</small></div>
  </div>;
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="workspace">
    <a className="skip-link" href="#main-content">Үндсэн агуулга руу очих</a>
    <aside className="sidebar">
      <Brand />
      <div className="workspace-label"><span className="workspace-avatar" aria-hidden="true">Б</span><div><strong>Миний бизнес</strong><small>Удирдлагын самбар</small></div></div>
      <Navigation />
      <div className="sidebar-note"><span className="note-mark" aria-hidden="true">✳</span><p>Харилцагч бүрт<br /><strong>анхаарал хандуулъя.</strong></p><small>Таны монгол хэлтэй AI туслах</small></div>
      <p className="sidebar-footer">AI Front-Desk Mongolia <span>MN</span></p>
    </aside>
    <div className="workspace-body">
      <header className="topbar">
        <details className="mobile-menu">
          <summary><span aria-hidden="true">☰</span> Цэс</summary>
          <div className="mobile-navigation"><Brand /><Navigation /></div>
        </details>
        <p className="breadcrumb">Ажлын орчин <span aria-hidden="true">/</span> <strong>{sections.find((section) => section.href === pathname)?.label ?? "Удирдлагын самбар"}</strong></p>
        <a className="guide-link" href="https://github.com/pinecone-studio/pinequest-s5-episode-1-team-14#local-setup" target="_blank" rel="noreferrer">Ашиглах заавар <span aria-hidden="true">↗</span><span className="sr-only"> (шинэ цонхонд нээгдэнэ)</span></a>
        <span className="profile-mark" aria-label="Бизнесийн ажлын орчин">Б</span>
      </header>
      <main id="main-content" tabIndex={-1} className="dashboard-content">{children}</main>
      <footer className="page-footer"><span>AI Front-Desk Mongolia</span><span>Танай бизнесийн төлөө.</span></footer>
    </div>
  </div>;
}
