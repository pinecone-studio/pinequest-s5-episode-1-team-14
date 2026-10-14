"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { DataSource } from "@/lib/data-source";
import type { BusinessSettings } from "@/lib/settings";
import { Banner, Icon, PageHeader, SourceBadge } from "./ui";

// Бизнесийн нэр, AI-ийн дуу хоолой, холбогдсон дугаар. Дууг сонгохоос өмнө жишээг нь сонсоно.
export default function SettingsPage({ settings, source }: { settings: BusinessSettings | null; source: DataSource }) {
  const router = useRouter();
  const [name, setName] = useState(settings?.name ?? "");
  const [voice, setVoice] = useState(settings?.voice ?? "");
  const [playing, setPlaying] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  function preview(key: string) {
    audio.current?.pause();
    if (playing === key) {
      setPlaying("");
      return;
    }
    const player = new Audio(`/voices/${key}.wav`);
    player.onended = () => setPlaying("");
    audio.current = player;
    setPlaying(key);
    player.play().catch(() => setPlaying(""));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (source !== "live") return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, voice: voice || null }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setMessage("Хадгаллаа. Дараагийн дуудлагаас эхлэн шинэ тохиргоо үйлчилнэ.");
      router.refresh();
    } catch {
      setMessage("Хадгалж чадсангүй. Нэрээ шалгаад дахин оролдоно уу.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <PageHeader title="Тохиргоо" subtitle="Бизнесийн нэр, AI туслахын дуу хоолой.">
      <SourceBadge source={source} />
    </PageHeader>
    {source === "demo" && <Banner>Жишээ горим. Өөрчлөлт хадгалагдахгүй.</Banner>}
    {!settings && <Banner>Backend сервер рүү хүрч чадсангүй. Түр хүлээгээд дахин оролдоно уу.</Banner>}

    {settings && <form className="settings" onSubmit={save}>
      <section className="card" aria-labelledby="business-title">
        <div className="card-header"><h2 className="card-title" id="business-title">Бизнес</h2></div>
        <div className="form">
          <label className="field field-wide">
            <span>Бизнесийн нэр</span>
            <input className="input" value={name} maxLength={80} required onChange={(event) => setName(event.target.value)} />
            <small className="muted">AI өөрийгөө энэ нэрээр танилцуулна.</small>
          </label>
          <div className="field field-wide">
            <span>Утасны дугаар</span>
            {settings.numbers.length
              ? settings.numbers.map((number) => <p key={number} className="num settings-number"><Icon name="phone" size={14} />{number}</p>)
              : <p className="muted">Дугаар хараахан холбогдоогүй. Туршилтын дуудлагаар AI-аа туршиж болно.</p>}
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="voice-title">
        <div className="card-header"><h2 className="card-title" id="voice-title">Дуу хоолой</h2></div>
        <div className="voice-list" role="radiogroup" aria-labelledby="voice-title">
          {[{ key: "", label: "Анхдагч дуу" }, ...settings.voices].map((option) => <label key={option.key} className={"voice-option" + (voice === option.key ? " is-selected" : "")}>
            <input type="radio" name="voice" value={option.key} checked={voice === option.key} onChange={() => setVoice(option.key)} />
            <Icon name="voice" />
            <span className="voice-label">{option.label}</span>
            {option.key && <button type="button" className="btn btn-sm" onClick={() => preview(option.key)} aria-label={(playing === option.key ? "Зогсоох: " : "Сонсох: ") + option.label}>
              <Icon name={playing === option.key ? "pause" : "play"} size={13} />{playing === option.key ? "Зогсоох" : "Сонсох"}
            </button>}
          </label>)}
        </div>
        <p className="card-footer">Жишээ дуу утсаар сонсогдох чанартай. Сонгосон дуугаар бүх дуудлага явагдана.</p>
      </section>

      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={saving || source !== "live"}>{saving ? "Хадгалж байна…" : "Хадгалах"}</button>
        {message && <p className="muted" role="status">{message}</p>}
      </div>
    </form>}
  </>;
}
