import { describe, it, expect } from 'vitest';
import { remainingDailyBudget } from '../expenseBudget';

/** Fixed WIB-ish reference clock (UTC+0 here is fine — we control `month`). */
const NOW = new Date('2026-11-03T00:00:00Z');

describe('remainingDailyBudget', () => {
  it('returns dailyAllowance = sisa / daysLeft for the live month', () => {
    const r = remainingDailyBudget('2026-11', 280_000, NOW);
    expect(r).not.toBeNull();
    expect(r!.daysLeft).toBe(28); // 30 - 3 + 1
    expect(r!.sisa).toBe(280_000);
    expect(r!.dailyAllowance).toBe(10_000);
  });

  it('rounds to whole rupiah', () => {
    const r = remainingDailyBudget('2026-11', 100_000, NOW);
    expect(r!.dailyAllowance).toBe(3571); // Math.round(100000/28)
  });

  it('returns a negative allowance when already over budget', () => {
    const r = remainingDailyBudget('2026-11', -14_000, NOW);
    expect(r!.dailyAllowance).toBe(-500);
    expect(r!.sisa).toBe(-14_000);
  });

  it('returns null for any month other than the live month', () => {
    expect(remainingDailyBudget('2026-10', 280_000, NOW)).toBeNull();
    expect(remainingDailyBudget('2026-12', 280_000, NOW)).toBeNull();
  });

  it('returns null for a malformed month key', () => {
    expect(remainingDailyBudget('2026/11', 1, NOW)).toBeNull();
    expect(remainingDailyBudget('2026-13', 1, NOW)).toBeNull();
    expect(remainingDailyBudget('garbage', 1, NOW)).toBeNull();
  });

  it('handles the last day of the month (daysLeft = 1)', () => {
    const lastDay = new Date('2026-11-30T12:00:00Z');
    const r = remainingDailyBudget('2026-11', 7_000, lastDay);
    expect(r!.daysLeft).toBe(1);
    expect(r!.dailyAllowance).toBe(7_000);
  });
});
