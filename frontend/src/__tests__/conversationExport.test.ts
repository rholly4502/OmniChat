import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  safeFilenameSlug,
  buildConversationCsv,
  buildConversationJson,
  buildConversationMarkdown,
  buildConversationPdf,
  downloadBlob,
} from '../conversationExport';
import type { Message } from '../types';

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
    expect(doc.usage).toEqual({ promptTokens: 8, completionTokens: 2, totalTokens: 10 });
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
