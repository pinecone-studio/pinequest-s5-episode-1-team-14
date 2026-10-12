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

  return <section className="card section-below" aria-labelledby="editor-title">
    <div className="card-header"><h2 className="card-title" id="editor-title">{item ? "Мэдээлэл засах" : "Мэдээлэл нэмэх"}</h2><span className="card-meta">Жишээ горим</span></div>
    <form className="form" aria-labelledby="editor-title" onSubmit={(event) => {
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
      <label className="field field-wide">Гарчиг<input className="input" ref={titleInput} required value={title} onChange={(event) => { setTitle(event.target.value); resetApproval(); }} /></label>
      <label className="field">Ангилал<select className="input" value={category} onChange={(event) => { setCategory(event.target.value as KnowledgeItem["category"]); resetApproval(); }}>
        {Object.entries(knowledgeCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="field">Үнэ (₮, заавал биш)<input className="input" type="number" min="0" step="any" value={price} onChange={(event) => { setPrice(event.target.value); resetApproval(); }} /></label>
      <label className="field field-wide">Агуулга<textarea className="input textarea" required rows={4} value={content} onChange={(event) => { setContent(event.target.value); resetApproval(); }} /></label>
      <label className="check field-wide"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        <span>Мэдээллийг нягталж, баталгаажуулах<small>Агуулга, ангилал эсвэл үнэ өөрчлөгдвөл дахин баталгаажуулна.</small></span></label>
      {error && <p className="form-error field-wide" role="alert">{error}</p>}
      <div className="form-actions field-wide"><button className="btn btn-primary" type="submit">Хадгалах</button><button className="btn" type="button" onClick={onCancel}>Болих</button></div>
    </form>
  </section>;
}
