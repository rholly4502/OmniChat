import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Source-level guards for the pixel2 chill design floor.
 *
 * Like a11y-typography.test.ts, these read source instead of rendering, because
 * jsdom resolves neither Tailwind colour tokens nor computed geometry — a
 * rendered assertion would pass regardless of which class was used. They scan
 * every shipped .ts/.tsx (production source only, tests excluded) for the
 * anti-patterns the pixel2 direction bans: soft corners, gradients/glows/
 * blurs, soft (non-pixel) shadows, and the cold slate/cyan/blue/gray/zinc
 * palette that the warm chill tokens replaced. The expenses/advice components
 * additionally must keep every button on the 44px touch floor with a hard
 * offset shadow and a square edge.
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

/** Strips line and block comments so prose ("no soft gradient") can't false-trip. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Soft-corner utilities — anything `rounded-*` that is not `rounded-none`. */
function softCorners(line: string): string[] {
  const re = /rounded-(?!none\b)[a-z0-9[\]/()-]*/g;
  return line.match(re) ?? [];
}

/** Gradients, blur, glow, and non-pixel (soft) drop shadows. */
function softSurface(line: string): string[] {
  const re = /\b(?:bg-gradient|bg-radial|from-(?!chill)|to-(?!chill)|via-(?!chill)|blur-|backdrop-blur|drop-shadow|shadow-(?:md|lg|xl|2xl))\b/g;
  return line.match(re) ?? [];
}

/** Cold palette utilities (slate/cyan/blue/gray/zinc/neutral) that predate chill tokens. */
function coldPalette(line: string): string[] {
  const re = /-\b(?:slate|cyan|blue|gray|zinc|neutral)\b(?:-[0-9]+)?/g;
  return line.match(re) ?? [];
}

/** Extracts the opening tag of every <button> (same scanner trick as a11y tests). */
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

function selectTags(text: string): { attrs: string; line: number }[] {
  const out: { attrs: string; line: number }[] = [];
  const re = /<select\b/g;
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

describe('pixel2 chill consistency', () => {
  const files = sourceFiles(SRC);

  it('scans the real source tree', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('never uses a corner radius other than rounded-none', () => {
    const offenders: string[] = [];
    for (const file of files) {
      stripComments(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
        const hits = softCorners(line);
        if (hits.length) offenders.push(`${file.replace(SRC, 'src')}:${i + 1}: ${hits.join(', ')}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('has no gradients, glows, blurs, or soft (non-pixel) shadows', () => {
    const offenders: string[] = [];
    for (const file of files) {
      stripComments(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
        const hits = softSurface(line);
        if (hits.length) offenders.push(`${file.replace(SRC, 'src')}:${i + 1}: ${hits.join(', ')}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('never uses the cold slate/cyan/blue/gray/zinc/neutral palette', () => {
    const offenders: string[] = [];
    for (const file of files) {
      stripComments(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
        const hits = coldPalette(line);
        if (hits.length) offenders.push(`${file.replace(SRC, 'src')}:${i + 1}: ${hits.join(', ')}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('never embeds a raw hex color literal (tokens only)', () => {
    // The design floor is token-only: every colour must come from the chill
    // @theme (or a var() reference to it). A raw hex literal in component
    // source is how a cold-palette colour sneaks back in (e.g. an inline SVG
    // stroke="#"020617" that class-based scans cannot see).
    const offenders: string[] = [];
    const hexRe = /#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?(?![\da-fA-F])/g;
    for (const file of files) {
      stripComments(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
        const hits = line.match(hexRe);
        if (hits?.length) offenders.push(`${file.replace(SRC, 'src')}:${i + 1}: ${hits.join(', ')}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('keeps every expenses/advice button on the 44px touch floor with a hard offset shadow and square edge', () => {
    const scoped = files.filter((f) => /ExpensesView\.tsx$|AdvicePanel\.tsx$/.test(f));
    expect(scoped.length).toBe(2);
    const offenders: string[] = [];
    for (const file of scoped) {
      for (const { attrs, line } of buttonTags(readFileSync(file, 'utf8'))) {
        const cls = /\bclassName=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(attrs);
        const classes = (cls?.[1] ?? cls?.[2] ?? '').split(/\s+/);
        const touch = classes.includes('min-h-[44px]') || (classes.includes('h-11') && classes.includes('w-11'));
        const hard = classes.some((c) => /^pixel-shadow(-sm)?$/.test(c));
        const square = classes.includes('rounded-none');
        const press = classes.some((c) => /^active:translate-y/.test(c));
        if (!touch || !hard || !square || !press) {
          offenders.push(`${file.replace(SRC, 'src')}:${line} button missing [touch=${touch} hard=${hard} square=${square} press=${press}] — ${attrs}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every <select> hides the native drop-down arrow (appearance-none + pixel chevron)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const { attrs, line } of selectTags(readFileSync(file, 'utf8'))) {
        if (!attrs.includes('appearance-none')) {
          offenders.push(`${file.replace(SRC, 'src')}:${line} select missing appearance-none — ${attrs}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every <select> renders its native dropdown in the dark register (color-scheme)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const { attrs, line } of selectTags(readFileSync(file, 'utf8'))) {
        if (!attrs.includes('[color-scheme:dark]')) {
          offenders.push(`${file.replace(SRC, 'src')}:${line} select missing [color-scheme:dark] — ${attrs}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('weekly spend breakdown keeps the shared meter/chip register (solid accent current-week chip + hard top bevel)', () => {
    const w = readFileSync(resolve(SRC, 'components/WeeklySpendBreakdown.tsx'), 'utf8');
    // Current-week chip uses the same solid-accent register as the active segment chips.
    expect(w).toContain('text-chill-bg');
    expect(w).toContain('bg-chill-accent');
    expect(w).toContain('border-chill-accent');
    // Filled bars carry the shared hard 2px top bevel (matches daily/trend bars).
    expect(w).toContain('relative h-full');
    expect(w).toContain('bg-white/15');
  });

  it('every press-slide button uses the `transition` shorthand (covers transform), never `transition-colors`', () => {
    // A button with active:translate-y and only `transition-colors` animates its
    // colours but snaps the translate — the pixel press-slide (2–3px) must
    // animate smoothly. `transition` (shorthand) includes transform; plain
    // `transition-colors` does not. This locked in the 8-button sweep.
    const offenders: string[] = [];
    for (const file of files) {
      for (const { attrs, line } of buttonTags(readFileSync(file, 'utf8'))) {
        if (!attrs.includes('active:translate-y')) continue;
        if (!/\btransition\b/.test(attrs) || attrs.includes('transition-colors')) {
          offenders.push(`${file.replace(SRC, 'src')}:${line} press-slide button must use the transition shorthand, not transition-colors — ${attrs}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('pixel2 global square-corner floor', () => {
  const files = sourceFiles(SRC);
  // Every <button> across the whole source must be square (rounded-none) — the
  // square-corner contract is app-wide, not just expenses/advice. A button that
  // omits it can pick up native OS rounding (e.g. Chrome/Safari default radii),
  // which is a soft-corner remnant against the chill theme.
  it('every <button> across the source uses rounded-none', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const { attrs, line } of buttonTags(readFileSync(file, 'utf8'))) {
        const cls = /\bclassName=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(attrs);
        const classes = (cls?.[1] ?? cls?.[2] ?? '').split(/\s+/);
        if (classes.length && !classes.includes('rounded-none')) {
          offenders.push(`${file.replace(SRC, 'src')}:${line} button missing rounded-none — ${attrs}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('pixel2 advice frame grammar', () => {
  it('every elevated block in Analisa & Saran carries the full bevel corner set', () => {
    const a = readFileSync(resolve(SRC, 'components/AdvicePanel.tsx'), 'utf8');
    // Saran Harian, pace (Bandingkan), Proyeksi — all three framed boxes must
    // carry the top-right accent pixel (bg-chill-accent/15) alongside the shared
    // top/left bevel + bottom-left chisel corner, or the panel's frame grammar
    // fragments mid-panel.
    const corners = a.match(/bg-chill-accent\/15/g) ?? [];
    // Saran Harian, pace (Bandingkan), Proyeksi, Sisa anggaran, Progres
    // Nabung — five framed boxes, each with the top-right accent pixel.
    expect(corners.length).toBe(5);
    // The pace card block itself must carry it (guards against a copy-paste
    // omission in the middle block).
    const pace = a.slice(a.indexOf('Bandingkan dengan bulan lalu') - 400, a.indexOf('Bandingkan dengan bulan lalu'));
    expect(pace).toContain('bg-chill-accent/15');
    // The Sisa anggaran block must carry it too.
    const sisa = a.slice(a.indexOf('Sisa anggaran') - 400, a.indexOf('Sisa anggaran'));
    expect(sisa).toContain('bg-chill-accent/15');
    // The Progres Nabung block must carry it too.
    const nabung = a.slice(a.indexOf('Progres Nabung Bulan Ini') - 400, a.indexOf('Progres Nabung Bulan Ini'));
    expect(nabung).toContain('bg-chill-accent/15');
  });
});
