"use client";

import { Fragment, useState } from "react";
import type { Booking } from "../../backend/src/calendar/googleCalendar";
import { formatUlaanbaatarTime as formatTime } from "@/lib/date-time";

const statuses: Record<Booking["status"], string> = { confirmed: "Баталгаажсан" };
const sources: Record<Booking["source"], string> = { AI_PHONE_AGENT: "AI утасны туслах" };

export default function BookingsPage({ bookings, isDemo }: { bookings: Booking[]; isDemo: boolean }) {
  const [query, setQuery] = useState("");
  const [date, setDate] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const search = query.trim().toLowerCase();
  const phoneSearch = search.replace(/[\s()+-]/g, "");
  const selectedDate = date.replace(/-/g, ".");
  const filtered = bookings.filter((booking) => (!date || formatTime(booking.startTime).startsWith(selectedDate)) &&
    (!search || [booking.customerName, booking.serviceName, booking.id].some((value) => value.toLowerCase().includes(search)) ||
      (/^\d+$/.test(phoneSearch) && booking.phone.includes(phoneSearch))));

  function reset() { setQuery(""); setDate(""); setExpanded(null); }

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">ЦАГ ТОВЛОЛТ</p><h1>Захиалгууд</h1><p className="page-description">Харилцагч, үйлчилгээ, товлосон цагаа нэг дороос.</p></div>
      <span className="waiting-badge"><span aria-hidden="true" />{isDemo ? "Туршилтын өгөгдөл" : "Холболт хүлээж байна"}</span>
    </div>
    <p className="calls-notice">{isDemo
      ? "Жишээ захиалгуудыг харуулж байна. Эдгээр нь бодит харилцагчийн мэдээлэл эсвэл Calendar захиалга биш."
      : "Захиалгын мэдээлэл хараахан холбогдоогүй байна. Холбогдсоны дараа жагсаалт энд харагдана."}</p>
    <section className="panel" aria-labelledby="bookings-title">
      <div className="panel-heading"><div><p className="eyebrow">ЗАХИАЛГЫН ЖАГСААЛТ</p><h2 id="bookings-title">Бүх захиалга</h2></div><span className="calls-timezone">Улаанбаатар · UTC+8</span></div>
      <div className="calls-filters">
        <label className="calls-search">Нэр, утас, үйлчилгээ эсвэл ID<input type="search" value={query} placeholder="Харилцагч эсвэл захиалга хайх" onChange={(event) => { setQuery(event.target.value); setExpanded(null); }} disabled={!bookings.length} /></label>
        <label>Өдөр · Улаанбаатар<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setExpanded(null); }} disabled={!bookings.length} /></label>
        <button type="button" className="calls-button" onClick={reset} disabled={!query && !date}>Цэвэрлэх</button>
      </div>
      {bookings.length > 0 && <p className="calls-count" role="status">{bookings.length} захиалгаас {filtered.length} харагдаж байна · Эхлэх цагаар өсөх дараалал</p>}
      {filtered.length > 0 ? <div className="calls-table-scroll" role="region" aria-label="Захиалгын жагсаалт, жижиг дэлгэц дээр хажуу тийш гүйлгэнэ" tabIndex={0}>
        <table className="calls-table">
          <caption className="sr-only">Захиалгууд, эхлэх цагаар өсөх дарааллаар</caption>
          <thead><tr><th scope="col">Харилцагч</th><th scope="col">Үйлчилгээ</th><th scope="col">Эхлэх цаг</th><th scope="col">Хугацаа</th><th scope="col">Төлөв</th><th scope="col">Эх үүсвэр</th><th scope="col"><span className="sr-only">Дэлгэрэнгүй</span></th></tr></thead>
          <tbody>{filtered.map((booking) => {
            const detailId = `booking-detail-${encodeURIComponent(booking.id)}`;
            return <Fragment key={booking.id}>
              <tr className="call-row booking-row">
                <th scope="row"><strong>{booking.customerName}</strong><small>{booking.phone}</small></th>
                <td>{booking.serviceName}</td>
                <td><time dateTime={booking.startTime}>{formatTime(booking.startTime)}</time></td>
                <td>{booking.durationMinutes} мин</td>
                <td><span className="call-status call-status-completed">{statuses[booking.status]}</span></td>
                <td>{sources[booking.source]}</td>
                <td><button type="button" className="calls-button" aria-expanded={expanded === booking.id} aria-controls={detailId} onClick={() => setExpanded(expanded === booking.id ? null : booking.id)}>{expanded === booking.id ? "Хураах" : "Дэлгэрэнгүй"}<span className="sr-only"> {booking.id}</span></button></td>
              </tr>
              <tr id={detailId} hidden={expanded !== booking.id}><td colSpan={7} className="call-detail"><dl>
                <div><dt>Захиалгын ID</dt><dd>{booking.id}</dd></div>
                <div><dt>Calendar event ID</dt><dd>{booking.calendarEventId}</dd></div>
                <div><dt>Үйлчилгээний ID</dt><dd>{booking.serviceId}</dd></div>
                <div><dt>Дуусах цаг · Улаанбаатар</dt><dd><time dateTime={booking.endTime}>{formatTime(booking.endTime)}</time></dd></div>
                <div><dt>Эх үүсвэр</dt><dd>{sources[booking.source]}</dd></div>
              </dl></td></tr>
            </Fragment>;
          })}</tbody>
        </table>
      </div> : <div className="empty-state">
        <h3>{bookings.length ? "Тохирох захиалга олдсонгүй" : "Захиалгын жагсаалт хараахан алга"}</h3>
        <p>{bookings.length ? "Хайлтаа өөрчлөх эсвэл өдрийн шүүлтүүрээ цэвэрлээрэй." : "Мэдээлэл холбогдмогц захиалгууд энд харагдана."}</p>
        {bookings.length > 0 && <button type="button" className="calls-button" onClick={reset}>Бүх захиалгыг харах</button>}
      </div>}
      <p className="connection-note">Огноо, цагийг Улаанбаатарын цагаар харуулна. Жижиг дэлгэц дээр жагсаалтыг хажуу тийш гүйлгэнэ.</p>
    </section>
  </>;
}
