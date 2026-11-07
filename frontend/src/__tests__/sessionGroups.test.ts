import { describe, expect, it } from 'vitest';
import { groupSessionsByDate } from '../sessionGroups';
import type { ChatSession } from '../types';

const GUID_A = '11111111-1111-1111-1111-111111111111';
const GUID_B = '22222222-2222-2222-2222-222222222222';
const GUID_C = '33333333-3333-3333-3333-333333333333';

function session(overrides: Partial<ChatSession> & { id: string }): ChatSession {
  return { title: 'Sesi', messages: [], createdAt: 0, updatedAt: Date.now(), ...overrides };
}

const NOW = new Date('2026-11-07T12:00:00Z').getTime(); // Saturday

describe('groupSessionsByDate', () => {
  it('returns an empty list for no sessions', () => {
    expect(groupSessionsByDate([], NOW)).toEqual([]);
  });

  it('puts pinned server conversations first, regardless of age', () => {
    const old = NOW - 90 * 24 * 60 * 60 * 1000;
    const sessions = [
      session({ id: GUID_A, updatedAt: old }),
      session({ id: GUID_B, updatedAt: NOW, isPinned: true }),
    ];
    const groups = groupSessionsByDate(sessions, NOW);
    expect(groups[0].key).toBe('pinned');
    expect(groups[0].sessions.map((s) => s.id)).toEqual([GUID_B]);
  });

  it('groups unpinned server conversations by recency', () => {
    const day = 24 * 60 * 60 * 1000;
    const sessions = [
      session({ id: GUID_A, updatedAt: NOW - 10 * day }),      // older
      session({ id: GUID_B, updatedAt: NOW - 3 * day }),        // week
      session({ id: GUID_C, updatedAt: NOW - day }),            // yesterday
      session({ id: 'draft_1', updatedAt: NOW }),               // draft
    ];
    const groups = groupSessionsByDate(sessions, NOW);
    const keys = groups.map((g) => g.key);
    expect(keys).toEqual(['yesterday', 'week', 'older', 'drafts']);
    expect(groups.find((g) => g.key === 'yesterday')!.sessions.map((s) => s.id)).toEqual([GUID_C]);
    expect(groups.find((g) => g.key === 'week')!.sessions.map((s) => s.id)).toEqual([GUID_B]);
    expect(groups.find((g) => g.key === 'older')!.sessions.map((s) => s.id)).toEqual([GUID_A]);
  });

  it('labels today vs yesterday vs week correctly at the boundaries', () => {
    const day = 24 * 60 * 60 * 1000;
    const todayStart = new Date('2026-11-07T00:00:00Z').getTime();
    const sessions = [
      session({ id: GUID_A, updatedAt: todayStart + 1000 }),            // today
      session({ id: GUID_B, updatedAt: todayStart - day + 1000 }),      // yesterday
      session({ id: GUID_C, updatedAt: todayStart - 6 * day }),         // exactly 7 days back -> week
    ];
    const groups = groupSessionsByDate(sessions, NOW);
    expect(groups.map((g) => g.key)).toEqual(['today', 'yesterday', 'week']);
  });

  it('keeps drafts last and never emits empty buckets', () => {
    const sessions = [
      session({ id: 'draft_1', updatedAt: NOW }),
      session({ id: 'draft_2', updatedAt: NOW }),
    ];
    const groups = groupSessionsByDate(sessions, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('drafts');
  });

  it('splits pinned, unpinned, and drafts into distinct buckets', () => {
    const sessions = [
      session({ id: GUID_A, updatedAt: NOW, isPinned: true }),
      session({ id: GUID_B, updatedAt: NOW - 1000 }),
      session({ id: 'draft_1', updatedAt: NOW }),
    ];
    const groups = groupSessionsByDate(sessions, NOW);
    expect(groups.map((g) => g.key)).toEqual(['pinned', 'today', 'drafts']);
  });
});
