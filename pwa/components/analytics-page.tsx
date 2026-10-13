"use client";

import { useState } from "react";
import { summarizeAnalytics, type AnalyticsCall, type AnalyticsBooking } from "@/lib/analytics";
import { callStatuses, callIntents } from "@/lib/call-labels";
import type { DataSource } from "@/lib/data-source";
import { formatDuration, formatUlaanbaatarTime } from "@/lib/date-time";
import { callsWithin, recentDays } from "@/lib/overview";
import { Banner, Empty, PageHeader, SourceBadge } from "./ui";

const RANGES = [{ value: 1, label: "Өнөөдөр" }, { value: 7, label: "7 хоног" }, { value: 30, label: "30 хоног" }, { value: 0, label: "Бүгд" }];

export default function AnalyticsPage({ calls: allCalls, bookings: allBookings, source, bookingsSource, now }: {
  calls: AnalyticsCall[]; bookings: AnalyticsBooking[]; source: DataSource; bookingsSource: DataSource; now: number;
}) {
  const [range, setRange] = useState(7);
  // Бүх үзүүлэлт, график, хүснэгт нэг л хугацааны хүрээг ашиглана.
  const days = range ? recentDays(allCalls, range, now) : null;
  const calls = days ? callsWithin(allCalls, days) : allCalls;
  const bookings = days
    ? callsWithin(allBookings.map(({ startTime }) => ({ startedAt: startTime })), days).map(({ startedAt }) => ({ startTime: startedAt }))
    : allBookings;
  const summary = summarizeAnalytics(calls, bookings);
  const { totalCalls, totalBookings, finishedCalls, convertedCalls, averageDuration, conversionRate } = summary;
  const hasCalls = source !== "offline";
  const hasBookings = bookingsSource !== "offline";
  const dash = <><span aria-hidden="true">—</span><span className="sr-only">Мэдээлэл алга</span></>;
  const stats = [
    { label: "Захиалга болсон хувь", value: hasCalls && conversionRate !== null ? conversionRate.toFixed(0) + "%" : null, hint: finishedCalls + " дууссанаас " + convertedCalls },
    { label: "Дундаж хугацаа", value: hasCalls && averageDuration !== null ? formatDuration(averageDuration) : null, hint: "Минут:секунд" },
    { label: "Товлосон захиалга", value: hasBookings ? totalBookings : null, hint: hasBookings ? "Үйлчилгээ авах өдрөөр" : "Calendar холбогдоогүй" },
  ];
  const breakdowns = [
    { id: "status", title: "Дуудлагын төлөв", rows: Object.entries(callStatuses).map(([key, label]) => ({ label, count: summary.statuses[key as keyof typeof callStatuses] })) },
    { id: "intent", title: "Юу асуусан бэ", rows: Object.entries({ ...callIntents, unknown: "Тодорхойгүй" }).map(([key, label]) => ({ label, count: summary.intents[key as keyof typeof summary.intents] })).filter(({ count }) => count > 0).sort((a, b) => b.count - a.count) },
  ];
  // Цагаар: дуудлага ирсэн хамгийн эрт цагаас хамгийн орой цаг хүртэл, Улаанбаатарын цагаар.
  const byHour = new Map<number, number>();
  for (const call of calls) {
    const hour = Number(formatUlaanbaatarTime(call.startedAt).slice(11, 13));
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
  }
  const hourKeys = [...byHour.keys()];
  const hours = hourKeys.length ? Array.from({ length: Math.max(...hourKeys) - Math.min(...hourKeys) + 1 }, (_, index) => {
    const hour = Math.min(...hourKeys) + index;
    return { hour, count: byHour.get(hour) ?? 0 };
  }) : [];
  const peak = hours.reduce((best, item) => item.count > best.count ? item : best, { hour: 0, count: 0 });
  const pad = (hour: number) => String(hour).padStart(2, "0") + ":00";

  return <>
    <PageHeader title="Тайлан" subtitle="Сонгосон хугацаанд AI туслах яаж ажилласан бэ.">
      <div className="segmented" role="group" aria-label="Хугацаа">
        {RANGES.map(({ value, label }) => <button type="button" key={value} aria-pressed={range === value} disabled={!hasCalls} onClick={() => setRange(value)}>{label}</button>)}
      </div>
      <SourceBadge source={source} />
    </PageHeader>
    {source === "demo" && <Banner>Тайлан нь жишээ өгөгдлөөс тооцоологдсон. Бодит бизнесийн үр дүн биш.</Banner>}
    {source === "offline" && <Banner>Backend сервер рүү хүрч чадсангүй. Сервер ажиллаж эхэлмэгц үзүүлэлтүүд харагдана.</Banner>}

    <dl className="stats stats-lead" aria-label="Тайлангийн үзүүлэлтүүд">
      <div className="stat stat-lead">
        <dt>Нийт дуудлага</dt>
        <dd><span className="stat-value">{hasCalls ? totalCalls : dash}</span>
          <span className="stat-hint">{summary.statuses.completed} хэвийн дууссан · {summary.statuses.handed_off} ажилтанд шилжсэн · {summary.statuses.failed} амжилтгүй</span></dd>
      </div>
      {stats.map(({ label, value, hint }) => <div className="stat" key={label}>
        <dt>{label}</dt>
        <dd><span className="stat-value">{value ?? dash}</span><span className="stat-hint">{hint}</span></dd>
      </div>)}
    </dl>

    {hasCalls && totalCalls > 0 ? <>
      <section className="card" aria-labelledby="hours-title">
        <div className="card-header"><h2 className="card-title" id="hours-title">Аль цагт их залгадаг вэ</h2>
          <span className="card-meta">Хамгийн ачаалалтай: {pad(peak.hour)}–{pad(peak.hour + 1)} · {peak.count} дуудлага</span></div>
        <div className="hours" role="img" aria-label={"Цагаар дуудлагын тоо: " + hours.map(({ hour, count }) => pad(hour) + " " + count).join(", ")}>
          {hours.map(({ hour, count }) => <div className="week-day" key={hour} title={pad(hour) + "–" + pad(hour + 1) + ": " + count + " дуудлага"}>
            <span className="week-track">
              {hour === peak.hour && <span className="week-count">{count}</span>}
              <span className={hour === peak.hour ? "week-bar is-today" : "week-bar"} style={{ height: Math.max(3, count / peak.count * 100) + "%" }} />
            </span>
            <span className={hour === peak.hour ? "week-label is-today" : "week-label"}>{hour}</span>
          </div>)}
        </div>
      </section>

      <div className="grid-2 grid-even section">
        {breakdowns.map(({ id, title, rows }) => <section className="card" aria-labelledby={id + "-title"} key={id}>
          <div className="card-header"><h2 className="card-title" id={id + "-title"}>{title}</h2></div>
          <ul className="bars">{rows.map(({ label, count }) => <li key={label}>
            <div className="bar-row"><span>{label}</span><span className="num">{count} <span className="muted">· {(count / totalCalls * 100).toFixed(0)}%</span></span></div>
            <div className="bar-track" aria-hidden="true"><span style={{ width: count / totalCalls * 100 + "%" }} /></div>
          </li>)}</ul>
        </section>)}
      </div>

      <section className="card section" aria-labelledby="daily-title">
        <div className="card-header"><h2 className="card-title" id="daily-title">Өдрийн задаргаа</h2><span className="card-meta">Улаанбаатарын өдрөөр</span></div>
        <div className="table-wrap" role="region" aria-label="Өдрийн тайлан" tabIndex={0}>
          <table className="table">
            <caption className="sr-only">Өдөр бүрийн дуудлага, товлосон захиалга</caption>
            <thead><tr><th scope="col">Өдөр</th><th scope="col">Дуудлага</th><th scope="col">Товлосон захиалга</th></tr></thead>
            <tbody>{[...summary.daily].reverse().map((day) => <tr className="row" key={day.date}>
              <th scope="row" className="num"><time dateTime={day.date}>{day.date.replace(/-/g, ".")}</time></th><td className="num">{day.calls}</td><td className="num">{hasBookings ? day.bookings : "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="card-footer">Явагдаж буй дуудлага хувь болон дундаж хугацаанд орохгүй. Захиалгыг товлосон өдрөөр нь тоолно.</p>
      </section>
    </> : <section className="card"><Empty title={hasCalls ? "Энэ хугацаанд дуудлага алга" : "Тайлан хараахан бэлэн болоогүй"}
      text={hasCalls ? "Өөр хугацаа сонгоно уу." : "Дуудлагын мэдээлэл холбогдохыг хүлээж байна."} /></section>}
  </>;
}
