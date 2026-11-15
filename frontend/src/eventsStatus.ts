/** Expiry status of a curated promo event relative to a reference day. */
export type EventStatus = 'aktif' | 'segera' | 'kedaluwarsa' | 'tanpa-batas';

/** Parse a YYYY-MM-DD day into UTC ms (calendar date; ignores time-of-day). */
function parseDay(yyyymmdd: string): number {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Classify a promo event by its end date (`berlakuSampai`, YYYY-MM-DD) against
 * `today` (also YYYY-MM-DD): expired when the end is in the past, "segera"
 * when it ends within the next 7 days, otherwise active, and tanpa-batas when
 * no end date is set.
 */
export function eventStatus(
  berlakuSampai: string | null | undefined,
  today: string,
): EventStatus {
  if (!berlakuSampai) return 'tanpa-batas';
  const end = parseDay(berlakuSampai);
  const now = parseDay(today);
  if (end < now) return 'kedaluwarsa';
  if (end - now <= 7 * 24 * 60 * 60 * 1000) return 'segera';
  return 'aktif';
}

/**
 * Whole calendar days from `today` to the event end date (`berlakuSampai`).
 * Negative when the end date has passed; null when no end date is set. Both
 * dates are normalized to UTC midnight so the difference is always whole days.
 */
export function daysRemaining(
  berlakuSampai: string | null | undefined,
  today: string,
): number | null {
  if (!berlakuSampai) return null;
  const diffMs = parseDay(berlakuSampai) - parseDay(today);
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

/**
 * Short Indonesian countdown label for an active promo (`berlakuSampai` set
 * and not yet expired). Returns null for events with no end date or that are
 * already expired — those carry their own chip/dimming and need no countdown.
 */
export function countdownLabel(
  berlakuSampai: string | null | undefined,
  today: string,
): string | null {
  const status = eventStatus(berlakuSampai, today);
  if (status === 'tanpa-batas' || status === 'kedaluwarsa') return null;
  const n = daysRemaining(berlakuSampai, today);
  if (n === null) return null;
  if (n === 0) return 'berakhir hari ini';
  if (n === 1) return 'besok berakhir';
  return `${n} hari lagi`;
}

/** Chip label + classes per event status (used by the event card). */
export const STATUS_CHIP: Record<EventStatus, { text: string; cls: string }> = {
  aktif: { text: 'Aktif', cls: 'border-chill-emerald/50 text-chill-emerald bg-chill-emerald/10' },
  segera: { text: 'Segera berakhir', cls: 'border-chill-indigo/50 text-chill-indigo bg-chill-indigo/10' },
  kedaluwarsa: { text: 'Kedaluwarsa', cls: 'border-chill-red/50 text-chill-red bg-chill-red/10' },
  'tanpa-batas': { text: '', cls: '' },
};
