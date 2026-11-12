import { estimateUsd, formatUsd } from './tokenCost';
import type { Message } from './types';

/** Export formats offered on a conversation. */
export type ConversationExportFormat = 'markdown' | 'json' | 'csv' | 'pdf';

/** Per-conversation metadata attached to an export (model, mode, cumulative tokens). */
export interface ConversationExportMeta {
  /** Model id the conversation last ran under. */
  model?: string;
  /** Chat mode (“agent” | “direct”) the conversation last ran under. */
  mode?: string;
  /** Cumulative input tokens billed to the conversation. */
  promptTokens?: number;
  /** Cumulative output tokens billed to the conversation. */
  completionTokens?: number;
}
/** Human label for a mode id, for export headers. */
export function modeLabel(mode?: string): string {
  return mode === 'agent' ? 'Agent (Hermes)' : mode === 'direct' ? 'Direct (LLM)' : '';
}


/** " labels for the export menu. */
export const EXPORT_FORMAT_LABELS: Record<ConversationExportFormat, string> = {
  markdown: 'Markdown',
  json: 'JSON',
  csv: 'CSV',
  pdf: 'PDF',
};

/**
 * UTF-8 byte-order mark. Prepended to the CSV document so spreadsheet apps
 * (Excel, LibreOffice) detect the encoding correctly and render the Indonesian
 * chat text without mojibake. The BOM is stripped by String.prototype.trim(),
 * so existing consumers that trim before parsing are unaffected.
 */
const CSV_BOM = '\uFEFF';

/** Sanitizes a conversation title into a safe filename slug. */
export function safeFilenameSlug(title: string): string {
  return title.replace(/[/\\?%*:|"<>]/g, '_');
}

/** RFC 4180 quoting for a single CSV field. */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Conversation transcript as RFC 4180 CSV (CRLF, quoted when needed). */
export function buildConversationCsv(messages: Message[], meta: ConversationExportMeta = {}): string {
  // When any turn carries usage/model attribution, the export mirrors the UI's
  // per-message cost footnote (and the audit dialog) by adding those columns so
  // a spreadsheet analysis shows *which* model produced each turn at what token
  // cost — not just the aggregate footer. Without usage the classic 2-column
  // shape is kept untouched.
  const hasPerMessage = messages.some((m) => m.model || (m.usage && (m.usage.promptTokens > 0 || m.usage.completionTokens > 0)));
  const header = hasPerMessage
    ? ['role', 'content', 'model', 'prompt_tokens', 'completion_tokens', 'total_tokens']
    : ['role', 'content'];
  const rows: string[][] = [header];
  for (const m of messages) {
    if (hasPerMessage) {
      rows.push([
        m.role,
        m.content,
        m.model ?? '',
        String(m.usage?.promptTokens ?? 0),
        String(m.usage?.completionTokens ?? 0),
        String((m.usage?.promptTokens ?? 0) + (m.usage?.completionTokens ?? 0)),
      ]);
    } else {
      rows.push([m.role, m.content]);
    }
  }
  const summary: string[][] = [];
  if (meta.model || meta.mode) summary.push(['model', [meta.model, modeLabel(meta.mode)].filter(Boolean).join(' · ')]);
  const total = (meta.promptTokens ?? 0) + (meta.completionTokens ?? 0);
  if (total > 0) {
    summary.push(['prompt_tokens', String(meta.promptTokens ?? 0)]);
    summary.push(['completion_tokens', String(meta.completionTokens ?? 0)]);
    summary.push(['total_tokens', String(total)]);
    summary.push(['estimated_usd', formatUsd(estimateUsd({ promptTokens: meta.promptTokens ?? 0, completionTokens: meta.completionTokens ?? 0 }, meta.model ?? 'hermes'))]);
  }
  const body = rows.map((r) => r.map(csvField).join(',')).join('\r\n');
  if (!summary.length) return CSV_BOM + body + '\r\n';
  return CSV_BOM + body + '\r\n' + summary.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** Conversation transcript as a JSON document (role + content only). */
export function buildConversationJson(messages: Message[], title = 'Percakapan', meta: ConversationExportMeta = {}): string {
  const doc: Record<string, unknown> = {
    title,
    exportedAt: new Date().toISOString(),
    messages: messages.map((m) => ({ role: m.role, content: m.content, ...(m.reasoning ? { reasoning: m.reasoning } : {}) })),
  };
  if (meta.model) doc.model = meta.model;
  if (meta.mode) doc.mode = meta.mode;
  if (meta.promptTokens || meta.completionTokens) {
    doc.usage = {
      promptTokens: meta.promptTokens ?? 0,
      completionTokens: meta.completionTokens ?? 0,
      totalTokens: (meta.promptTokens ?? 0) + (meta.completionTokens ?? 0),
      estimatedUsd: estimateUsd({ promptTokens: meta.promptTokens ?? 0, completionTokens: meta.completionTokens ?? 0 }, meta.model ?? 'hermes'),
    };
  }
  return JSON.stringify(doc, null, 2);
}

/**
 * Conversation transcript as Markdown (the plain-text format). Shared by the
 * download path and copy-to-clipboard, so both always render identically.
 * Header carries the model/mode and cumulative token usage when known.
 */
export function buildConversationMarkdown(messages: Message[], title = 'Percakapan', meta: ConversationExportMeta = {}, createdAt?: number): string {
  const headerMeta = [meta.model ? `Model: ${meta.model}` : '', modeLabel(meta.mode)].filter(Boolean).join(' · ');
  const total = (meta.promptTokens ?? 0) + (meta.completionTokens ?? 0);
  const costEstimate = total > 0 ? formatUsd(estimateUsd({ promptTokens: meta.promptTokens ?? 0, completionTokens: meta.completionTokens ?? 0 }, meta.model ?? 'hermes')) : '';
  const usageMeta = total > 0 ? `Penggunaan: ${total} token (${meta.promptTokens ?? 0} in / ${meta.completionTokens ?? 0} out) · ≈ ${costEstimate}` : '';
  const lines = [
    `# ${title}`,
    `*Dibuat: ${createdAt ? new Date(createdAt).toLocaleString('id-ID') : new Date().toLocaleString('id-ID')}*`,
    headerMeta ? `*${headerMeta}*` : '',
    usageMeta ? `*${usageMeta}*` : '',
    '',
  ].filter((l) => l !== '');
  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? 'Pengguna' : 'Asisten';
    lines.push(`### ${roleLabel}`, '', msg.content, '');
    if (msg.reasoning) {
      const reasoningLines = ['> **Berpikir:**', ''];
      for (const ln of msg.reasoning.split('\n')) reasoningLines.push(`> ${ln}`);
      lines.push(...reasoningLines, '');
    }
  }
  return lines.join('\n');
}

/**
 * Conversation transcript as a paginated A4 PDF.
 *
 * Uses jsPDF's built-in Helvetica (WinAnsi), so extended non-Latin-1 glyphs
 * (emoji, rare diacritics) may not render — the structure, role labels and
 * title always do. CSV/json are the lossless exports; PDF is for print/archive.
 */
export async function buildConversationPdf(messages: Message[], title = 'Percakapan', meta: ConversationExportMeta = {}): Promise<Blob> {
  // jsPDF is ~200KB and only needed for PDF export; import it lazily so a
  // user who never exports a PDF never pays for it on the critical load path.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const maxWidth = pageWidth - margin * 2;
  let y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, margin, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Diekspor ${new Date().toLocaleString('id-ID')}`, margin, y);
  y += 5;
  const metaLine = [meta.model ? `Model: ${meta.model}` : '', modeLabel(meta.mode)].filter(Boolean).join(' · ');
  const total = (meta.promptTokens ?? 0) + (meta.completionTokens ?? 0);
  const usageLine = total > 0 ? `Penggunaan: ${total} token (${meta.promptTokens ?? 0} in / ${meta.completionTokens ?? 0} out)` : '';
  const fullMeta = [metaLine, usageLine].filter(Boolean).join(' · ');
  if (fullMeta) {
    doc.text(fullMeta, margin, y);
    y += 5;
  }
  y += 5;

  doc.setFontSize(10);
  doc.setTextColor(25);

  const newPage = () => {
    doc.addPage();
    y = 20;
  };

  for (const m of messages) {
    const label = m.role === 'user' ? 'Pengguna' : 'Asisten';
    const lines: string[] = [label + ':'];
    for (const paragraph of m.content.split(/\n+/)) {
      lines.push(...doc.splitTextToSize(paragraph.trim(), maxWidth));
    }
    for (const line of lines) {
      if (y > pageHeight - 16) newPage();
      doc.text(line, margin, y);
      y += 6;
    }
    if (m.reasoning) {
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(120);
      y += 2;
      const rLines = ['Berpikir:'];
      for (const paragraph of m.reasoning.split(/\n+/)) {
        rLines.push(...doc.splitTextToSize(paragraph.trim(), maxWidth));
      }
      for (const line of rLines) {
        if (y > pageHeight - 16) newPage();
        doc.text(line, margin, y);
        y += 5;
      }
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(25);
    }
    y += 3;
  }

  return doc.output('blob');
}

/** Triggers a browser download of a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** One conversation's portable record for a bulk (all-conversations) export. */
export interface ConversationExportRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
  model?: string;
  mode?: string;
  pinned?: boolean;
  messages: Array<{
    role: Message['role'];
    content: string;
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    reasoning?: string;
  }>;
}

/**
 * All conversations as one JSON document (a full-history backup/audit).
 * Top-level shape mirrors the single-conversation JSON export: each entry
 * carries its metadata plus the message list with model/token attribution.
 */
export function buildAllConversationsJson(records: ConversationExportRecord[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), conversations: records }, null, 2);
}

/**
 * All conversations as a long-format CSV — one row per message across every
 * conversation. Columns carry the owning conversation title, its created-at
 * stamp, the message role/content, and model/token attribution where known, so
 * a spreadsheet can filter, sum and analyse the whole history at once. A
 * UTF-8 BOM prefixes the document so spreadsheet apps read Indonesian text
 * correctly.
 */
export function buildAllConversationsCsv(records: ConversationExportRecord[]): string {
  const header = ['percakapan', 'dibuat', 'peran', 'konten', 'model', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'reasoning'];
  const rows: string[][] = [header];
  for (const rec of records) {
    for (const m of rec.messages) {
      rows.push([
        rec.title,
        rec.createdAt,
        m.role,
        m.content,
        m.model ?? '',
        String(m.promptTokens ?? 0),
        String(m.completionTokens ?? 0),
        String((m.promptTokens ?? 0) + (m.completionTokens ?? 0)),
        m.reasoning ?? '',
      ]);
    }
  }
  return '\uFEFF' + rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}
