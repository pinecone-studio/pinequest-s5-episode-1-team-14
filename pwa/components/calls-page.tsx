"use client";

import { Fragment, useState } from "react";
import type { CallSession } from "../../backend/src/calls/store";

const statuses: Record<CallSession["status"], string> = {
  active: "Явагдаж байна", completed: "Дууссан", failed: "Амжилтгүй", handed_off: "Ажилтанд шилжсэн",
};
const intents: Record<NonNullable<CallSession["intent"]>, string> = {
  ASK_PRICE: "Үнэ асуусан", ASK_SERVICE: "Үйлчилгээ асуусан", ASK_OPENING_HOURS: "Цагийн хуваарь асуусан",
  BOOK_APPOINTMENT: "Цаг захиалах", CANCEL_BOOKING: "Захиалга цуцлах", ASK_PRODUCT: "Бүтээгдэхүүн асуусан",
  REQUEST_HUMAN: "Ажилтантай холбогдох", GENERAL_QUERY: "Ерөнхий асуулт",
};
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function formatTime(value: string) {
  const parts = Object.fromEntries(dateFormat.formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

export default function CallsPage({ calls, isDemo }: { calls: CallSession[]; isDemo: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const search = query.trim().toLowerCase();
  const phoneSearch = search.replace(/[\s()+-]/g, "");
  const filtered = calls.filter((call) => (!status || call.status === status) &&
    (!search || call.id.toLowerCase().includes(search) ||
      (/^\d+$/.test(phoneSearch) && (call.callerPhone ?? "").includes(phoneSearch))));

  function reset() { setQuery(""); setStatus(""); setExpanded(null); }

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">ХАРИЛЦАГЧИЙН ХАРИЛЦАА</p><h1>Дуудлагууд</h1><p className="page-description">Дуудлага бүрийн зорилго, үр дүн, захиалгыг нэг дороос.</p></div>
      <span className="waiting-badge"><span aria-hidden="true" />{isDemo ? "Туршилтын өгөгдөл" : "Холболт хүлээж байна"}</span>
    </div>
    <p className="calls-notice">{isDemo
      ? "Жишээ дуудлагуудыг харуулж байна. Эдгээр нь бодит харилцагчийн мэдээлэл биш."
      : "Дуудлагын мэдээлэл хараахан холбогдоогүй байна. Холбогдсоны дараа түүх энд харагдана."}</p>
    <section className="panel" aria-labelledby="calls-title">
      <div className="panel-heading"><div><p className="eyebrow">ДУУДЛАГЫН ТҮҮХ</p><h2 id="calls-title">Бүх дуудлага</h2></div><span className="calls-timezone">Улаанбаатар · UTC+8</span></div>
      <div className="calls-filters">
        <label className="calls-search">Утас эсвэл дуудлагын ID<input type="search" value={query} placeholder="Дугаар эсвэл ID хайх" onChange={(event) => { setQuery(event.target.value); setExpanded(null); }} disabled={!calls.length} /></label>
        <label>Төлөв<select value={status} onChange={(event) => { setStatus(event.target.value); setExpanded(null); }} disabled={!calls.length}>
          <option value="">Бүх төлөв</option>
          {Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select></label>
        <button type="button" className="calls-button" onClick={reset} disabled={!query && !status}>Цэвэрлэх</button>
      </div>
      {calls.length > 0 && <p className="calls-count" role="status">{calls.length} дуудлагаас {filtered.length} харагдаж байна · Шинэ нь эхэнд</p>}
      {filtered.length > 0 ? <div className="calls-table-scroll" role="region" aria-label="Дуудлагын жагсаалт, жижиг дэлгэц дээр хажуу тийш гүйлгэнэ" tabIndex={0}>
        <table className="calls-table">
          <caption className="sr-only">Дуудлагын түүх, эхэлсэн цагаар буурах дарааллаар</caption>
          <thead><tr><th scope="col">Дуудлага</th><th scope="col">Эхэлсэн</th><th scope="col">Хугацаа</th><th scope="col">Зорилго</th><th scope="col">Захиалга</th><th scope="col">Төлөв</th><th scope="col"><span className="sr-only">Дэлгэрэнгүй</span></th></tr></thead>
          <tbody>{filtered.map((call) => {
            const detailId = `call-detail-${encodeURIComponent(call.id)}`;
            return <Fragment key={call.id}>
              <tr className="call-row">
                <th scope="row"><strong>{call.callerPhone ?? "Дугаар тодорхойгүй"}</strong><small>{call.id}</small></th>
                <td><time dateTime={call.startedAt}>{formatTime(call.startedAt)}</time></td>
                <td>{call.status === "active" ? "Явагдаж байна" : `${Math.floor(call.duration / 60)}:${String(call.duration % 60).padStart(2, "0")}`}</td>
                <td>{call.intent ? intents[call.intent] : "Тодорхойгүй"}</td>
                <td><span className={call.bookingCreated ? "call-booked" : "call-muted"}>{call.bookingCreated ? "Үүссэн" : "Үүсээгүй"}</span></td>
                <td><span className={`call-status call-status-${call.status}`}>{statuses[call.status]}</span></td>
                <td><button type="button" className="calls-button" aria-expanded={expanded === call.id} aria-controls={detailId} onClick={() => setExpanded(expanded === call.id ? null : call.id)}>{expanded === call.id ? "Хураах" : "Дэлгэрэнгүй"}<span className="sr-only"> {call.id}</span></button></td>
              </tr>
              <tr id={detailId} hidden={expanded !== call.id}><td colSpan={7} className="call-detail"><dl>
                <div><dt>Дуудлагын ID</dt><dd>{call.id}</dd></div>
                <div><dt>Дууссан цаг · Улаанбаатар</dt><dd>{call.endedAt ? <time dateTime={call.endedAt}>{formatTime(call.endedAt)}</time> : "Дуусаагүй"}</dd></div>
                <div><dt>Захиалгын ID</dt><dd>{call.bookingId ?? "Захиалга үүсээгүй"}</dd></div>
              </dl></td></tr>
            </Fragment>;
          })}</tbody>
        </table>
      </div> : <div className="empty-state">
        <h3>{calls.length ? "Тохирох дуудлага олдсонгүй" : "Дуудлагын түүх хараахан алга"}</h3>
        <p>{calls.length ? "Хайлтаа өөрчлөх эсвэл шүүлтүүрээ цэвэрлээрэй." : "Мэдээлэл холбогдмогц дуудлагын жагсаалт шинэчлэгдэнэ."}</p>
        {calls.length > 0 && <button type="button" className="calls-button" onClick={reset}>Бүх дуудлагыг харах</button>}
      </div>}
      <p className="connection-note">Хугацааг минут:секунд хэлбэрээр харуулав. Жижиг дэлгэц дээр жагсаалтыг хажуу тийш гүйлгэнэ.</p>
    </section>
  </>;
}
