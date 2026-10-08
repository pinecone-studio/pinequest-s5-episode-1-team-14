"use client";

import { useEffect, useRef, useState } from "react";
import type { KnowledgeItem } from "../../backend/src/knowledge/store";
import { knowledgeCategories } from "@/lib/knowledge";

export default function KnowledgeEditor({ item, onSave, onCancel }: {
  item: KnowledgeItem | null;
  onSave: (draft: Omit<KnowledgeItem, "id" | "updatedAt">) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [content, setContent] = useState(item?.content ?? "");
  const [category, setCategory] = useState(item?.category ?? "faq");
  const [price, setPrice] = useState(item?.price?.toString() ?? "");
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => { titleInput.current?.focus(); }, []);
  function resetApproval() { setActive(false); setError(""); }

  return <section className="panel knowledge-editor" aria-labelledby="editor-title">
    <div className="panel-heading"><div><p className="eyebrow">ТУРШИЛТЫН ЗАСВАР</p><h2 id="editor-title">{item ? "Мэдээлэл засах" : "Мэдээлэл нэмэх"}</h2></div></div>
    <form className="knowledge-form" aria-labelledby="editor-title" onSubmit={(event) => {
      event.preventDefault();
      const amount = price.trim() === "" ? undefined : Number(price);
      if (!title.trim() || !content.trim() || !Object.hasOwn(knowledgeCategories, category)) {
        setError("Гарчиг, агуулга болон ангиллаа бүрэн оруулна уу."); return;
      }
      if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
        setError("Үнэ нь 0 буюу түүнээс их хүчинтэй тоо байна."); return;
      }
      onSave({ title: title.trim(), content: content.trim(), category, active, ...(amount === undefined ? {} : { price: amount }) });
    }}>
      <label className="knowledge-wide">Гарчиг<input ref={titleInput} required value={title} onChange={(event) => { setTitle(event.target.value); resetApproval(); }} /></label>
      <label>Ангилал<select value={category} onChange={(event) => { setCategory(event.target.value as KnowledgeItem["category"]); resetApproval(); }}>
        {Object.entries(knowledgeCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Үнэ (₮, заавал биш)<input type="number" min="0" step="any" value={price} onChange={(event) => { setPrice(event.target.value); resetApproval(); }} /></label>
      <label className="knowledge-wide">Агуулга<textarea required rows={4} value={content} onChange={(event) => { setContent(event.target.value); resetApproval(); }} /></label>
      <p className="knowledge-help knowledge-wide">Шинэ болон засварласан мэдээлэл ноорог байна. Агуулга, ангилал эсвэл үнэ өөрчлөгдвөл дахин нягталж баталгаажуулна уу.</p>
      <label className="knowledge-approval knowledge-wide"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Мэдээллийг нягталж, баталгаажуулах (туршилт)</label>
      {error && <p className="knowledge-error knowledge-wide" role="alert">{error}</p>}
      <div className="knowledge-actions knowledge-wide"><button className="calls-button knowledge-save" type="submit">Туршилтад хадгалах</button><button className="calls-button" type="button" onClick={onCancel}>Болих</button></div>
    </form>
  </section>;
}
