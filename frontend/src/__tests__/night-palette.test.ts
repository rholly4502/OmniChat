import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Source-level guards for the night/calm ("Mode Malam") palette.
 *
 * We read index.css instead of rendering because jsdom does not resolve
 * Tailwind colour tokens. A rendered assertion would pass no matter what the
 * tokens contained. This keeps the night swatches from drifting below WCAG AA
 * on a future edit.
 */
const CSS = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

function tokenBlock(name: string): Record<string, string> {
  const re = new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`);
  const m = CSS.match(re);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const match of m[1].matchAll(/--color-chill-([\w-]+):\s*(#[\da-fA-F]{6})/g)) {
    out[match[1]] = match[2];
  }
  return out;
}

function relLum(hex: string): number {
  const n = hex.slice(1);
  const [r0, g0, b0] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r0) + 0.7152 * lin(g0) + 0.0722 * lin(b0);
}
function ratio(a: string, b: string): number {
  const la = relLum(a);
  const lb = relLum(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const ALL_TOKENS = [
  'bg', 'surface', 'elevated', 'border', 'text', 'muted', 'accent',
  'on-accent', 'red', 'on-red', 'accent-hover', 'accent-active',
  'red-hover', 'red-active', 'sage', 'deepsea',
];

describe('night mode palette', () => {
  it('redefines every chill token inside .night-mode', () => {
    const toks = tokenBlock('night-mode');
    for (const tok of ALL_TOKENS) {
      expect(toks[tok], `${tok} token missing`).toBeTruthy();
    }
  });

  it('meets WCAG AA foreground contrast on the night background', () => {
    const t = tokenBlock('night-mode');
    const bg = t.bg;
    for (const fg of [t.text, t.muted, t.accent, t['accent-hover'], t.red]) {
      expect(ratio(fg, bg), `${fg} vs ${bg} must be >= 4.5:1`).toBeGreaterThanOrEqual(4.5);
    }
    // inputs render primary text on the elevated surface — same 4.5:1 floor
    expect(ratio(t.text, t.surface)).toBeGreaterThanOrEqual(4.5);
    // button text on its own fill
    expect(ratio(t['on-accent'], t.accent)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t['on-red'], t.red)).toBeGreaterThanOrEqual(4.5);
  });
});
