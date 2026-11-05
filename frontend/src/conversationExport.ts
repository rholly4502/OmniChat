import { jsPDF } from 'jspdf';
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
  const rows: string[][] = [['role', 'content']];
  for (const m of messages) rows.push([m.role, m.content]);
  const summary: string[][] = [];
  if (meta.model || meta.mode) summary.push(['model', [meta.model, modeLabel(meta.mode)].filter(Boolean).join(' · ')]);
  const total = (meta.promptTokens ?? 0) + (meta.completionTokens ?? 0);
  if (total > 0) {
    summary.push(['prompt_tokens', String(meta.promptTokens ?? 0)]);
    summary.push(['completion_tokens', String(meta.completionTokens ?? 0)]);
    summary.push(['total_tokens', String(total)]);
  }
  const body = rows.map((r) => r.map(csvField).join(',')).join('\r\n');
  if (!summary.length) return body + '\r\n';
  return body + '\r\n' + summary.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** Conversation transcript as a JSON document (role + content only). */
export function buildConversationJson(messages: Message[], title = 'Percakapan', meta: ConversationExportMeta = {}): string {
  const doc: Record<string, unknown> = {
    title,
    exportedAt: new Date().toISOString(),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (meta.model) doc.model = meta.model;
  if (meta.mode) doc.mode = meta.mode;
  if (meta.promptTokens || meta.completionTokens) {
    doc.usage = {
      promptTokens: meta.promptTokens ?? 0,
      completionTokens: meta.completionTokens ?? 0,
      totalTokens: (meta.promptTokens ?? 0) + (meta.completionTokens ?? 0),
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
  const usageMeta = total > 0 ? `Penggunaan: ${total} token (${meta.promptTokens ?? 0} in / ${meta.completionTokens ?? 0} out)` : '';
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
export function buildConversationPdf(messages: Message[], title = 'Percakapan', meta: ConversationExportMeta = {}): Blob {
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
