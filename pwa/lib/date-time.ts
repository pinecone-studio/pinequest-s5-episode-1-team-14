const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function formatUlaanbaatarTime(value: string) {
  const parts = Object.fromEntries(dateFormat.formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}
