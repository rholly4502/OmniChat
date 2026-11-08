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
  /** Active day count for partial-month targets (null = full month). */
  hari?: number | null;
  catatan?: string | null;
}

/** Fields that can be written for a new or edited expense row. */
export interface ExpenseWritePayload {
  /** YYYY-MM-DD (WIB). */
  tanggal: string;
  /** HH:MM (WIB), optional. */
  waktu?: string;
  kategori: string;
  keterangan: string;
  /** Rupiah, positive integer. */
  nominal: number;
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

async function requestJson(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: ExpenseWritePayload,
  options: ExpensesRequestOptions = {},
): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = { ...authHeaders(options.apiKey) };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await doFetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: options.signal,
  });

  if (!res.ok) {
    throw new ApiError(res.status, res.headers?.get?.('Retry-After') ?? null);
  }

  return res;
}

/** Create a new expense row (operator only). Returns the created row. */
export async function createExpense(
  payload: ExpenseWritePayload,
  options: ExpensesRequestOptions = {},
): Promise<ExpenseItem> {
  const res = await requestJson(EXPENSES_URL, 'POST', payload, options);
  return (await res.json()) as ExpenseItem;
}

/** Update an existing expense row (operator only). Returns the updated row. */
export async function updateExpense(
  id: number,
  payload: ExpenseWritePayload,
  options: ExpensesRequestOptions = {},
): Promise<ExpenseItem> {
  const res = await requestJson(`${EXPENSES_URL}/${id}`, 'PUT', payload, options);
  return (await res.json()) as ExpenseItem;
}

/** Delete an expense row (operator only). */
export async function deleteExpense(id: number, options: ExpensesRequestOptions = {}): Promise<void> {
  await requestJson(`${EXPENSES_URL}/${id}`, 'DELETE', undefined, options);
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

/** All-time cash-on-hand from `GET /api/expenses/sisa`. */
export interface ExpenseSisa {
  /** Total income (pemasukan) across all months. */
  totalPemasukan: number;
  /** Total spending across all months (income rows are excluded). */
  totalPengeluaran: number;
  /** Remaining cash = totalPemasukan - totalPengeluaran. */
  sisaUang: number;
}

/** Fetch all-time remaining cash (gaji minus total pengeluaran). */
export async function getExpenseSisa(
  options: ExpensesRequestOptions = {},
): Promise<ExpenseSisa> {
  const res = await request(`${EXPENSES_URL}/sisa`, options);
  return (await res.json()) as ExpenseSisa;
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
  /** Per-category spend breakdown for that month (Nabung excluded), largest first. */
  categories?: { kategori: string; total: number }[];
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

/** One category with its month total (advice trend block). */
export interface CategoryTrendItem {
  kategori: string;
  total: number;
}

/** End-of-month spend projection from the run-rate so far. */
export interface ProjectionDto {
  spentSoFar: number;
  daysElapsed: number;
  daysInMonth: number;
  projectedTotal: number;
  anggaran: number;
  projectedOver: number;
}

/** One PC-goal part and its price. */
export interface PartItem {
  name: string;
  price: number;
}

/** PC-goal saving estimate block from the advice payload. */
export interface PcGoalDto {
  parts: PartItem[];
  totalNeeded: number;
  nabungSoFar: number;
  percentCollected: number;
  remaining: number;
  potentialSavingPerMonth: number;
  monthsToReach: number | null;
}

/** Rotating daily suggestions from the advice payload (P1-6). */
export interface DailySuggestionsDto {
  /** Today's frugal, weight-loss-aligned breakfast. */
  sarapan: string;
  makanSiang: string;
  makanMalam: string;
  /** Estimated total cost for today's three-meal set (frugal kos range). */
  biaya: string;
  /** Today's recommended free activity. */
  aktivitas: string;
  /** A short interesting health/frugality fact. */
  funFact: string;
  /** A practical frugal tip for boarding-house life. */
  tipAnakKos: string;
  /** Actual spend on kategori "Makan" on the analysed date (ground truth vs the plan). */
  foodSpend: number;
  /** Low end of the selected menu set's frugal daily-cost range (rupiah). */
  biayaMin: number;
  /** High end of the selected menu set's frugal daily-cost range (rupiah). */
  biayaMax: number;
  /** When today's actual "Makan" spend already exceeds the planned menu range, a
      concrete cheap dinner alternative for the rest of the day (null otherwise). */
  malamSederhana: string | null;
}

/** Spend-pace comparison against the same day-of-month in the prior month. */
export interface PaceDto {
  /** YYYY-MM of the analysed month. */
  currentMonth: string;
  /** Day-of-month up to which spend is summed. */
  day: number;
  /** Cumulative non-Nabung spend through `day` this month. */
  currentThroughDay: number;
  /** Prior month key (YYYY-MM). */
  previousMonth: string;
  /** Cumulative non-Nabung spend through `day` last month. */
  previousThroughDay: number;
  /** currentThroughDay - previousThroughDay. */
  delta: number;
  /** Percent change vs last month (null when no baseline exists). */
  percentChange: number | null;
}

/** Remaining per-day envelope for the rest of the month (anggaran minus what is
    already spent, divided by the days left). The actionable counterpart to the
    static dailyBudget, which assumes a uniform spend from day 1. */
export interface RemainingAllowanceDto {
  /** Monthly budget (anggaran) in rupiah. */
  anggaran: number;
  /** Cumulative non-Nabung spend so far this month. */
  spentSoFar: number;
  /** max(0, anggaran - spentSoFar). */
  remainingBudget: number;
  /** Days remaining in the month (>= 1). */
  daysLeft: number;
  /** floor(remainingBudget / daysLeft) — affordable per day from tomorrow. */
  perDayAllowance: number;
}

/** Analisa & Saran report from `GET /api/expenses/advice`. */
export interface ExpenseAdvice {
  /** YYYY-MM-DD (WIB). */
  date: string;
  /** YYYY-MM. */
  month: string;
  dayTotal: number;
  dailyBudget: number;
  status: 'oke' | 'over_budget' | 'no_target';
  overBy: number;
  suggestions: string[];
  categoryTrend: CategoryTrendItem[];
  projection: ProjectionDto;
  pace: PaceDto;
  remainingAllowance: RemainingAllowanceDto;
  pcGoal: PcGoalDto;
  daily: DailySuggestionsDto;
}

/** Fetch the daily Analisa & Saran report for a date (YYYY-MM-DD). */
export async function getExpenseAdvice(
  date: string,
  options: ExpensesRequestOptions = {},
): Promise<ExpenseAdvice> {
  const res = await request(`${EXPENSES_URL}/advice?date=${encodeURIComponent(date)}`, options);
  return (await res.json()) as ExpenseAdvice;
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}
