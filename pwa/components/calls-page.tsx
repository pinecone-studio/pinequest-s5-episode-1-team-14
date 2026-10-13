"use client";

import { Fragment, useState } from "react";
import type { CallSession } from "../../backend/src/calls/store";
import type { TranscriptTurn } from "../../backend/src/calls/transcript";
import type { DataSource } from "@/lib/data-source";
import { formatDuration, formatUlaanbaatarTime as formatTime } from "@/lib/date-time";
import { callStatuses as statuses, callIntents as intents } from "@/lib/call-labels";
import { IntentIcon } from "./intent-icon";
import { Banner, Empty, Icon, PageHeader, SourceBadge } from "./ui";

const PAGE_SIZE = 15;
const STATUS_TONE: Record<CallSession["status"], string> = { active: "badge-blue", completed: "badge-green", failed: "badge-red", handed_off: "badge-amber" };

export default function CallsPage({ calls, source, transcripts }: {
  calls: CallSession[]; source: DataSource; transcripts: Record<string, TranscriptTurn[]>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const search = query.trim().toLowerCase();
  const phoneSearch = search.replace(/[\s()+-]/g, "");
  const filtered = calls.filter((call) => (!status || call.status === status) &&
    (!search || call.id.toLowerCase().includes(search) ||
      (/^\d+$/.test(phoneSearch) && (call.callerPhone ?? "").includes(phoneSearch))));
  const filters = [{ value: "", label: "Бүгд", count: calls.length },
    ...Object.entries(statuses).map(([value, label]) => ({ value, label, count: calls.filter((call) => call.status === value).length }))];

  const visible = filtered.slice(0, limit);

  function reset() { setQuery(""); setStatus(""); setExpanded(null); setLimit(PAGE_SIZE); }

  return <>
    <PageHeader title="Дуудлагууд" subtitle="Дуудлага бүр дээр дарж яриаг нь уншаарай."><SourceBadge source={source} /></PageHeader>
    {source === "demo" && <Banner>Жишээ дуудлагуудыг харуулж байна. Эдгээр нь бодит харилцагчийн мэдээлэл биш.</Banner>}
    {source === "offline" && <Banner>Backend сервер рүү хүрч чадсангүй. Сервер ажиллаж эхэлмэгц дуудлагын түүх энд харагдана.</Banner>}

    <section className="card" aria-labelledby="calls-title">
      <div className="card-header"><h2 className="card-title" id="calls-title">Дуудлагын түүх</h2><span className="card-meta">Улаанбаатарын цагаар · шинэ нь эхэнд</span></div>
      <div className="toolbar">
        <label className="search"><span className="sr-only">Утас эсвэл дуудлагын ID</span><Icon name="search" size={15} />
          <input className="input" type="search" value={query} placeholder="Дугаар эсвэл ID хайх" disabled={!calls.length} onChange={(event) => { setQuery(event.target.value); setExpanded(null); }} /></label>
        <div className="segmented" role="group" aria-label="Төлөвөөр шүүх">
          {filters.map((filter) => <button type="button" key={filter.value} aria-pressed={status === filter.value} disabled={!calls.length}
            onClick={() => { setStatus(filter.value); setExpanded(null); }}>{filter.label}<span className="count">{filter.count}</span></button>)}
        </div>
      </div>
      {filtered.length > 0 ? <div className="table-wrap" role="region" aria-label="Дуудлагын жагсаалт" tabIndex={0}>
        <table className="table">
          <caption className="sr-only">Дуудлагын түүх, эхэлсэн цагаар буурах дарааллаар</caption>
          <thead><tr><th scope="col">Дуудагч</th><th scope="col">Зорилго</th><th scope="col">Эхэлсэн</th><th scope="col">Хугацаа</th><th scope="col">Захиалга</th><th scope="col">Төлөв</th><th scope="col"><span className="sr-only">Яриа</span></th></tr></thead>
          <tbody>{visible.map((call) => {
            const detailId = "call-detail-" + encodeURIComponent(call.id);
            const open = expanded === call.id;
            const turns = transcripts[call.id] ?? [];
            return <Fragment key={call.id}>
              <tr className={open ? "row is-open" : "row"} onClick={() => setExpanded(open ? null : call.id)}>
                <th scope="row"><span className="cell-caller"><IntentIcon intent={call.intent} /><span className="cell-title">{call.callerPhone ?? "Дугаар тодорхойгүй"}</span></span></th>
                <td>{call.intent ? intents[call.intent] : <span className="muted">Тодорхойгүй</span>}</td>
                <td className="num"><time dateTime={call.startedAt}>{formatTime(call.startedAt)}</time></td>
                <td className="num">{call.status === "active" ? "—" : formatDuration(call.duration)}</td>
                <td>{call.bookingCreated ? <span className="booked"><Icon name="check" size={14} />Үүссэн</span> : <span className="muted">—</span>}</td>
                <td><span className={"badge " + STATUS_TONE[call.status]}>{statuses[call.status]}</span></td>
                <td className="cell-action"><button type="button" className={open ? "btn btn-icon btn-ghost is-open" : "btn btn-icon btn-ghost"} aria-expanded={open} aria-controls={detailId}
                  onClick={(event) => { event.stopPropagation(); setExpanded(open ? null : call.id); }}><Icon name="chevron" /><span className="sr-only">{open ? "Яриаг хураах" : "Яриаг харах"} {call.id}</span></button></td>
              </tr>
              <tr className="detail" id={detailId} hidden={!open}><td colSpan={7}>
                {turns.length ? <ol className="talk" aria-label="Ярианы бичвэр">
                  {turns.map((turn, index) => <li key={index} className={"talk-" + turn.role}>
                    <span className="talk-who">{turn.role === "agent" ? "AI туслах" : "Дуудагч"}</span>
                    {turn.text === null ? <p className="talk-unclear">Яриаг бичвэр болгож чадсангүй</p> : <p>{turn.text}</p>}
                  </li>)}
                </ol> : <p className="talk-empty">{call.status === "active" ? "Яриа эхэлмэгц бичвэр энд гарна." : "Энэ дуудлагын ярианы бичвэр хадгалагдаагүй."}</p>}
                <p className="detail-meta">ID <span className="mono">{call.id}</span>{call.bookingId && <> · Захиалга <span className="mono">{call.bookingId}</span></>}</p>
              </td></tr>
            </Fragment>;
          })}</tbody>
        </table>
      </div> : <Empty title={calls.length ? "Тохирох дуудлага олдсонгүй" : "Дуудлагын түүх хараахан алга"}
        text={calls.length ? "Хайлтаа өөрчлөх эсвэл шүүлтүүрээ цэвэрлээрэй." : "Анхны дуудлага ирмэгц энд харагдана."}>
        {calls.length > 0 && <button type="button" className="btn" onClick={reset}>Шүүлтүүр цэвэрлэх</button>}
      </Empty>}
      {calls.length > 0 && <p className="card-footer card-footer-row" role="status">
        <span>{filtered.length} дуудлагаас {visible.length} харагдаж байна</span>
        {filtered.length > visible.length && <button type="button" className="btn btn-sm" onClick={() => setLimit(limit + PAGE_SIZE)}>Цааш үзэх</button>}
      </p>}
    </section>
  </>;
}
