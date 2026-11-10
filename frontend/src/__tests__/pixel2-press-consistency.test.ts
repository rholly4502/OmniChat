import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Source-level guard for the pixel2 press convention: every button that carries
 * a hard offset shadow (`pixel-shadow` / `pixel-shadow-sm`) AND is clickable
 * must drop that shadow on press (`active:shadow-none`). A button that slides
 * down (`active:translate-y`) without removing its shadow looks like it floats
 * on press — the one interaction inconsistency the pixel register bans. Reads
 * source because jsdom cannot resolve the offset shadow or the active pseudo-
 * class; a rendered assertion would pass regardless.
 */

const SRC = resolve(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

/** Extracts the opening tag of every <button> (same scanner as pixel2-consistency). */
function buttonTags(text: string): { attrs: string; line: number }[] {
  const out: { attrs: string; line: number }[] = [];
  const re = /<button\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let i = re.lastIndex;
    let braceDepth = 0;
    let quote: string | null = null;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        continue;
      }
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
      else if (ch === '>' && braceDepth === 0) break;
    }
    out.push({ attrs: text.slice(m.index, i + 1), line: text.slice(0, m.index).split('\n').length });
  }
  return out;
}

describe('pixel2 press shadow consistency', () => {
  const files = sourceFiles(SRC);

  it('every clickable pixel-shadow button drops its shadow on press (active:shadow-none)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const { attrs, line } of buttonTags(readFileSync(file, 'utf8'))) {
        // Only buttons that carry a hard offset shadow and are clickable.
        if (!attrs.includes('pixel-shadow')) continue;
        if (!attrs.includes('onClick')) continue;
        if (!attrs.includes('active:shadow-none')) {
          offenders.push(`${file.replace(SRC, 'src')}:${line} pixel-shadow button missing active:shadow-none — ${attrs}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
