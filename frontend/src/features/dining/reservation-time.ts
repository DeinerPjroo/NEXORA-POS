function parts(timestamp: number, timezone: string) {
  const fields = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp))
  return Object.fromEntries(fields.map((f) => [f.type, f.value]))
}
function offsetAt(timestamp: number, timezone: string) {
  const p = parts(timestamp, timezone)
  return (
    Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second),
    ) -
    Math.floor(timestamp / 1000) * 1000
  )
}
function offsetText(offset: number) {
  const minutes = Math.abs(Math.round(offset / 60000))
  return (
    (offset >= 0 ? '+' : '-') +
    String(Math.floor(minutes / 60)).padStart(2, '0') +
    ':' +
    String(minutes % 60).padStart(2, '0')
  )
}
export function localMinute(instant: string | number, timezone: string) {
  const p = parts(typeof instant === 'number' ? instant : Date.parse(instant), timezone)
  return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute
}
export function reservationTimes(local: string, timezone: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return []
  const base = Date.parse(local + ':00Z')
  if (!Number.isFinite(base)) return []
  const offsets = new Set(
    [-36, -24, -12, 0, 12, 24, 36].map((h) => offsetAt(base + h * 3600000, timezone)),
  )
  return [...offsets]
    .map((offset) => ({ offset, instant: base - offset }))
    .filter((c) => localMinute(c.instant, timezone) === local)
    .sort((a, b) => a.instant - b.instant)
    .map((c) => local + ':00' + offsetText(c.offset))
}
export function instantChoice(instant: string | number, timezone: string) {
  const stamp = typeof instant === 'number' ? instant : Date.parse(instant)
  return localMinute(stamp, timezone) + ':00' + offsetText(offsetAt(stamp, timezone))
}
