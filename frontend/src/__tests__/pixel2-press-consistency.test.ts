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

  it('every clickable button (non-disabled) carries a press-feedback active: state', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const { attrs, line } of buttonTags(readFileSync(file, 'utf8'))) {
        // Clickable = wired to an onClick handler. Disabled buttons get no press
        // feedback by design (they are not actionable), so exclude them.
        if (!attrs.includes('onClick')) continue;
        if (attrs.includes('disabled')) continue;
        if (!/\bactive:/.test(attrs)) {
          offenders.push(`${file.replace(SRC, 'src')}:${line} clickable button missing active: press feedback — ${attrs}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every rotated chevron uses the stepped pixel timing (no smooth tween)', () => {
    // The pixel2 register rotates chevrons in hard beats (steps(3,jump-none) /
    // steps(2,jump-none)). A bare `rotate-180` with transition-transform (or
    // worse, no timing at all) tweens smoothly — the one animation inconsistency
    // the register bans. Scans source because jsdom can't compute timing funcs.
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/rotate-180/g)) {
        const line = text.slice(0, m.index).split('\n').length;
        const lineText = text.split('\n')[line - 1];
        // The rotate utility must be paired with a stepped timing function in the
        // same tag. A step timing is detectable by `steps(` on the line.
        if (!/steps\(/.test(lineText)) {
          offenders.push(`${file.replace(SRC, 'src')}:${line} rotate-180 without stepped timing — ${lineText.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
