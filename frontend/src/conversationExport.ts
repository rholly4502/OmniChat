import { jsPDF } from 'jspdf';
import type { Message } from './types';

/** Export formats offered on a conversation. */
export type ConversationExportFormat = 'markdown' | 'json' | 'csv' | 'pdf';

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
export function buildConversationCsv(messages: Message[]): string {
  const rows: string[][] = [['role', 'content']];
  for (const m of messages) rows.push([m.role, m.content]);
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** Conversation transcript as a JSON document (role + content only). */
export function buildConversationJson(messages: Message[], title = 'Percakapan'): string {
  return JSON.stringify(
    {
      title,
      exportedAt: new Date().toISOString(),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    },
    null,
    2,
  );
}

/**
 * Conversation transcript as a paginated A4 PDF.
 *
 * Uses jsPDF's built-in Helvetica (WinAnsi), so extended non-Latin-1 glyphs
 * (emoji, rare diacritics) may not render — the structure, role labels and
 * title always do. CSV/json are the lossless exports; PDF is for print/archive.
 */
export function buildConversationPdf(messages: Message[], title = 'Percakapan'): Blob {
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
  y += 10;

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
