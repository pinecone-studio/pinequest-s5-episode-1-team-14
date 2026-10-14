"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./ui";

type Item = { label: string; href: string; icon: IconName; soon?: boolean };

const groups: { label: string; items: Item[] }[] = [
  { label: "Ажлын орчин", items: [
    { label: "Ерөнхий тойм", href: "/dashboard", icon: "grid" },
    { label: "Дуудлагууд", href: "/calls", icon: "phone" },
    { label: "Захиалгууд", href: "/bookings", icon: "calendar" },
  ] },
  { label: "Удирдлага", items: [
    { label: "Мэдээллийн сан", href: "/knowledge", icon: "book" },
    { label: "Тайлан", href: "/analytics", icon: "chart" },
  ] },
  { label: "Тохируулах", items: [
    { label: "Туршилтын дуудлага", href: "/demo", icon: "play" },
    { label: "Тохиргоо", href: "/settings", icon: "sliders" },
  ] },
];

function Brand() {
  return <Link className="brand" href="/dashboard"><Image src="/logo-mark.png" alt="" width={36} height={36} priority /><span>Call<b>AI</b></span></Link>;
}

export default function DashboardShell({ children, account }: { children: React.ReactNode; account: { email: string; business: string; numbers: string[] } | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Хуудас солигдох бүрт гар утасны цэсийг хаана.
  useEffect(() => setOpen(false), [pathname]);
  // Шинэ дуудлага, захиалга гараар refresh хийлгүй гарч ирэхийн тулд серверийн өгөгдлийг 2 секунд тутам шинэчилнэ.
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 2000);
    return () => clearInterval(timer);
  }, [router]);

  return <div className="app">
    <a className="skip-link" href="#main-content">Үндсэн агуулга руу очих</a>

    <aside className={`sidebar${open ? " is-open" : ""}`}>
      <Brand />
      <nav aria-label="Үндсэн цэс">
        {groups.map((group) => <div className="nav-group" key={group.label}>
          <p className="nav-label">{group.label}</p>
          <ul>
            {group.items.map((item) => <li key={item.href}>
              {item.soon
                ? <span className="nav-link is-disabled" aria-disabled="true"><Icon name={item.icon} />{item.label}</span>
                : <Link className="nav-link" href={item.href} aria-current={pathname === item.href ? "page" : undefined}><Icon name={item.icon} />{item.label}</Link>}
            </li>)}
          </ul>
        </div>)}
      </nav>
      <div className="sidebar-footer">
        <a href="https://github.com/pinecone-studio/pinequest-s5-episode-1-team-14#local-setup" target="_blank" rel="noreferrer">Ашиглах заавар <Icon name="external" size={12} /><span className="sr-only"> (шинэ цонхонд нээгдэнэ)</span></a>
        {account && <div className="account"><b>{account.business}</b>{account.numbers.map((number) => <span key={number} className="num">☎ {number}</span>)}<span>{account.email}</span></div>}
        <form method="post" action="/api/logout"><button className="btn btn-ghost btn-sm login-logout" type="submit">Гарах</button></form>
        <span>© 2026 CallAI</span>
      </div>
    </aside>
    {open && <button type="button" className="backdrop" aria-label="Цэсийг хаах" onClick={() => setOpen(false)} />}

    <div className="main">
      <header className="topbar">
        <button type="button" className="btn btn-icon" aria-expanded={open} aria-label="Цэс" onClick={() => setOpen(!open)}><Icon name="menu" /></button>
        <Brand />
      </header>
      <main id="main-content" tabIndex={-1} className="content">{children}</main>
    </div>
  </div>;
}
