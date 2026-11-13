import { useState } from 'react';
import { useModalDialog } from '../hooks/useModalDialog';
import { estimateUsd, formatTokens, formatUsd, sortModelEntriesByCost } from '../tokenCost';
import { downloadBlob, safeFilenameSlug } from '../conversationExport';
import type { ChatSession, Message, ModelOption } from '../types';

/** Props accepted by {@link ConversationAuditDialog}. */
export interface ConversationAuditDialogProps {
  /** true renders the modal (zero-cost when false). */
  open: boolean;
  /** Request close (Escape, backdrop, close button). */
  onClose: () => void;
  /** The conversation being audited; null/undefined renders nothing. */
  session: ChatSession | null | undefined;
  /** Every known model (agent + direct) for id → label resolution. */
  modelOptions?: ModelOption[];
}

const ROLE_LABELS: Record<string, string> = {
  user: 'Pengguna',
  assistant: 'Asisten',
  system: 'Sistem',
};

/** Human label for a message role. */
function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/** Human label for a model id, falling back to the raw id. */
function labelFor(id: string | undefined, options: ModelOption[] | undefined): string {
  if (!id) return '';
  const opt = options?.find((o) => o.id === id);
  return opt ? opt.label : id;
}

/** Compact, truncated content preview for a table row (keeps rows short). */
function preview(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > 72 ? `${flat.slice(0, 72)}…` : flat;
}

/** RFC 4180 quoting for a single CSV field. */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Format an epoch-ms message timestamp as a compact, localized clock time. */
function formatTimestamp(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })} ${time}`;
}

/**
 * Builds an RFC 4180 CSV of the audit table: one row per message with its role,
 * content preview, prompt/completion tokens, estimated cost and rating, then a
 * footer total row, then per-model subtotal rows when the thread spans models.
 * Raw numbers are used (not formatted strings) so a spreadsheet can sum them.
 */
function buildAuditCsv(session: ChatSession, modelOptions: ModelOption[] | undefined): string {
  const msgs = session.messages;
  const rows: string[][] = [['#', 'peran', 'pesan', 'model', 'prompt_tokens', 'completion_tokens', 'biaya_usd', 'umpan_balik', 'berpikir', 'ditandai', 'waktu']];
  let totalPrompt = 0;
  let totalCompletion = 0;
  let totalUsd = 0;
  msgs.forEach((m, i) => {
    const usage = m.usage;
    const pTok = usage?.promptTokens ?? 0;
    const cTok = usage?.completionTokens ?? 0;
    totalPrompt += pTok;
    totalCompletion += cTok;
    const rowCost = usage ? estimateUsd(usage, m.model ?? session.model ?? '') : null;
    if (rowCost !== null) totalUsd += rowCost;
    const cost = rowCost !== null ? rowCost.toFixed(6) : '';
    const feedback = m.feedback === 'up' ? 'up' : m.feedback === 'down' ? 'down' : '';
    rows.push([
      String(i + 1),
      roleLabel(m.role),
      preview(m.content),
      labelFor(m.model ?? session.model, modelOptions),
      String(pTok || ''),
      String(cTok || ''),
      cost,
      feedback,
      m.reasoning ? '1' : '',
      m.bookmarked ? '1' : '',
      m.createdAt ? formatTimestamp(m.createdAt) : '',
    ]);
  });
  const totalUsdFixed = totalUsd.toFixed(6);
  rows.push(['Total', '', '', String(totalPrompt), String(totalCompletion), String(totalUsdFixed), '', '']);

  const byModel = new Map<string, { promptTokens: number; completionTokens: number }>();
  for (const m of msgs) {
    if (!m.usage) continue;
    const mid = m.model ?? session.model ?? '';
    if (!mid) continue;
    const cur = byModel.get(mid) ?? { promptTokens: 0, completionTokens: 0 };
    cur.promptTokens += m.usage.promptTokens ?? 0;
    cur.completionTokens += m.usage.completionTokens ?? 0;
    byModel.set(mid, cur);
  }
  for (const [mid, u] of sortModelEntriesByCost(Array.from(byModel.entries()))) {
    const cost = estimateUsd({ promptTokens: u.promptTokens, completionTokens: u.completionTokens }, mid).toFixed(6);
    rows.push([labelFor(mid, modelOptions), '', '', String(u.promptTokens), String(u.completionTokens), cost, '', '']);
  }

  return '\uFEFF' + rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/**
 * Builds the structured JSON of the per-conversation audit: one object per
 * message with its role, content preview, model, prompt/completion tokens,
 * estimated cost, rating, reasoning/bookmark flags and timestamp, plus an
 * overall total and per-model subtotals. Mirror of {@link buildAuditCsv} in
 * JSON form — the lossless counterpart to the CSV download.
 */
function buildAuditJson(session: ChatSession, modelOptions: ModelOption[] | undefined): string {
  const msgs = session.messages;
  const rows = msgs.map((m, i) => {
    const usage = m.usage;
    const cost = usage ? estimateUsd(usage, m.model ?? session.model ?? '') : null;
    return {
      no: i + 1,
      peran: roleLabel(m.role),
      pesan: preview(m.content),
      model: labelFor(m.model ?? session.model, modelOptions) || null,
      prompt_tokens: usage?.promptTokens ?? 0,
      completion_tokens: usage?.completionTokens ?? 0,
      biaya_usd: cost !== null ? Number(cost.toFixed(6)) : null,
      umpan_balik: m.feedback === 'up' ? 'up' : m.feedback === 'down' ? 'down' : null,
      berpikir: Boolean(m.reasoning),
      ditandai: Boolean(m.bookmarked),
      waktu: m.createdAt ? formatTimestamp(m.createdAt) : null,
    };
  });

  const totalPrompt = msgs.reduce((sum, m) => sum + (m.usage?.promptTokens ?? 0), 0);
  const totalCompletion = msgs.reduce((sum, m) => sum + (m.usage?.completionTokens ?? 0), 0);
  const totalUsd = msgs.reduce(
    (sum, m) => sum + (m.usage ? estimateUsd(m.usage, m.model ?? session.model ?? '') : 0),
    0,
  );

  const byModel = new Map<string, { promptTokens: number; completionTokens: number }>();
  for (const m of msgs) {
    if (!m.usage) continue;
    const mid = m.model ?? session.model ?? '';
    if (!mid) continue;
    const cur = byModel.get(mid) ?? { promptTokens: 0, completionTokens: 0 };
    cur.promptTokens += m.usage.promptTokens ?? 0;
    cur.completionTokens += m.usage.completionTokens ?? 0;
    byModel.set(mid, cur);
  }
  const perModel = Array.from(byModel.entries()).map(([mid, u]) => ({
    model: labelFor(mid, modelOptions),
    prompt_tokens: u.promptTokens,
    completion_tokens: u.completionTokens,
    biaya_usd: Number(estimateUsd({ promptTokens: u.promptTokens, completionTokens: u.completionTokens }, mid).toFixed(6)),
  }));

  return JSON.stringify(
    {
      judul: session.title,
      model: labelFor(session.model, modelOptions) || null,
      mode: session.mode === 'agent' ? 'agent' : session.mode === 'direct' ? 'direct' : null,
      dibuat: session.createdAt ? new Date(session.createdAt).toISOString() : null,
      diperbarui: session.updatedAt ? new Date(session.updatedAt).toISOString() : null,
      total: { prompt_tokens: totalPrompt, completion_tokens: totalCompletion, biaya_usd: Number(totalUsd.toFixed(6)) },
      per_model: perModel,
      pesan: rows,
    },
    null,
    2,
  );
}

/**
 * Per-conversation audit dialog: a compact, pixel-themed table of every turn in
 * one conversation with its prompt/completion tokens, estimated cost, rating and
 * timestamp. This is the per-conversation counterpart to the global
 * {@link ChatStatsDialog}: the global dialog shows aggregate usage across all
 * conversations, while this one shows the message-level audit trail of a single
 * thread. Shares the same focus-trap / Escape / scroll-lock contract.
 */
export function ConversationAuditDialog({ open, onClose, session, modelOptions }: ConversationAuditDialogProps) {
  const panelRef = useModalDialog(open, onClose, '[data-audit-close]');
  /** Per-row expand state (message index -> expanded) so a full message can be
   * read in the audit view — the default row shows only a 72-char preview and
   * the full text is otherwise hidden behind a hover-only `title` tooltip,
   * which is inaccessible on touch/keyboard. */
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  if (!open || !session) return null;

  const msgs = session.messages;
  const totalPrompt = msgs.reduce((sum, m) => sum + (m.usage?.promptTokens ?? 0), 0);
  const totalCompletion = msgs.reduce((sum, m) => sum + (m.usage?.completionTokens ?? 0), 0);
  const totalUsd = msgs.reduce(
    (sum, m) => sum + (m.usage ? estimateUsd(m.usage, m.model ?? session.model ?? '') : 0),
    0,
  );
  // Per-model subtotals across the conversation's turns, so a multi-model
  // thread shows exactly what each model contributed (mirrors the global
  // stats dialog's per-model table).
  const byModel = new Map<string, { promptTokens: number; completionTokens: number }>();
  for (const m of msgs) {
    if (!m.usage) continue;
    const mid = m.model ?? session.model ?? '';
    if (!mid) continue;
    const cur = byModel.get(mid) ?? { promptTokens: 0, completionTokens: 0 };
    cur.promptTokens += m.usage.promptTokens ?? 0;
    cur.completionTokens += m.usage.completionTokens ?? 0;
    byModel.set(mid, cur);
  }
  const byModelEntries = sortModelEntriesByCost(Array.from(byModel.entries()));
  const modelId = session.model;
  const modeText = session.mode === 'agent' ? 'Agent (Hermes)' : session.mode === 'direct' ? 'Direct (LLM)' : '';
  const upCount = msgs.filter((m) => m.feedback === 'up').length;
  const downCount = msgs.filter((m) => m.feedback === 'down').length;
  const bookmarkedCount = msgs.filter((m) => m.bookmarked).length;


  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-chill-bg/60 pixel-overlay-fade"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Audit percakapan ${session.title}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[85vh] overflow-y-auto bg-chill-surface border border-chill-border pixel-shadow p-4 space-y-3 pixel-reveal"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-chill-text pixel-heading truncate">Audit · {session.title}</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                downloadBlob(
                  new Blob([buildAuditJson(session, modelOptions)], { type: 'application/json;charset=utf-8' }),
                  `${safeFilenameSlug(session.title)}-audit.json`,
                )
              }
              aria-label="Ekspor audit sebagai JSON"
              title="Ekspor audit sebagai JSON"
              className="rounded-none min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><path d="M8 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1" /><path d="M8 5h8v4H8z" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="16" x2="13" y2="16" /></svg>
            </button>
            <button
              type="button"
              onClick={() =>
                downloadBlob(
                  new Blob([buildAuditCsv(session, modelOptions)], { type: 'text/csv;charset=utf-8' }),
                  `${safeFilenameSlug(session.title)}-audit.csv`,
                )
              }
              aria-label="Ekspor audit sebagai CSV"
              title="Ekspor audit sebagai CSV"
              className="rounded-none min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            </button>
            <button
              type="button"
              data-audit-close
              onClick={onClose}
              aria-label="Tutup audit"
              className="rounded-none min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-chill-muted hover:text-chill-accent active:bg-chill-elevated active:translate-y-[2px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-chill-muted border-b border-chill-border pb-2">
          {modelId && <span>Model: <span className="text-chill-accent font-medium">{labelFor(modelId, modelOptions)}</span></span>}
          {modeText && <span>Mode: <span className="text-chill-accent font-medium">{modeText}</span></span>}
          <span>{msgs.length} pesan</span>
          {upCount > 0 && (
            <span className="inline-flex items-center gap-1" title="Disukai">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg>
              <span className="text-chill-accent font-medium">{upCount}</span>
            </span>
          )}
          {downCount > 0 && (
            <span className="inline-flex items-center gap-1" title="Tidak disukai">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></svg>
              <span className="text-chill-accent font-medium">{downCount}</span>
            </span>
          )}
          {bookmarkedCount > 0 && (
            <span className="inline-flex items-center gap-1" title="Ditandai">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 5.9 6.6.96-4.77 4.65 1.13 6.58L12 17.01 6.14 20.09l1.13-6.58L2.5 8.86l6.6-.96L12 2z" /></svg>
              <span className="text-chill-accent font-medium">{bookmarkedCount}</span>
            </span>
          )}
        </div>

        {msgs.length === 0 ? (
          <div className="text-xs text-chill-muted py-6 text-center">Belum ada pesan dalam percakapan ini.</div>
        ) : (
          <div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-chill-muted">
                  <th className="font-medium py-1 pr-2 w-8">#</th>
                  <th className="font-medium py-1 pr-2 w-16">Peran</th>
                  <th className="font-medium py-1 pr-2">Pesan</th>
                  <th className="font-medium py-1 pr-2">Model</th>
                  <th className="font-medium py-1 pr-2 text-right">In</th>
                  <th className="font-medium py-1 pr-2 text-right">Out</th>
                  <th className="font-medium py-1 pr-2 text-right">Biaya</th>
                  <th className="font-medium py-1 pr-2 text-right">Waktu</th>
                  <th className="font-medium py-1 text-center w-12">Nilai</th>
                  <th className="font-medium py-1 text-center w-12">Lain</th>
                </tr>
              </thead>
              <tbody>
                {msgs.map((m: Message, i: number) => {
                  const usage = m.usage;
                  const cost = usage ? estimateUsd(usage, m.model ?? session.model ?? '') : null;
                  return (
                    <tr key={m.id ?? i} className="border-t border-chill-border align-top">
                      <td className="py-1.5 pr-2 text-chill-muted">{i + 1}</td>
                      <td className="py-1.5 pr-2 text-chill-muted">{roleLabel(m.role)}</td>
                      <td className="py-1.5 pr-2">
                        {expandedRows[i] ? (
                          <div className="max-w-[340px] md:max-w-[420px]">
                            <div className="text-chill-text text-xs leading-relaxed whitespace-pre-wrap break-words pixel-reveal">
                              {m.content}
                            </div>
                            {m.reasoning && (
                              <div className="mt-1.5 border-t border-chill-border pt-1.5">
                                <div className="text-xs text-chill-muted font-medium mb-0.5">Cara berpikir</div>
                                <div className="text-chill-muted text-xs leading-relaxed whitespace-pre-wrap break-words">
                                  {m.reasoning}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-chill-text truncate max-w-[180px] md:max-w-[260px]" title={m.content}>
                            {preview(m.content)}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedRows((prev) => ({ ...prev, [i]: !prev[i] }))}
                          aria-expanded={Boolean(expandedRows[i])}
                          aria-label={expandedRows[i] ? 'Sembunyikan pesan lengkap' : 'Tampilkan pesan lengkap'}
                          className="mt-1 rounded-none inline-flex items-center gap-1 min-h-[44px] px-1 text-xs text-chill-accent font-medium transition hover:text-chill-accent-hover active:bg-chill-elevated active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chill-accent/60"
                        >
                          <svg width="10" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" shapeRendering="crispEdges" strokeLinejoin="miter" aria-hidden="true" className={`transition-transform duration-150 [transition-timing-function:steps(3,jump-none)] ${expandedRows[i] ? 'rotate-180' : ''}`}>
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                          {expandedRows[i] ? 'Sembunyikan' : 'Lihat lengkap'}
                        </button>
                      </td>
                      <td className="py-1.5 pr-2 text-chill-muted">
                        {m.model ? labelFor(m.model, modelOptions) : <span className="text-chill-muted">–</span>}
                      </td>
                      <td className="py-1.5 pr-2 text-right text-chill-muted font-mono">{usage ? formatTokens(usage.promptTokens) : '–'}</td>
                      <td className="py-1.5 pr-2 text-right text-chill-muted font-mono">{usage ? formatTokens(usage.completionTokens) : '–'}</td>
                      <td className="py-1.5 pr-2 text-right text-chill-accent font-mono">{cost !== null ? `≈${formatUsd(cost)}` : '–'}</td>
                      <td className="py-1.5 pr-2 text-right text-chill-muted whitespace-nowrap">{formatTimestamp(m.createdAt)}</td>
                      <td className="py-1.5 text-center">
                        {m.feedback === 'up' ? (
                          <span aria-label="Disukai" className="text-chill-accent">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg>
                          </span>
                        ) : m.feedback === 'down' ? (
                          <span aria-label="Tidak disukai" className="text-chill-accent">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></svg>
                          </span>
                        ) : (
                          <span aria-label="Belum dinilai" className="text-chill-muted">–</span>
                        )}
                      </td>
                      <td className="py-1.5 text-center">
                        <span className="inline-flex items-center justify-center gap-1">
                          {m.reasoning && (
                            <span aria-label="Berisi cara berpikir" title="Berisi cara berpikir" className="text-chill-muted">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true"><circle cx="12" cy="12" r="10" /></svg>
                            </span>
                          )}
                          {m.bookmarked && (
                            <span aria-label="Ditandai" title="Ditandai" className="text-chill-accent">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 5.9 6.6.96-4.77 4.65 1.13 6.58L12 17.01 6.14 20.09l1.13-6.58L2.5 8.86l6.6-.96L12 2z" /></svg>
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-chill-border">
                  <td colSpan={3} className="py-1.5 pr-2 text-chill-text font-semibold">Total</td>
                  <td className="py-1.5 pr-2 text-right text-chill-text font-mono">{formatTokens(totalPrompt)}</td>
                  <td className="py-1.5 pr-2 text-right text-chill-text font-mono">{formatTokens(totalCompletion)}</td>
                  <td className="py-1.5 pr-2 text-right text-chill-accent font-mono">≈{formatUsd(totalUsd)}</td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>

            {byModelEntries.length > 0 && (
              <div className="mt-3 border-t border-chill-border pt-2">
                <div className="text-xs text-chill-muted font-medium mb-1.5">Rincian per model</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-chill-muted">
                      <th className="font-medium py-1 pr-2">Model</th>
                      <th className="font-medium py-1 pr-2 text-right">Input</th>
                      <th className="font-medium py-1 pr-2 text-right">Output</th>
                      <th className="font-medium py-1 pr-2 text-right">Total</th>
                      <th className="font-medium py-1 text-right">Biaya</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byModelEntries.map(([mid, u]) => {
                      const perUsd = estimateUsd({ promptTokens: u.promptTokens, completionTokens: u.completionTokens }, mid);
                      const perTokens = u.promptTokens + u.completionTokens;
                      return (
                        <tr key={mid} className="border-t border-chill-border">
                          <td className="py-1.5 pr-2">
                            <div className="text-chill-text font-medium truncate max-w-[140px]" title={mid}>{labelFor(mid, modelOptions)}</div>
                          </td>
                          <td className="py-1.5 pr-2 text-right text-chill-muted font-mono">{formatTokens(u.promptTokens)}</td>
                          <td className="py-1.5 pr-2 text-right text-chill-muted font-mono">{formatTokens(u.completionTokens)}</td>
                          <td className="py-1.5 pr-2 text-right text-chill-text font-mono">{formatTokens(perTokens)}</td>
                          <td className="py-1.5 text-right text-chill-accent font-mono">≈{formatUsd(perUsd)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
