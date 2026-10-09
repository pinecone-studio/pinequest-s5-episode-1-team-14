"use client";

import { useState } from "react";
import { summarizeAnalytics, type AnalyticsCall, type AnalyticsBooking } from "@/lib/analytics";
import { callStatuses, callIntents } from "@/lib/call-labels";

export default function AnalyticsPage({ calls, bookings, isDemo }: { calls: AnalyticsCall[]; bookings: AnalyticsBooking[]; isDemo: boolean }) {
  const [date, setDate] = useState("");
  const summary = summarizeAnalytics(calls, bookings, date);
  const { totalCalls, totalBookings, finishedCalls, convertedCalls, averageDuration, conversionRate } = summary;
  const metrics = [
    { label: "Нийт дуудлага", value: totalCalls, note: "Эхэлсэн өдрөөр, бүх төлөв" },
    { label: "Дууссан дуудлага", value: summary.statuses.completed, note: "Дууссан төлөвтэй дуудлага" },
    { label: "Нийт захиалга", value: totalBookings, note: "Үйлчилгээ авах товлосон өдрөөр" },
    { label: "Захиалга болсон хувь", value: conversionRate === null ? null : `${conversionRate.toFixed(1)}%`, note: `${finishedCalls} дуусгавар дуудлагаас ${convertedCalls} нь захиалгатай` },
    { label: "Дундаж дуудлагын хугацаа", value: averageDuration === null ? null : `${Math.floor(averageDuration / 60)}:${String(averageDuration % 60).padStart(2, "0")}`, note: "Дуусгавар дуудлагын минут:секунд" },
    { label: "Тооцоолсон орлого", value: null, note: "Захиалгын баталгаажсан үнэ шаардлагатай" },
  ];
  const breakdowns = [
    { id: "status", title: "Дуудлагын төлөв", rows: Object.entries(callStatuses).map(([key, label]) => ({ label, count: summary.statuses[key as keyof typeof callStatuses] })) },
    { id: "intent", title: "Дуудлагын зорилго", rows: Object.entries({ ...callIntents, unknown: "Тодорхойгүй" }).map(([key, label]) => ({ label, count: summary.intents[key as keyof typeof summary.intents] })).filter(({ count }) => count > 0) },
  ];

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">ҮЙЛ АЖИЛЛАГААНЫ ҮР ДҮН</p><h1>Тайлан</h1><p className="page-description">Дуудлага, захиалгын үр дүнг өдрөөр нь хараарай.</p></div>
      <span className="waiting-badge"><span aria-hidden="true" />{isDemo ? "Туршилтын өгөгдөл" : "Холболт хүлээж байна"}</span>
    </div>
    <p className="calls-notice">{isDemo ? "Тайлан нь Дуудлагууд, Захиалгууд хэсгийн жишээ өгөгдлөөс тооцоологдсон. Бодит бизнесийн үр дүн биш." : "Тайлангийн мэдээлэл хараахан холбогдоогүй байна. Холбогдсоны дараа үзүүлэлтүүд харагдана."}</p>
    <section className="panel analytics-filter" aria-labelledby="period-title">
      <div className="panel-heading"><h2 id="period-title">Тайлангийн өдөр</h2><span className="calls-timezone">Улаанбаатар · UTC+8</span></div>
      <div className="calls-filters">
        <label>Өдөр<input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={!isDemo} /></label>
        <button type="button" className="calls-button" onClick={() => setDate("")} disabled={!date}>Бүх өдөр</button>
        <p className="analytics-period" role="status">{isDemo ? `${date || "Бүх өдөр"} · ${totalCalls} дуудлага · ${totalBookings} захиалга` : "Мэдээлэл хүлээж байна"}</p>
      </div>
    </section>
    <section aria-label="Тайлангийн үзүүлэлтүүд">
      <dl className="metrics-grid">
        {metrics.map(({ label, value, note }) => <div className="metric-card analytics-metric" key={label}>
          <dt>{label}</dt><dd><span className="analytics-value">{isDemo && value !== null ? value : <><span aria-hidden="true">—</span><span className="sr-only">Мэдээлэл алга</span></>}</span>
            <small>{isDemo ? note : "Мэдээлэл холбогдоогүй"}</small></dd>
        </div>)}
      </dl>
      <p className="metrics-note">Явагдаж буй дуудлага хувь болон дундаж хугацаанд орохгүй. Дууссан, амжилтгүй, ажилтанд шилжсэн дуудлагыг дуусгаварт тооцов.</p>
    </section>
    {isDemo && (totalCalls > 0 || totalBookings > 0) ? <>
      <div className="dashboard-grid">
        {breakdowns.map(({ id, title, rows }) => <section className="panel" aria-labelledby={`${id}-title`} key={id}>
          <div className="panel-heading"><h2 id={`${id}-title`}>{title}</h2></div>
          {totalCalls ? <ul className="analytics-bars">{rows.map(({ label, count }) => <li key={label}>
            <div><span>{label}</span><strong>{count} <small>· {(count / totalCalls * 100).toFixed(1)}%</small></strong></div>
            <div className="analytics-track" aria-hidden="true"><span style={{ width: `${count / totalCalls * 100}%` }} /></div>
          </li>)}</ul> : <p className="empty-state">Энэ өдөр дуудлага алга.</p>}
        </section>)}
      </div>
      <section className="panel analytics-daily" aria-labelledby="daily-title">
        <div className="panel-heading"><h2 id="daily-title">Өдрийн задаргаа</h2><span className="calls-timezone">Өгөгдөлтэй өдрүүд</span></div>
        <div className="calls-table-scroll" role="region" aria-label="Өдрийн тайлан, хажуу тийш гүйлгэнэ" tabIndex={0}>
          <table className="calls-table analytics-table">
            <caption className="sr-only">Улаанбаатарын өдрөөр өсөх дараалалтай дуудлага, товлосон захиалга</caption>
            <thead><tr><th scope="col">Өдөр</th><th scope="col">Дуудлага</th><th scope="col">Товлосон захиалга</th></tr></thead>
            <tbody>{summary.daily.map((day) => <tr key={day.date}><th scope="row"><time dateTime={day.date}>{day.date}</time></th><td>{day.calls}</td><td>{day.bookings}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="connection-note">Захиалгыг товлосон өдрөөр тоолов. Дуудлага хийсэн өдөр нь үйлчилгээ авах өдрөөс ялгаатай байж болно.</p>
      </section>
    </> : <section className="panel analytics-daily"><div className="empty-state"><h2>{isDemo ? "Сонгосон өдөр мэдээлэл алга" : "Тайлан хараахан бэлэн болоогүй"}</h2><p>{isDemo ? "Өөр өдөр сонгох эсвэл бүх өдрийг харна уу." : "Дуудлага, захиалгын мэдээлэл холбогдохыг хүлээж байна."}</p></div></section>}
    <p className="metrics-note">AI хариулсан хувь, орлого, ROI одоогоор тооцоологдохгүй. Хариулсан эсэх, захиалгын үнэ, зардлын мэдээлэл шаардлагатай.</p>
  </>;
}
