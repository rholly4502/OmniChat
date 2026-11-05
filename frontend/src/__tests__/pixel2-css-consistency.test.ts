import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Design-floor guards for the pixel2 stylesheet itself.
 *
 * The .ts/.tsx guards in pixel2-consistency.test.ts read component source, but
 * nothing pins `index.css` — a future regression that reintroduces a soft
 * corner, a gradient/glow/blur, a soft drop shadow, or the cold slate/cyan/
 * blue/gray/zinc/neutral palette into the stylesheet would pass every existing
 * rendered test while quietly breaking the chill design floor. These guards
 * close that gap by scanning `index.css` for the same anti-patterns the
 * component guards ban, with the same comment-stripping treatment.
 */

const CSS_PATH = resolve(process.cwd(), 'src/index.css');
const CSS = readFileSync(CSS_PATH, 'utf8');

/** Strips comments so prose ("no soft gradient") can't false-trip. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const CLEAN = stripComments(CSS);

describe('pixel2 css consistency', () => {
  it('scans the real stylesheet', () => {
    expect(CSS.length).toBeGreaterThan(2000);
    expect(CLEAN.length).toBeGreaterThan(1000);
  });

  it('index.css never uses a corner radius other than zero', () => {
    // `rounded-(?!none)` — border-radius must only ever be 0.
    const re = /rounded-(?!none\b)[a-z0-9[\]]*-?[a-z0-9[\]]*/g;
    const hits = [...CLEAN.matchAll(re)].map((m) => m[0]).filter((s) => s !== 'rounded');
    expect(hits).toEqual([]);
  });

  it('index.css has no gradients, glows, blurs, or soft (non-pixel) shadows', () => {
    const re = /\b(?:bg-gradient|bg-radial|from-(?!chill)|to-(?!chill)|via-(?!chill)|blur-|backdrop-blur|drop-shadow|shadow-(?:md|lg|xl|2xl))\b/g;
    const hits = CLEAN.match(re) ?? [];
    expect(hits).toEqual([]);
  });

  it('index.css never uses the cold slate/cyan/blue/gray/zinc/neutral palette', () => {
    const re = /-\b(?:slate|cyan|blue|gray|zinc|neutral)\b(?:-[0-9]+)?/g;
    const hits = CLEAN.match(re) ?? [];
    expect(hits).toEqual([]);
  });

  it('keeps the checkerboard texture defined as a dithered conic grid', () => {
    const block = CSS.match(/\.pixel-grid\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(block).toContain('repeating-conic-gradient');
    expect(block).toContain('background-size');
  });

  it('keeps the stepped square dash token (pixel-dash-line)', () => {
    const block = CSS.match(/\.pixel-dash-line\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(block).toContain('repeating-linear-gradient');
    expect(block).not.toContain('border-dashed');
  });

  it('styles text selection in the warm chill register (no default cold blue)', () => {
    const block = CLEAN.match(/::selection\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(block).toContain('var(--color-chill-accent)');
    expect(block).toContain('var(--color-chill-on-accent)');
  });
});
describe('pixel2 focus-mode page grid', () => {
  it('focus mode also quiets the expenses full-canvas checkerboard (pixel-grid-page)', () => {
    const rules = CLEAN.split('\n').filter((l) => l.includes('.focus-mode') && l.includes('display: none'));
    expect(rules.join('\n')).toContain('.focus-mode .pixel-grid { display: none; }');
    expect(rules.join('\n')).toContain('.focus-mode .pixel-grid-page { display: none; }');
  });
});
