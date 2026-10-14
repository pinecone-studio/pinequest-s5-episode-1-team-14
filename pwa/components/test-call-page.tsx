"use client";

import { useState } from "react";
import { Icon, PageHeader } from "./ui";

const RESULTS: Record<number, string> = {
  202: "Залгаж байна. Утас тань хэдэн секундэд дуугарна.",
  400: "Монголын 8 оронтой утасны дугаар оруулна уу.",
  429: "Хэт олон туршилт хийсэн байна. Хэдэн минутын дараа дахин оролдоно уу.",
  503: "Утасны шугам түр ажиллахгүй байна. Дараа дахин оролдоно уу.",
};

const TRIES = [
  "Ажлын цаг, үнэ, хаягийг асуух",
  "Цаг захиалах: өдөр, цаг, хүний тоо, нэрээ хэлэх",
  "Захиалгаа шалгуулах, цуцлах",
  "AI ярьж байхад нь таслаж ярих",
];

// Бизнесийн AI тухайн хүний утас руу залгаж, жинхэнэ дуудлага шиг туршуулна.
export default function TestCallPage() {
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "calling" | "done">("idle");
  const [message, setMessage] = useState("");

  async function call(event: React.FormEvent) {
    event.preventDefault();
    setStatus("calling");
    setMessage("");
    try {
      const response = await fetch("/api/test-call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
      setMessage(RESULTS[response.status] ?? "Залгаж чадсангүй. Дахин оролдоно уу.");
    } catch {
      setMessage("Сервертэй холбогдож чадсангүй.");
    }
    setStatus("done");
  }

  return <>
    <PageHeader title="Туршилтын дуудлага" subtitle="Таны бизнесийн AI туслах тан руу залгаж, харилцагч шиг ярилцана." />
    <section className="card test-call">
      <form className="form" onSubmit={call}>
        <label className="field field-wide" htmlFor="test-call-phone">Утасны дугаар</label>
        <div className="field-wide test-call-row">
          <input id="test-call-phone" className="input" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="99112233" maxLength={12} required
            value={phone} onChange={(event) => { setPhone(event.target.value); setStatus("idle"); }} />
          <button className="btn btn-primary" type="submit" disabled={status === "calling"}><Icon name="phone" size={14} />{status === "calling" ? "Залгаж байна…" : "Над руу залга"}</button>
        </div>
        {message && <p className="field-wide muted" role="status">{message}</p>}
      </form>
      <div className="test-call-tips">
        <h2 className="card-title">Юуг туршиж үзэх вэ</h2>
        <ul>{TRIES.map((item) => <li key={item}><Icon name="check" size={14} />{item}</li>)}</ul>
        <p className="muted">AI зөвхөн «Мэдээллийн сан»-д баталгаажсан мэдээллээр хариулна. Дуудлага «Дуудлагууд» хэсэгт бүртгэгдэнэ.</p>
      </div>
    </section>
  </>;
}
