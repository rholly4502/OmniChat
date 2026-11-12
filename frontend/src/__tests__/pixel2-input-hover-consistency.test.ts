import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Source-level guard for the pixel2 hover-border register on text-entry fields.
 * The established convention (selects since cycle 120, date inputs since cycle
 * 127) is that every bordered standalone control shows a hover cue with
 * `hover:border-chill-accent/60`. This guard extends that to bordered text
 * inputs / textareas (API key, search, composer, system prompt, expenses form,
 * jobs draft/follow-up, stats date range, login) so a new field cannot be added
 * without the affordance. Reads source because jsdom cannot resolve the :hover
 * pseudo-class; a rendered assertion would pass regardless.
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

/** Extracts the opening tag of every <input>/<textarea> (same scanner as
 *  pixel2-press-consistency). Handles quoted attributes and nested { } JSX. */
function fieldTags(text: string): { attrs: string; line: number }[] {
  const out: { attrs: string; line: number }[] = [];
  const re = /<(input|textarea)\b/g;
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

describe('pixel2 bordered text-field hover consistency', () => {
  const files = sourceFiles(SRC);

  it('every bordered standalone text input/textarea carries hover:border-chill-accent/60', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const { attrs, line } of fieldTags(readFileSync(file, 'utf8'))) {
        // Skip native checkbox/radio/range and the pixel checkbox (own styling).
        if (attrs.includes('type="checkbox"') || attrs.includes('type="radio"')) continue;
        if (attrs.includes('type="range"') || attrs.includes('pixel-checkbox')) continue;
        // Bordered standalone field = carries a border utility AND a surface bg
        // token. Borderless inline editors (bg-transparent, no border) fall out.
        if (!/\bborder\b/.test(attrs)) continue;
        if (!/(bg-chill-(surface|bg|elevated))/.test(attrs)) continue;
        if (attrs.includes('bg-transparent')) continue;
        if (!attrs.includes('hover:border-chill-accent/60')) {
          offenders.push(`${file.replace(SRC, 'src')}:${line} bordered text field missing hover:border-chill-accent/60 — ${attrs}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
