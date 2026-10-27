import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api';
import { getExpenseSummary, listExpenses, type ExpenseItem, type ExpenseSummary } from '../expensesApi';

/** Wall-clock now in WIB (UTC+7). */
function wibNow(): Date {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

/** Current WIB month key as YYYY-MM. */
export function currentMonthKey(date: Date = wibNow()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Cap on how many list pages the hook will fetch (safety valve for a huge ledger). */
const MAX_PAGES = 20;

export interface UseExpensesResult {
  month: string;
  setMonth: (month: string) => void;
  summary: ExpenseSummary | null;
  items: ExpenseItem[];
  total: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads the Pengeluaran summary and all transaction pages for a month. Re-fetches
 * when the month, API key, or a manual `reload()` changes.
 */
export function useExpenses(apiKey?: string): UseExpensesResult {
  const [month, setMonth] = useState(currentMonthKey);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const options = { apiKey, signal: controller.signal };

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [summaryResult, firstPage] = await Promise.all([
          getExpenseSummary(month, options),
          listExpenses(month, options, 1),
        ]);

        const collected = [...firstPage.items];
        let page = 2;
        while (collected.length < firstPage.total && page <= MAX_PAGES) {
          const next = await listExpenses(month, options, page);
          collected.push(...next.items);
          if (next.items.length === 0) break;
          page++;
        }

        if (cancelled) return;
        setSummary(summaryResult);
        setItems(collected);
        setTotal(firstPage.total);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof ApiError ? `Gagal memuat data (${err.status}).` : 'Gagal memuat data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [month, apiKey, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { month, setMonth, summary, items, total, loading, error, reload };
}
