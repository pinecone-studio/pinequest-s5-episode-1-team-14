const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function formatUlaanbaatarTime(value: string) {
  const parts = Object.fromEntries(dateFormat.formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

// Секундийг минут:секунд болгоно (жишээ нь 204 -> 3:24).
export function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Жагсаалтад: "дөнгөж сая", "12 мин өмнө", "3 цагийн өмнө", хуучин бол сар.өдөр.
export function formatRelative(value: string, now: number) {
  const minutes = Math.floor((now - Date.parse(value)) / 60000);
  if (minutes < 1) return "дөнгөж сая";
  if (minutes < 60) return `${minutes} мин өмнө`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} цагийн өмнө`;
  return formatUlaanbaatarTime(value).slice(5, 10);
}
