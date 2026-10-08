"use client";

import { useRef, useState } from "react";
import type { KnowledgeItem } from "../../backend/src/knowledge/store";
import { knowledgeCategories } from "@/lib/knowledge";
import { formatUlaanbaatarTime } from "@/lib/date-time";
import KnowledgeEditor from "./knowledge-editor";

export default function KnowledgePage({ items: initialItems, isDemo }: { items: KnowledgeItem[]; isDemo: boolean }) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState<KnowledgeItem | null | undefined>();
  const [message, setMessage] = useState("");
  const listTitle = useRef<HTMLHeadingElement>(null);
  const search = query.trim().toLowerCase();
  const filtered = items.filter((item) => (!category || item.category === category) &&
    (!status || item.active === (status === "active")) &&
    (!search || [item.title, item.content, item.id].some((value) => value.toLowerCase().includes(search))))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  function reset() { setQuery(""); setCategory(""); setStatus(""); }
  function closeEditor() { setEditor(undefined); listTitle.current?.focus(); }

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">БАТАЛГААТАЙ МЭДЭЭЛЭЛ</p><h1>Мэдээллийн сан</h1><p className="page-description">Үйлчилгээ, үнэ, цагийн хуваарь болон түгээмэл асуултуудаа удирдах.</p></div>
      <span className="waiting-badge"><span aria-hidden="true" />{isDemo ? "Туршилтын өгөгдөл" : "Холболт хүлээж байна"}</span>
    </div>
    <p className="calls-notice">{isDemo
      ? "Зөвхөн жишээ мэдээлэл. Өөрчлөлтүүд энэ хуудсанд түр хадгалагдаж, хуудас шинэчлэхэд арилна. Бодит AI туслахын мэдээлэл өөрчлөгдөхгүй."
      : "Мэдээллийн сан хараахан холбогдоогүй байна. Холбогдсоны дараа мэдээллээ удирдах боломжтой болно."}</p>
    {isDemo && editor !== undefined && <KnowledgeEditor key={editor?.id ?? "new"} item={editor} onCancel={closeEditor} onSave={(draft) => {
      // ponytail: page-local demo edits only; replace with authenticated CRUD before storing real knowledge.
      const saved: KnowledgeItem = { ...draft, id: editor?.id ?? crypto.randomUUID(), updatedAt: new Date().toISOString() };
      setItems((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      setMessage("Туршилтын мэдээллийг хадгаллаа. Хуудас шинэчлэхэд өөрчлөлт арилна.");
      reset(); closeEditor();
    }} />}
    <section className="panel" aria-labelledby="knowledge-title">
      <div className="panel-heading"><div><p className="eyebrow">БИЗНЕСИЙН МЭДЭЭЛЭЛ</p><h2 id="knowledge-title" ref={listTitle} tabIndex={-1}>Бүх мэдээлэл</h2></div><button type="button" className="calls-button knowledge-save" disabled={!isDemo || editor !== undefined} onClick={() => { setMessage(""); setEditor(null); }}>Мэдээлэл нэмэх</button></div>
      <div className="calls-filters">
        <label className="calls-search">Гарчиг, агуулга эсвэл ID<input type="search" value={query} placeholder="Мэдээлэл хайх" disabled={!items.length} onChange={(event) => setQuery(event.target.value)} /></label>
        <label>Ангиллаар шүүх<select value={category} disabled={!items.length} onChange={(event) => setCategory(event.target.value)}>
          <option value="">Бүх ангилал</option>{Object.entries(knowledgeCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Төлөв<select value={status} disabled={!items.length} onChange={(event) => setStatus(event.target.value)}><option value="">Бүх төлөв</option><option value="active">Баталгаажсан</option><option value="draft">Ноорог</option></select></label>
        <button className="calls-button" type="button" disabled={!query && !category && !status} onClick={reset}>Цэвэрлэх</button>
      </div>
      {isDemo && <p className="calls-count" role="status">{message && `${message} `}{items.length} мэдээллээс {filtered.length} харагдаж байна</p>}
      {filtered.length > 0 ? <div className="knowledge-list">{filtered.map((item) => <article className="knowledge-card" key={item.id} aria-labelledby={`knowledge-${item.id}`}>
        <div className="knowledge-meta"><span>{knowledgeCategories[item.category]}</span><span className={`call-status ${item.active ? "call-status-completed" : "call-status-handed_off"}`}>{item.active ? "Баталгаажсан" : "Ноорог"}</span></div>
        <h3 id={`knowledge-${item.id}`}>{item.title}</h3><p className="knowledge-content">{item.content}</p>
        <p className="knowledge-price">{item.price === undefined ? "Үнэ оруулаагүй" : `${item.price} ₮`}</p>
        <p className="knowledge-updated">Шинэчилсэн · <time dateTime={item.updatedAt}>{formatUlaanbaatarTime(item.updatedAt)}</time> · УБ</p>
        <div className="knowledge-actions">
          <button className="calls-button" type="button" disabled={!isDemo || editor !== undefined} onClick={() => { setMessage(""); setEditor(item); }}>Засах<span className="sr-only"> {item.title}</span></button>
          <button className="calls-button knowledge-delete" type="button" disabled={!isDemo || editor !== undefined} onClick={() => {
            if (!isDemo || !window.confirm(`“${item.title}” мэдээллийг туршилтын жагсаалтаас устгах уу?`)) return;
            setItems((current) => current.filter((entry) => entry.id !== item.id));
            setMessage("Туршилтын мэдээллийг устгалаа."); listTitle.current?.focus();
          }}>Устгах<span className="sr-only"> {item.title}</span></button>
        </div>
      </article>)}</div> : <div className="empty-state"><h3>{items.length ? "Тохирох мэдээлэл олдсонгүй" : "Мэдээлэл хараахан алга"}</h3><p>{items.length ? "Хайлт, ангилал эсвэл төлөвийн шүүлтүүрээ цэвэрлээрэй." : isDemo ? "Шинэ жишээ мэдээлэл нэмээд туршиж үзээрэй." : "Мэдээллийн сан холбогдсоны дараа энд харагдана."}</p>{items.length > 0 && <button className="calls-button" type="button" onClick={reset}>Бүх мэдээллийг харах</button>}</div>}
      <p className="connection-note">AI ашиглах мэдээллийг хүн нягталж баталгаажуулна. Ноорог мэдээлэл баталгаажаагүй байна.</p>
    </section>
  </>;
}
