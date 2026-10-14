import type { Metadata } from "next";
import Link from "next/link";
import { LiveCalls } from "@/components/charts";
import { IntentIcon } from "@/components/intent-icon";
import { Delta, Empty, Icon, PageHeader, SourceBadge } from "@/components/ui";
import { summarizeAnalytics } from "@/lib/analytics";
import { getBookings } from "@/lib/bookings";
import { callIntents, callStatuses } from "@/lib/call-labels";
import { getCalls } from "@/lib/calls";
import { formatDuration, formatRelative } from "@/lib/date-time";
import { callsWithin, recentDays } from "@/lib/overview";

export const metadata: Metadata = { title: "Ерөнхий тойм · CallAI" };

const STATUS_TONE = { active: "badge-blue", completed: "badge-green", failed: "badge-red", handed_off: "badge-amber" } as const;
const WEEKDAYS = ["Ня", "Да", "Мя", "Лх", "Пү", "Ба", "Бя"];
export default async function DashboardPage() {
  const [{ calls, source }, bookings] = await Promise.all([getCalls(), getBookings()]);
  const now = Date.now();
  const days = recentDays(calls, 7, now);
  const summary = summarizeAnalytics(callsWithin(calls, days), []);
  const hasCalls = source !== "offline";
  const hasBookings = bookings.source !== "offline";
  const today = days[days.length - 1].calls;
  const busiest = Math.max(1, ...days.map((day) => day.calls));
  const active = calls.filter((call) => call.status === "active");
  const upcoming = bookings.bookings.filter((booking) => Date.parse(booking.startTime) >= now).length;
  const rate = hasCalls ? summary.conversionRate : null;
  const dash = <><span aria-hidden="true">—</span><span className="sr-only">Мэдээлэл алга</span></>;

  return <>
    <PageHeader title="Ерөнхий тойм" subtitle="AI туслахын өнөөдрийн ажил."><SourceBadge source={source} /></PageHeader>

    <LiveCalls calls={active.map(({ id, callerPhone, startedAt }) => ({ id, callerPhone, startedAt }))} />

    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-main">
        <p className="hero-status">
          <span className={`eq${hasCalls ? "" : " is-off"}`} aria-hidden="true"><i /><i /><i /><i /></span>
          {active.length ? "Яг одоо ярьж байна" : hasCalls ? "Дуудлага хүлээж байна" : "Холбогдоогүй"}
        </p>
        <h2 className="hero-label" id="hero-title">Өнөөдрийн дуудлага</h2>
        <p className="hero-row">
          <span className="hero-value">{hasCalls ? today : dash}</span>
          {hasCalls && <Delta value={today - days[days.length - 2].calls} suffix="өчигдрөөс" />}
        </p>
      </div>

      {/* Долоо хоног: өнөөдөр тодорсон, бусад нь саарал. Өдөр бүрийн тоо title-д. */}
      <div className="week" role="img" aria-label={`Сүүлийн 7 хоногийн дуудлага: ${days.map((day) => `${day.date} ${day.calls}`).join(", ")}`}>
        {days.map((day, index) => {
          const isToday = index === days.length - 1;
          const [year, month, date] = day.date.split("-").map(Number);
          return <div className="week-day" key={day.date} title={`${day.date.replace(/-/g, ".")}: ${day.calls} дуудлага`}>
            <span className="week-track"><span className={`week-bar${isToday ? " is-today" : ""}`} style={{ height: `${Math.max(4, day.calls / busiest * 100)}%` }} /></span>
            <span className={`week-label${isToday ? " is-today" : ""}`}>{WEEKDAYS[new Date(Date.UTC(year, month - 1, date)).getUTCDay()]}</span>
          </div>;
        })}
      </div>

      <dl className="hero-side">
        <div>
          <dt>Захиалга болсон</dt>
          <dd>{rate === null ? dash : `${rate.toFixed(0)}%`}</dd>
          <svg className="ring" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="16" /><circle className="ring-value" cx="20" cy="20" r="16" strokeDasharray={`${(rate ?? 0) / 100 * 100.5} 100.5`} />
          </svg>
        </div>
        <div><dt>Дундаж хугацаа</dt><dd>{hasCalls && summary.averageDuration !== null ? formatDuration(summary.averageDuration) : dash}</dd></div>
        <div><dt>Ирэх захиалга</dt><dd>{hasBookings ? upcoming : dash}</dd></div>
      </dl>
    </section>

    <section className="card" aria-labelledby="recent-title">
      <div className="card-header">
        <h2 className="card-title" id="recent-title">Сүүлийн дуудлагууд</h2>
        <Link className="link" href="/calls">Бүгд <Icon name="arrow" size={14} /></Link>
      </div>
      {calls.length ? <ul className="feed">
        {calls.slice(0, 6).map((call) => {
          return <li key={call.id}>
            <IntentIcon intent={call.intent} />
            <div className="feed-main">
              <p className="feed-title">{call.callerPhone ?? "Дугаар тодорхойгүй"}</p>
              <p className="feed-sub">{call.intent ? callIntents[call.intent] : "Зорилго тодорхойгүй"}</p>
            </div>
            <span className="feed-meta">{call.status === "active" ? "" : formatDuration(call.duration)}</span>
            <time className="feed-meta feed-time" dateTime={call.startedAt}>{formatRelative(call.startedAt, now)}</time>
            <span className={`badge ${STATUS_TONE[call.status]}`}>{callStatuses[call.status]}</span>
          </li>;
        })}
      </ul> : <Empty title="Дуудлага хараахан алга" text={hasCalls ? "Анхны дуудлага ирмэгц энд харагдана." : "Backend сервер ажиллаж эхэлмэгц харагдана."} />}
    </section>
  </>;
}
