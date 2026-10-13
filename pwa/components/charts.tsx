"use client";

import { useEffect, useState } from "react";

// ---------- Амьд дуудлага ----------

function elapsed(startedAt: string, now: number) {
  const total = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const hours = Math.floor(total / 3600);
  const rest = `${String(Math.floor(total % 3600 / 60)).padStart(hours ? 2 : 1, "0")}:${String(total % 60).padStart(2, "0")}`;
  return hours ? `${hours}:${rest}` : rest;
}

export function LiveCalls({ calls }: { calls: { id: string; callerPhone: string | null; startedAt: string }[] }) {
  // Серверийн цагаар зурвал hydration зөрөх тул цагийг хөтөч дээр л эхлүүлнэ.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!calls.length) return null;
  // Эхэлсэн дарааллаар: шинэ дуудлага доор нэмэгдэж, өмнөх мөрүүд байрнаасаа хөдлөхгүй.
  const rows = [...calls].sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  return <section className="live" aria-labelledby="live-title">
    <h2 className="live-head" id="live-title"><span className="live-pulse" aria-hidden="true" />
      Яг одоо {rows.length > 1 && `${rows.length} `}дуудлага явагдаж байна</h2>
    <ul className="live-rows">
      {rows.map((call) => <li key={call.id}>
        <span className="live-phone">{call.callerPhone ?? "Дугаар тодорхойгүй"}</span>
        <span className="live-timer" aria-label="Үргэлжилж буй хугацаа">{now === null ? "—" : elapsed(call.startedAt, now)}</span>
      </li>)}
    </ul>
  </section>;
}
