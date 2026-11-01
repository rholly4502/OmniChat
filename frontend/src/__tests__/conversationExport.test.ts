import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  safeFilenameSlug,
  buildConversationCsv,
  buildConversationJson,
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
});

describe('buildConversationPdf', () => {
  it('returns a Blob whose content type is a PDF', () => {
    const blob = buildConversationPdf(MSGS, 'Judul');
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
