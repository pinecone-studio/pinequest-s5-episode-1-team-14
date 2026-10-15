"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { KnowledgeItem } from "../../backend/src/knowledge/store";
import type { DataSource } from "@/lib/data-source";
import { knowledgeCategories } from "@/lib/knowledge";
import KnowledgeEditor from "./knowledge-editor";
import { Banner, Empty, Icon, PageHeader, SourceBadge } from "./ui";

const STATUS_FILTERS = [{ value: "", label: "Бүгд" }, { value: "active", label: "Баталгаажсан" }, { value: "draft", label: "Ноорог" }];
// Зочин хамгийн их асуудаг зүйлс эхэндээ.
const CATEGORY_ORDER: KnowledgeItem["category"][] = ["opening_hours", "product", "service", "promotion", "faq", "policy", "business_info"];

export default function KnowledgePage({ items: initialItems, source }: { items: KnowledgeItem[]; source: DataSource }) {
  const [draftItems, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState<KnowledgeItem | null | undefined>();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const listTitle = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  // Жишээ горимд хуудсан дээр түр, бодит горимд серверт (зөвхөн өөрийн бизнесийнх) хадгална.
  const live = source === "live";
  const editable = source === "demo" || live;
  const items = live ? initialItems : draftItems;

  async function persist(request: Promise<Response>, done: string): Promise<boolean> {
    setSaving(true);
    try {
      const response = await request;
      if (!response.ok) throw new Error(String(response.status));
      setMessage(done);
      router.refresh();
      return true;
    } catch {
      setMessage("Хадгалж чадсангүй. Мэдээллээ шалгаад дахин оролдоно уу.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  const search = query.trim().toLowerCase();
  const filtered = items.filter((item) => (!status || item.active === (status === "active")) &&
    (!search || [item.title, item.content].some((value) => value.toLowerCase().includes(search))));
  const sections = CATEGORY_ORDER.map((category) => ({
    category, rows: filtered.filter((item) => item.category === category).sort((a, b) => a.title.localeCompare(b.title, "mn")),
  })).filter(({ rows }) => rows.length > 0);
  function reset() { setQuery(""); setStatus(""); }
  function closeEditor() { setEditor(undefined); listTitle.current?.focus(); }

  return <>
    <PageHeader title="Мэдээллийн сан" subtitle="AI туслах зочдод яг энэ мэдээллээр хариулна.">
      <SourceBadge source={source} />
      {editable && <button type="button" className="btn btn-primary" disabled={editor !== undefined || saving} onClick={() => { setMessage(""); setEditor(null); }}><Icon name="plus" size={15} />Мэдээлэл нэмэх</button>}
    </PageHeader>
    {source === "demo" && <Banner>Жишээ мэдээлэл. Өөрчлөлт энэ хуудсанд түр хадгалагдаж, шинэчлэхэд арилна.</Banner>}
    {source === "offline" && <Banner>Backend сервер рүү хүрч чадсангүй. Сервер ажиллаж эхэлмэгц мэдээллийн сан энд харагдана.</Banner>}

    {editable && editor !== undefined && <KnowledgeEditor key={editor?.id ?? "new"} item={editor} onCancel={closeEditor} onSave={async (draft) => {
      if (live) {
        const body = JSON.stringify({ ...draft, ...(editor ? { id: editor.id } : {}) });
        if (!await persist(fetch("/api/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body }), "Мэдээллийг хадгаллаа.")) return;
      } else {
        const saved: KnowledgeItem = { ...draft, id: editor?.id ?? crypto.randomUUID(), updatedAt: new Date().toISOString() };
        setItems((current) => [...current.filter((item) => item.id !== saved.id), saved]);
        setMessage("Жишээ мэдээллийг хадгаллаа.");
      }
      reset(); closeEditor();
    }} />}

    <section className="card" aria-labelledby="knowledge-title">
      <div className="toolbar">
        <h2 className="sr-only" id="knowledge-title" ref={listTitle} tabIndex={-1}>Бүх мэдээлэл</h2>
        <label className="search"><span className="sr-only">Гарчиг эсвэл агуулга</span><Icon name="search" size={15} />
          <input className="input" type="search" value={query} placeholder="Мэдээлэл хайх" disabled={!items.length} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="segmented" role="group" aria-label="Төлөвөөр шүүх">
          {STATUS_FILTERS.map((filter) => <button type="button" key={filter.value} aria-pressed={status === filter.value} disabled={!items.length} onClick={() => setStatus(filter.value)}>{filter.label}</button>)}
        </div>
        <span className="card-meta toolbar-end" role="status">{message && message + " "}{items.length} мэдээллээс {filtered.length}</span>
      </div>
      {sections.length > 0 ? sections.map(({ category, rows }) => <div key={category}>
        <h3 className="day-head">{knowledgeCategories[category]}<span>{rows.length}</span></h3>
        <ul className="kb-rows">
          {rows.map((item) => <li key={item.id}>
            <div className="kb-main">
              <p className="kb-title">{item.title}{!item.active && <span className="badge">Ноорог</span>}</p>
              <p className="kb-content">{item.content}</p>
            </div>
            {item.price !== undefined && <p className="kb-price">{item.price.toLocaleString("en-US")} ₮</p>}
            {editable && <div className="kb-actions">
              <button className="btn btn-sm" type="button" disabled={editor !== undefined || saving} onClick={() => { setMessage(""); setEditor(item); }}>Засах<span className="sr-only"> {item.title}</span></button>
              <button className="btn btn-sm btn-danger" type="button" disabled={editor !== undefined || saving} onClick={async () => {
                if (!window.confirm("“" + item.title + "” мэдээллийг устгах уу?")) return;
                if (live) {
                  await persist(fetch(`/api/knowledge/${encodeURIComponent(item.id)}`, { method: "DELETE" }), "Мэдээллийг устгалаа.");
                } else {
                  setItems((current) => current.filter((entry) => entry.id !== item.id));
                  setMessage("Жишээ мэдээллийг устгалаа.");
                }
                listTitle.current?.focus();
              }}>Устгах<span className="sr-only"> {item.title}</span></button>
            </div>}
          </li>)}
        </ul>
      </div>) : <Empty title={items.length ? "Тохирох мэдээлэл олдсонгүй" : "Мэдээлэл хараахан алга"}
        text={items.length ? "Хайлт эсвэл төлөвийн шүүлтүүрээ цэвэрлээрэй." : "Бизнесийн мэдээлэл нэмэгдмэгц энд харагдана."}>
        {items.length > 0 && <button className="btn" type="button" onClick={reset}>Шүүлтүүр цэвэрлэх</button>}
      </Empty>}
      <p className="card-footer">AI зөвхөн баталгаажсан мэдээллийг ашиглана. Ноорог мэдээлэл хариултад орохгүй.</p>
    </section>
  </>;
}
