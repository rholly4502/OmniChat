import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Source-level guard for the button-type convention: every interactive `<button>`
 * wired to an `onClick` handler must declare an explicit `type` attribute
 * (`"button"` or `"submit"`). A `<button>` with no `type` defaults to
 * `type="submit"`, so a button accidentally nested inside a form would submit it
 * (navigation / data loss) instead of running its click handler. Reads source
 * because jsdom renders buttons without any form-submit semantics, so a rendered
 * assertion would pass regardless.
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

describe('pixel2 button type consistency', () => {
  const files = sourceFiles(SRC);

  it('every clickable (onClick) button declares an explicit type', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const { attrs, line } of buttonTags(readFileSync(file, 'utf8'))) {
        if (!attrs.includes('onClick')) continue;
        if (!/type\s*=\s*["'`](button|submit)["'`]/.test(attrs)) {
          offenders.push(`${file.replace(SRC, 'src')}:${line} clickable button missing explicit type — ${attrs}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
