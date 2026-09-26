export type PublicSlot = { id: string; startsAt: string; endsAt: string; status: 'open' | 'unavailable' };
export const TIME_ZONE = 'Asia/Taipei';
const parts = (value: Date | string) => new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).formatToParts(typeof value === 'string' ? new Date(value) : value).reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {});
export function taipeiDate(value: Date | string = new Date()): string {
  const p = parts(value); return `${p.year}-${p.month}-${p.day}`;
}
export function taipeiInput(value: string): string {
  const p = parts(value); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function taipeiToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+08:00`);
  return Number.isFinite(date.getTime()) && taipeiInput(date.toISOString()) === value ? date.toISOString() : null;
}
export function parsePublicSlots(value: unknown): PublicSlot[] {
  if (!value || typeof value !== 'object' || !('slots' in value) || !Array.isArray(value.slots)) throw new Error('invalid availability');
  const seen = new Set<string>();
  return value.slots.map((slot: unknown) => {
    if (!slot || typeof slot !== 'object') throw new Error('invalid availability');
    const row = slot as Record<string, unknown>;
    if (typeof row.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.id) || seen.has(row.id)
      || typeof row.startsAt !== 'string' || typeof row.endsAt !== 'string'
      || !Number.isFinite(Date.parse(row.startsAt)) || !Number.isFinite(Date.parse(row.endsAt))
      || Date.parse(row.endsAt) <= Date.parse(row.startsAt) || !['open', 'unavailable'].includes(String(row.status))) throw new Error('invalid availability');
    seen.add(row.id);
    return { id: row.id, startsAt: row.startsAt, endsAt: row.endsAt, status: row.status as PublicSlot['status'] };
  });
}
export function slotsForDay(slots: PublicSlot[], date: string): PublicSlot[] {
  const start = Date.parse(`${date}T00:00:00+08:00`);
  return slots.filter((slot) => Date.parse(slot.startsAt) < start + 86400000 && Date.parse(slot.endsAt) > start);
}
export function openSlotsForDay(slots: PublicSlot[], date: string, now = Date.now()): PublicSlot[] {
  // A cross-midnight slot is selected on its start day only; show its end date.
  return slotsForDay(slots, date).filter((slot) => slot.status === 'open' && taipeiDate(slot.startsAt) === date && Date.parse(slot.startsAt) > now);
}
export function slotPreference(slot: PublicSlot): string {
  const start = taipeiInput(slot.startsAt); const end = taipeiInput(slot.endsAt);
  return `${start.slice(0, 10).replaceAll('-', '/')} ${start.slice(11)}–${start.slice(0, 10) === end.slice(0, 10) ? end.slice(11) : end.replace('T', ' ')}（台北時間）`;
}
