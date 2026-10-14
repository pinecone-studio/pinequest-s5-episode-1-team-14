"use client";

import { useState } from "react";
import type { Booking } from "../../backend/src/calendar/googleCalendar";
import { groupBookings } from "@/lib/bookings";
import type { DataSource } from "@/lib/data-source";
import { formatUlaanbaatarTime } from "@/lib/date-time";
import { Banner, Empty, Icon, PageHeader, SourceBadge } from "./ui";

export default function BookingsPage({ bookings, source, now }: { bookings: Booking[]; source: DataSource; now: number }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"upcoming" | "past">("upcoming");
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
          {day.items.map((booking) => <li key={booking.id} className={booking === next ? "is-next" : view === "upcoming" && Date.parse(booking.endTime) < now ? "is-done" : undefined}>
            <p className="agenda-time"><time dateTime={booking.startTime}>{formatUlaanbaatarTime(booking.startTime).slice(11)}</time><small>{booking.durationMinutes} мин</small></p>
            <div>
              <p className="agenda-title">{booking.customerName}</p>
              <p className="agenda-sub">{booking.serviceName}{booking.partySize ? ` · ${booking.partySize} хүн` : ""} · {booking.phone}</p>
            </div>
            {booking === next ? <span className="badge badge-blue">Дараагийнх</span> : <span className="badge badge-green">Баталгаажсан</span>}
          </li>)}
        </ul>
      </div>) : <Empty title={search ? "Тохирох захиалга олдсонгүй" : view === "upcoming" ? "Ирэх захиалга алга" : "Өнгөрсөн захиалга алга"}
        text={search ? "Хайлтаа өөрчилж үзээрэй." : view === "upcoming" ? "AI туслах цаг захиалмагц энд харагдана." : "Өмнөх өдрүүдийн захиалга энд харагдана."} />}
      <p className="card-footer">Цагийг Улаанбаатарын цагаар харуулна. Сүүлийн 30 хоног болон ирэх захиалгууд.</p>
    </section>
  </>;
}
