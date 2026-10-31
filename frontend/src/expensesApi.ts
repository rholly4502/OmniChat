import { ApiError } from './api';

/** Base path of the Pengeluaran read API (see `ExpensesController`). */
export const EXPENSES_URL = '/api/expenses';

/** Credentials plus injectable transport, shared by every expenses call. */
export interface ExpensesRequestOptions {
  /** Sent as `X-Api-Key`; absent means "no auth header". */
  apiKey?: string;
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Aborts an in-flight request when the caller unmounts or switches key. */
  signal?: AbortSignal;
}

/** One ledger row as served by `GET /api/expenses`. */
export interface ExpenseItem {
  id: number;
  /** YYYY-MM-DD (WIB). */
  tanggal: string;
  /** HH:MM (WIB). */
  waktu: string;
  kategori: string;
  keterangan: string;
  /** Rupiah, integer. */
  nominal: number;
}

/** Paged transaction envelope from `GET /api/expenses`. */
export interface ExpensePage {
  month: string;
  page: number;
  pageSize: number;
  total: number;
  items: ExpenseItem[];
}

/** Monthly totals plus budget/saving target from `GET /api/expenses/summary`. */
export interface ExpenseSummary {
  month: string;
  total: number;
  perKategori: Record<string, number>;
  targetNabung: number | null;
  anggaran: number | null;
  sisaAnggaran: number | null;
  catatan?: string | null;
}

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { 'X-Api-Key': apiKey } : {};
}

async function request(path: string, options: ExpensesRequestOptions): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(path, {
    method: 'GET',
    headers: authHeaders(options.apiKey),
    signal: options.signal,
  });

  if (!res.ok) {
    throw new ApiError(res.status, res.headers?.get?.('Retry-After') ?? null);
  }

  return res;
}

/** Fetch one page of transactions for a month, newest first. */
export async function listExpenses(
  month: string,
  options: ExpensesRequestOptions = {},
  page = 1,
  pageSize = 200,
): Promise<ExpensePage> {
  const res = await request(`${EXPENSES_URL}?month=${encodeURIComponent(month)}&page=${page}&pageSize=${pageSize}`, options);
  return (await res.json()) as ExpensePage;
}

/** Fetch the monthly totals and target. */
export async function getExpenseSummary(
  month: string,
  options: ExpensesRequestOptions = {},
): Promise<ExpenseSummary> {
  const res = await request(`${EXPENSES_URL}/summary?month=${encodeURIComponent(month)}`, options);
  return (await res.json()) as ExpenseSummary;
}

/** Download the monthly expense report as CSV bytes (RFC 4180, UTF-8 with BOM). */
export async function exportExpensesCsv(
  month: string,
  options: ExpensesRequestOptions = {},
): Promise<Blob> {
  const res = await request(`${EXPENSES_URL}/export?month=${encodeURIComponent(month)}`, options);
  return await res.blob();
}

/** Download the monthly expense report as PDF bytes (single-page A4). */
export async function exportExpensesPdf(
  month: string,
  options: ExpensesRequestOptions = {},
): Promise<Blob> {
  const res = await request(`${EXPENSES_URL}/export/pdf?month=${encodeURIComponent(month)}`, options);
  return await res.blob();
}

/** One monthly trend point from `GET /api/expenses/trend`. */
export interface ExpenseTrendPoint {
  /** YYYY-MM (WIB). */
  month: string;
  /** Total spend for that month (zero-filled for empty months). */
  total: number;
}

/** Envelope from `GET /api/expenses/trend`. */
export interface ExpenseTrend {
  /** Number of trailing months requested. */
  months: number;
  /** Chronological points (oldest first). */
  points: ExpenseTrendPoint[];
}

/** Fetch the monthly spend trend over the last N trailing months (1-24). */
export async function getExpenseTrend(
  options: ExpensesRequestOptions = {},
  months = 6,
): Promise<ExpenseTrend> {
  const res = await request(`${EXPENSES_URL}/trend?months=${months}`, options);
  return (await res.json()) as ExpenseTrend;
}

/** Format an integer rupiah amount for display, e.g. "Rp 20.000". */

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}
