"use client";

import { useState } from "react";
import type { Booking } from "../../backend/src/calendar/googleCalendar";
import { groupBookings } from "@/lib/bookings";
import type { DataSource } from "@/lib/data-source";
import { formatUlaanbaatarTime } from "@/lib/date-time";
import { Banner, Empty, Icon, PageHeader, SourceBadge } from "./ui";

const REMIND_RESULTS: Record<number, string> = {
  202: "Залгаж байна. Дуудлага «Дуудлагууд» хэсэгт бүртгэгдэнэ.",
  404: "Захиалга олдсонгүй. Хуудсаа шинэчилнэ үү.",
  422: "Захиалгын утасны дугаар буруу тул залгах боломжгүй.",
  429: "Цагт 5 дуудлагын хязгаарт хүрсэн. Хэдэн минутын дараа оролдоно уу.",
  503: "Утасны шугам холбогдоогүй байна.",
};

type RemindState = { step: "confirm" | "calling" | "done"; ok?: boolean; message?: string };

export default function BookingsPage({ bookings, source, now }: { bookings: Booking[]; source: DataSource; now: number }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"upcoming" | "past">("upcoming");
  const [remind, setRemind] = useState<Record<string, RemindState>>({});
  const setRemindState = (id: string, state: RemindState | null) => setRemind((current) => {
    const next = { ...current };
    if (state) next[id] = state;
    else delete next[id];
    return next;
  });

  async function sendReminder(id: string) {
    setRemindState(id, { step: "calling" });
    try {
      const response = await fetch("/api/remind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: id }) });
      setRemindState(id, { step: "done", ok: response.status === 202, message: REMIND_RESULTS[response.status] ?? "Залгаж чадсангүй. Дахин оролдоно уу." });
    } catch {
      setRemindState(id, { step: "done", ok: false, message: "Сервертэй холбогдож чадсангүй." });
    }
  }
  const search = query.trim().toLowerCase();
  const phoneSearch = search.replace(/[\s()+-]/g, "");
  const groups = groupBookings(bookings.filter((booking) => !search ||
    [booking.customerName, booking.serviceName].some((value) => value.toLowerCase().includes(search)) ||
    (/^\d+$/.test(phoneSearch) && booking.phone.includes(phoneSearch))), now);
  const days = groups[view];
  const count = (list: typeof days) => list.reduce((sum, day) => sum + day.items.length, 0);
  // Хамгийн ойрын, хараахан эхлээгүй захиалгыг тодруулна.
  const next = groups.upcoming.flatMap((day) => day.items).find((booking) => Date.parse(booking.startTime) >= now);

  return <>
    <PageHeader title="Захиалгууд" subtitle="Өнөөдөр болон ирэх өдрүүдэд хэн ирэх вэ."><SourceBadge source={source} /></PageHeader>
    {source === "demo" && <Banner>Жишээ захиалгуудыг харуулж байна. Эдгээр нь бодит харилцагч эсвэл Calendar-ийн захиалга биш.</Banner>}
    {source === "offline" && <Banner>Google Calendar-аас захиалгуудыг уншиж чадсангүй. Backend сервер болон Calendar-ийн тохиргоог шалгана уу.</Banner>}

    <section className="card" aria-label="Захиалгын хуваарь">
      <div className="toolbar">
        <label className="search"><span className="sr-only">Нэр, утас эсвэл үйлчилгээ</span><Icon name="search" size={15} />
          <input className="input" type="search" value={query} placeholder="Нэр, утас эсвэл үйлчилгээ хайх" disabled={!bookings.length} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="segmented" role="group" aria-label="Хугацаагаар шүүх">
          <button type="button" aria-pressed={view === "upcoming"} onClick={() => setView("upcoming")}>Ирэх<span className="count">{count(groups.upcoming)}</span></button>
          <button type="button" aria-pressed={view === "past"} onClick={() => setView("past")}>Өнгөрсөн<span className="count">{count(groups.past)}</span></button>
        </div>
      </div>
      {days.length > 0 ? days.map((day) => <div key={day.date}>
        <h2 className="day-head">{day.label}<span>{day.items.length} захиалга</span></h2>
        <ul className="agenda">
          {day.items.map((booking) => {
            const state = remind[booking.id];
            const reminded = remindedAt(booking) || (state?.step === "done" && state.ok);
            // Зөвхөн бодит өгөгдөлтэй, хараахан эхлээгүй захиалгад.
            const canRemind = source === "live" && Date.parse(booking.startTime) > now;
            return <li key={booking.id} className={booking === next ? "is-next" : view === "upcoming" && Date.parse(booking.endTime) < now ? "is-done" : undefined}>
              <p className="agenda-time"><time dateTime={booking.startTime}>{formatUlaanbaatarTime(booking.startTime).slice(11)}</time><small>{booking.durationMinutes} мин</small></p>
              <div>
                <p className="agenda-title">{booking.customerName}</p>
                <p className="agenda-sub">{booking.serviceName}{partySize(booking) ? ` · ${partySize(booking)} хүн` : ""} · {booking.phone}</p>
                {state?.message && <p className={state.ok ? "agenda-note" : "agenda-note is-error"} role="status">{state.message}</p>}
              </div>
              <div className="agenda-side">
                {reminded ? <span className="badge badge-amber">Сануулсан</span>
                  : booking === next ? <span className="badge badge-blue">Дараагийнх</span> : <span className="badge badge-green">Баталгаажсан</span>}
                {canRemind && (state?.step === "confirm"
                  ? <span className="agenda-actions">Залгах уу?
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => sendReminder(booking.id)}>Тийм</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemindState(booking.id, null)}>Үгүй</button>
                  </span>
                  : <button type="button" className="btn btn-ghost btn-sm" disabled={state?.step === "calling" || Boolean(state?.ok)}
                    onClick={() => setRemindState(booking.id, { step: "confirm" })}>
                    <Icon name="phone" size={13} />{state?.step === "calling" ? "Залгаж байна…" : "Сануулах"}
                  </button>)}
              </div>
            </li>;
          })}
        </ul>
      </div>) : <Empty title={search ? "Тохирох захиалга олдсонгүй" : view === "upcoming" ? "Ирэх захиалга алга" : "Өнгөрсөн захиалга алга"}
        text={search ? "Хайлтаа өөрчилж үзээрэй." : view === "upcoming" ? "AI туслах цаг захиалмагц энд харагдана." : "Өмнөх өдрүүдийн захиалга энд харагдана."} />}
      <p className="card-footer">Цагийг Улаанбаатарын цагаар харуулна. Сүүлийн 30 хоног болон ирэх захиалгууд.</p>
    </section>
  </>;
}

// Хүний тоо (ширээгээр тооцох горимд backend өгнө; хуучин захиалгад байхгүй).
const partySize = (booking: object) => (booking as { partySize?: number }).partySize;
// Сануулах дуудлага хийгдсэн мөч (backend өгнө).
const remindedAt = (booking: object) => (booking as { remindedAt?: string }).remindedAt;
