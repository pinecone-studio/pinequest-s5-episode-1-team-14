"use client";

import { useState } from "react";

const businessTypes = [
  "Шүдний эмнэлэг",
  "Эмнэлэг, клиник",
  "Гоо сайхан, салон",
  "Фитнес, спорт",
  "Боловсрол, сургалт",
  "Бусад",
];

const slotOptions = [15, 30, 45, 60, 90];

const defaults = {
  businessName: "",
  businessType: "",
  phone: "",
  address: "",
  openTime: "09:00",
  closeTime: "18:00",
  slotMinutes: 30,
  greeting: "Сайн байна уу, танд юугаар туслах вэ?",
  afterHoursMessage: "Одоо ажлын цаг дууссан байна. Нэр, утасны дугаараа үлдээвэл ажлын цагаар эргэн холбогдоно.",
};

export default function SettingsPage() {
  const [form, setForm] = useState(defaults);
  const [saved, setSaved] = useState(false);

  const hoursInvalid = form.closeTime <= form.openTime;

  function update<K extends keyof typeof defaults>(key: K, value: (typeof defaults)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function reset() {
    setForm(defaults);
    setSaved(false);
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (hoursInvalid) return;
    // TODO: backend рүү илгээх (жишээ нь fetch("/api/settings", { method: "PUT", body: JSON.stringify(form) }))
    setSaved(true);
  }

  return <>
    <div className="page-heading">
      <div>
        <p className="eyebrow">АЖЛЫН ОРЧНЫ ТОХИРГОО</p>
        <h1>Тохиргоо</h1>
        <p className="page-description">Бизнесийн мэдээлэл, ажлын цаг, AI туслахын хариултыг эндээс тохируулна.</p>
      </div>
      <span className="waiting-badge"><span aria-hidden="true" />Хадгалалт холбогдоогүй</span>
    </div>
    <p className="calls-notice">Өөрчлөлт одоогоор зөвхөн энэ хуудсанд харагдана. Backend холбогдсоны дараа хадгалагдана.</p>

    <form className="settings-form" onSubmit={save}>
      <section className="panel" aria-labelledby="business-title">
        <div className="panel-heading">
          <div><p className="eyebrow">1. БИЗНЕС</p><h2 id="business-title">Бизнесийн мэдээлэл</h2></div>
        </div>
        <div className="settings-grid">
          <label className="field">Бизнесийн нэр
            <input type="text" required value={form.businessName} placeholder="Жишээ: Мөнхийн шүдний эмнэлэг" onChange={(e) => update("businessName", e.target.value)} />
          </label>
          <label className="field">Бизнесийн төрөл
            <select required value={form.businessType} onChange={(e) => update("businessType", e.target.value)}>
              <option value="" disabled>Сонгоно уу</option>
              {businessTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="field">Холбоо барих утас
            <input type="tel" required inputMode="tel" pattern="[0-9]{8}" maxLength={8} title="8 оронтой утасны дугаар" value={form.phone} placeholder="99112233" onChange={(e) => update("phone", e.target.value.replace(/\D/g, "").slice(0, 8))} />
            <span className="field-hint">8 оронтой дугаар, зайгүй бичнэ.</span>
          </label>
          <label className="field">Хаяг
            <input type="text" value={form.address} placeholder="Дүүрэг, хороо, байр" onChange={(e) => update("address", e.target.value)} />
            <span className="field-hint">AI туслах харилцагчид хаягийг хэлэхэд ашиглана.</span>
          </label>
        </div>
      </section>

      <section className="panel" aria-labelledby="hours-title">
        <div className="panel-heading">
          <div><p className="eyebrow">2. АЖЛЫН ЦАГ</p><h2 id="hours-title">Ажлын цаг ба захиалга</h2></div>
          <span className="calls-timezone">Улаанбаатар · UTC+8</span>
        </div>
        <div className="settings-grid">
          <label className="field">Нээх цаг
            <input type="time" required value={form.openTime} onChange={(e) => update("openTime", e.target.value)} />
          </label>
          <label className="field">Хаах цаг
            <input type="time" required value={form.closeTime} onChange={(e) => update("closeTime", e.target.value)} />
          </label>
          <label className="field field-wide">Нэг захиалгын үргэлжлэх хугацаа
            <select value={form.slotMinutes} onChange={(e) => update("slotMinutes", Number(e.target.value))}>
              {slotOptions.map((minutes) => <option key={minutes} value={minutes}>{minutes} минут</option>)}
            </select>
            <span className="field-hint">Google Calendar дээр сул цагийг энэ хугацаагаар хуваан санал болгоно.</span>
          </label>
          {hoursInvalid && <p className="knowledge-error field-wide" role="alert">Хаах цаг нь нээх цагаас хойш байх ёстой.</p>}
        </div>
      </section>

      <section className="panel" aria-labelledby="assistant-title">
        <div className="panel-heading">
          <div><p className="eyebrow">3. AI ТУСЛАХ</p><h2 id="assistant-title">Дуудлагад хэлэх үг</h2></div>
        </div>
        <div className="settings-grid">
          <label className="field field-wide">Мэндчилгээ
            <textarea rows={3} maxLength={200} value={form.greeting} onChange={(e) => update("greeting", e.target.value)} />
            <span className="field-hint field-count">{form.greeting.length} / 200</span>
          </label>
          <label className="field field-wide">Ажлын цагаас гадуур хэлэх үг
            <textarea rows={3} maxLength={200} value={form.afterHoursMessage} onChange={(e) => update("afterHoursMessage", e.target.value)} />
            <span className="field-hint field-count">{form.afterHoursMessage.length} / 200</span>
          </label>
        </div>
        <p className="connection-note">Цагийг Улаанбаатарын цагаар (UTC+8) тохируулна.</p>
      </section>

      <div className="settings-actions">
        <button type="submit" className="calls-button settings-save" disabled={hoursInvalid}>Хадгалах</button>
        <button type="button" className="calls-button" onClick={reset}>Анхны утга руу буцаах</button>
        {saved && <p className="settings-status" role="status">Өөрчлөлт хадгалагдлаа.</p>}
      </div>
    </form>
  </>;
}