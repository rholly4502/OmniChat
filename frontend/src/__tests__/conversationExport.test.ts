import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  safeFilenameSlug,
  buildConversationCsv,
  buildConversationJson,
  buildConversationMarkdown,
  buildConversationPdf,
  buildAllConversationsJson,
  buildAllConversationsCsv,
  downloadBlob,
} from '../conversationExport';
import type { ConversationExportRecord, Message } from '../types';

const { pdfTextCalls, JsPdfMock } = vi.hoisted(() => {
  const pdfTextCalls: string[][] = [];
  const JsPdfMock = function JsPdfMock() {
    return {
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    setFont: () => {},
    setFontSize: () => {},
    setTextColor: () => {},
    text: (t: string | string[]) => { pdfTextCalls.push(Array.isArray(t) ? t : [t]); },
    splitTextToSize: (s: string) => s.split('\n'),
    addPage: () => {},
    output: () => new Blob(['%PDF'], { type: 'application/pdf' }),
    };
  }
  return { pdfTextCalls, JsPdfMock };
});

vi.mock('jspdf', () => ({ jsPDF: JsPdfMock }));

const MSGS: Message[] = [
  { role: 'user', content: 'halo' },
  { role: 'assistant', content: 'hi' },
];

describe('safeFilenameSlug', () => {
  it('replaces filesystem-illegal characters with underscores', () => {
    expect(safeFilenameSlug('a/b?c*d:e|f"g<h>i')).toBe('a_b_c_d_e_f_g_h_i');
  });
});

describe('buildConversationCsv', () => {
  it('emits a header row and one row per message with CRLF endings', () => {
    const csv = buildConversationCsv(MSGS);
    expect(csv).toContain('\r\n');
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('role,content');
    expect(lines).toHaveLength(3);
  });

  it('appends a metadata summary footer when a model or usage is provided', () => {
    const csv = buildConversationCsv(MSGS, { model: 'claude-sonnet', mode: 'agent', promptTokens: 10, completionTokens: 5 });
    const body = csv.trim().split('\r\n');
    // transcript header + 2 messages = 3 rows, then 4 summary rows
    expect(body[0]).toBe('role,content');
    expect(body).toContain('model,claude-sonnet · Agent (Hermes)');
    expect(body).toContain('prompt_tokens,10');
    expect(body).toContain('completion_tokens,5');
    expect(body).toContain('total_tokens,15');
    expect(body).toContain('estimated_usd,$0.0001'); // claude-sonnet (10/1000)*0.003 + (5/1000)*0.015 = 0.000105
  });

  it('adds no summary footer when metadata is absent', () => {
    const csv = buildConversationCsv(MSGS);
    expect(csv.trim().split('\r\n')).toHaveLength(3);
  });

  it('quotes fields that contain commas, quotes or newlines', () => {
    const csv = buildConversationCsv([{ role: 'user', content: 'a,b' }]);
    expect(csv).toContain('"a,b"');
    const quoted = buildConversationCsv([{ role: 'user', content: 'say "hi"' }]);
    expect(quoted).toContain('"say ""hi"""');
  });
});

describe('buildConversationJson', () => {
  it('serializes role/content pairs with a title and timestamp', () => {
    const doc = JSON.parse(buildConversationJson(MSGS, 'Judul'));
    expect(doc.title).toBe('Judul');
    expect(typeof doc.exportedAt).toBe('string');
    expect(doc.messages).toEqual([
      { role: 'user', content: 'halo' },
      { role: 'assistant', content: 'hi' },
    ]);
  });

  it('embeds model/mode and usage metadata when provided', () => {
    const doc = JSON.parse(buildConversationJson(MSGS, 'Judul', { model: 'gpt-4o', mode: 'direct', promptTokens: 8, completionTokens: 2 }));
    expect(doc.model).toBe('gpt-4o');
    expect(doc.mode).toBe('direct');
    expect(doc.usage).toEqual({ promptTokens: 8, completionTokens: 2, totalTokens: 10, estimatedUsd: expect.any(Number) });
    // gpt-4o (0.0025 in / 0.01 out) => 8*0.0025 + 2*0.01 = 0.02 + 0.02 = 0.04
    expect(doc.usage.estimatedUsd).toBeCloseTo(0.00004, 9); // $(8/1000)*0.0025 + (2/1000)*0.01
  });

  it('omits usage metadata when usage is absent', () => {
    const doc = JSON.parse(buildConversationJson(MSGS, 'Judul', { model: 'hermes' }));
    expect(doc.model).toBe('hermes');
    expect(doc.usage).toBeUndefined();
  });
});

describe('buildConversationPdf', () => {
  it('returns a Blob whose content type is a PDF', async () => {
    const blob = await buildConversationPdf(MSGS, 'Judul');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain('application/pdf');
  });
});

describe('downloadBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an object URL, clicks a temporary anchor and revokes it', () => {
    const createURL = vi.fn().mockReturnValue('blob:mock');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: createURL, revokeObjectURL: revoke });

    const clicks: string[] = [];
    const fakeAnchor = {
      href: '',
      download: '',
      click: () => clicks.push('click'),
      remove: () => {},
    };
    vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(
      () => fakeAnchor as unknown as ChildNode,
    );

    downloadBlob(new Blob(['x']), 'a.csv');

    expect(createURL).toHaveBeenCalledTimes(1);
    expect(clicks).toEqual(['click']);
    expect(revoke).toHaveBeenCalledWith('blob:mock');
  });
});

describe('buildConversationMarkdown', () => {
  it('renders a title header with role sections', () => {
    const md = buildConversationMarkdown(MSGS, 'Judul');
    expect(md).toContain('# Judul');
    expect(md).toContain('### Pengguna');
    expect(md).toContain('halo');
    expect(md).toContain('### Asisten');
    expect(md).toContain('hi');
  });

  it('includes model/mode and usage metadata when provided', () => {
    const md = buildConversationMarkdown(
      MSGS,
      'Judul',
      { model: 'claude-sonnet', mode: 'agent', promptTokens: 10, completionTokens: 5 },
      Date.parse('2026-10-25T09:00:00Z'),
    );
    expect(md).toContain('Model: claude-sonnet');
    expect(md).toContain('Agent (Hermes)');
    expect(md).toContain('Penggunaan: 15 token (10 in / 5 out)');
    expect(md).toContain('≈ $0.0001');
  });
});

describe('buildConversationCsv BOM', () => {
  it('prefixes the document with a UTF-8 byte-order mark', () => {
    const csv = buildConversationCsv(MSGS);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toContain('role,content');
  });
});

describe('buildConversationCsv per-message attribution', () => {
  it('adds model/token columns when any message carries usage attribution', () => {
    const withUsage: Message[] = [
      { role: 'user', content: 'halo' },
      { role: 'assistant', content: 'hi', model: 'claude-sonnet', usage: { promptTokens: 5, completionTokens: 3 } },
    ];
    const csv = buildConversationCsv(withUsage);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('role,content,model,prompt_tokens,completion_tokens,total_tokens');
    expect(lines[1]).toBe('user,halo,,0,0,0');
    expect(lines[2]).toBe('assistant,hi,claude-sonnet,5,3,8');
  });

  it('keeps the classic shape when no per-message usage exists', () => {
    const csv = buildConversationCsv(MSGS);
    expect(csv.trim().split('\r\n')[0]).toBe('role,content');
  });
});


describe('buildAllConversationsJson / buildAllConversationsCsv', () => {
  const RECORDS: ConversationExportRecord[] = [
    {
      id: 'a',
      title: 'Percakapan A',
      createdAt: '2026-11-01T00:00:00Z',
      model: 'hermes',
      mode: 'agent',
      messages: [
        { role: 'user', content: 'halo' },
        { role: 'assistant', content: 'hai, ada koma, dan "kutip"', model: 'hermes', promptTokens: 10, completionTokens: 5 },
      ],
    },
    { id: 'b', title: 'B', createdAt: '2026-11-02T00:00:00Z', messages: [] },
  ];

  it('JSON emits exportedAt plus one entry per conversation with message details', () => {
    const doc = JSON.parse(buildAllConversationsJson(RECORDS));
    expect(doc.conversations).toHaveLength(2);
    expect(doc.conversations[0].title).toBe('Percakapan A');
    expect(doc.conversations[0].messages[1].promptTokens).toBe(10);
    expect(doc.conversations[1].messages).toHaveLength(0);
  });

  it('CSV emits a BOM, a header row and one row per message (empty conversation contributes none)', () => {
    const csv = buildAllConversationsCsv(RECORDS);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.replace('\uFEFF', '').trim().split('\r\n');
    expect(lines[0]).toBe('percakapan,dibuat,peran,konten,model,prompt_tokens,completion_tokens,total_tokens,reasoning');
    expect(lines).toHaveLength(3); // header + 2 messages
    expect(lines[2]).toContain('Percakapan A');
    expect(lines[2]).toContain('hai, ada koma, dan ""kutip""');
    expect(lines[2]).toMatch(/10,5,15,$/); // empty reasoning cell appended
  });
});

describe('conversation exports carry reasoning', () => {
  const WITH_REASONING: Message[] = [
    { role: 'user', content: 'halo' },
    { role: 'assistant', content: 'hi', reasoning: 'proses: cek konteks' },
  ];

  it('JSON embeds the reasoning field only when present', () => {
    const withReasoning = JSON.parse(buildConversationJson(WITH_REASONING, 'Judul'));
    expect(withReasoning.messages[1].reasoning).toBe('proses: cek konteks');
    expect(withReasoning.messages[0].reasoning).toBeUndefined();

    const plain = JSON.parse(buildConversationJson(MSGS, 'Judul'));
    expect(plain.messages[1].reasoning).toBeUndefined();
  });

  it('Markdown renders reasoning as a blockquote "Berpikir" section', () => {
    const md = buildConversationMarkdown(WITH_REASONING, 'Judul');
    expect(md).toContain('> **Berpikir:**');
    expect(md).toContain('> proses: cek konteks');

    const plain = buildConversationMarkdown(MSGS, 'Judul');
    expect(plain).not.toContain('Berpikir');
  });

  it('PDF renders reasoning text when present', async () => {
    pdfTextCalls.length = 0;
    const blob = await buildConversationPdf(WITH_REASONING, 'Judul');
    expect(blob.type).toContain('application/pdf');
    const joined = pdfTextCalls.flat().join('\n');
    expect(joined).toContain('Berpikir:');
    expect(joined).toContain('proses: cek konteks');
  });
});
