import type { ChatSession } from './types';
import { isServerConversation } from './hooks/useServerHistory';

/**
 * One labelled bucket of sessions, rendered as a subsection header in the
 * sidebar history list.
 */
export interface SessionGroup {
  /** Stable key for the group (used as the React key). */
  key: string;
  /** Localized heading shown above the bucket. */
  label: string;
  /** Sessions that belong to this bucket, in display order. */
  sessions: ChatSession[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the local calendar day for a timestamp (ms). */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Split sessions into labelled recency buckets for the sidebar history list.
 *
 * Ordering contract (mirrors `sortSessions`, so pinning keeps its meaning):
 *   1. Pinned server conversations (a "Disematkan" bucket, regardless of age).
 *   2. Unpinned server conversations grouped by recency of `updatedAt`:
 *      Hari Ini / Kemarin / 7 hari terakhir / Sebelumnya.
 *   3. Local drafts (non-server ids), which have no server timestamp meaning.
 *
 * Empty buckets are omitted, so the list never shows an empty heading. The
 * function is pure and deterministic for a given `now`, which keeps it easy to
 * unit-test without mocking the clock.
 */
export function groupSessionsByDate(sessions: ChatSession[] = [], now = Date.now()): SessionGroup[] {
  const server = sessions.filter((s) => isServerConversation(s.id));
  const drafts = sessions.filter((s) => !isServerConversation(s.id));

  const pinned = server.filter((s) => s.isPinned);
  const unpinned = server.filter((s) => !s.isPinned);

  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - DAY_MS;
  const weekStart = todayStart - 6 * DAY_MS; // last 7 calendar days inclusive

  const buckets: Record<'today' | 'yesterday' | 'week' | 'older', ChatSession[]> = {
    today: [],
    yesterday: [],
    week: [],
    older: [],
  };

  for (const s of unpinned) {
    const updated = s.updatedAt || s.createdAt;
    if (updated >= todayStart) buckets.today.push(s);
    else if (updated >= yesterdayStart) buckets.yesterday.push(s);
    else if (updated >= weekStart) buckets.week.push(s);
    else buckets.older.push(s);
  }

  const groups: SessionGroup[] = [];
  if (pinned.length) groups.push({ key: 'pinned', label: 'Disematkan', sessions: pinned });
  if (buckets.today.length) groups.push({ key: 'today', label: 'Hari Ini', sessions: buckets.today });
  if (buckets.yesterday.length) groups.push({ key: 'yesterday', label: 'Kemarin', sessions: buckets.yesterday });
  if (buckets.week.length) groups.push({ key: 'week', label: '7 hari terakhir', sessions: buckets.week });
  if (buckets.older.length) groups.push({ key: 'older', label: 'Sebelumnya', sessions: buckets.older });
  if (drafts.length) groups.push({ key: 'drafts', label: 'Draf', sessions: drafts });
  return groups;
}
