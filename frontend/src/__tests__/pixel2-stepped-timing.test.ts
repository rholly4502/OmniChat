import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Source-level guard for the pixel2 stepped-timing register.
 *
 * The pixel2 design language snaps rather than tweens: hover colour/border
 * transitions are re-timed from Tailwind's default smooth `cubic-bezier`
 * easing to hard `steps(2, jump-none)` beats. That stepping comes from two
 * places in index.css:
 *
 *   1. a global rule on `button, a, select, input, summary, [role='button']`
 *      (the interactive tag set), and
 *   2. the `.pixel-shadow` / `.pixel-shadow-sm` class rules (which also set a
 *      120ms stepped duration).
 *
 * Any element OUTSIDE those two paths that still carries a `transition`
 * utility (e.g. a `div`, `li`, or `label` with `transition-colors`) is left
 * on Tailwind's default smooth easing — a subtle but real drift off the
 * register. This guard flags exactly that case so it can't silently return.
 *
 * Reads source because jsdom cannot resolve timing functions (and the global
 * selector does not apply in a unit-test environment either).
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

/** Tags covered by the global stepped-timing rule in index.css. */
const COVERED_TAGS = new Set(['button', 'a', 'select', 'input', 'summary', 'textarea']);

/** Any Tailwind transition utility (covers `transition`, `transition-colors`, ...). */
const HAS_TRANSITION = /(?:^|\s)transition(?:-[a-z]+)*(?:\s|$)/;
/** Explicit stepped timing present on the same element (arbitrary class). */
const HAS_STEPS = /transition-timing-function|steps\(/;
/** The pixel-shadow class rules themselves enforce stepping (120ms stepped). */
const HAS_PIXEL_SHADOW = /pixel-shadow/;

describe('pixel2 stepped-timing consistency', () => {
  it('every transition outside the covered tag set snaps (pixel-shadow or explicit steps)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      // Match an opening tag carrying a className attribute (same scanner family
      // as the other pixel2 guards).
      const re = /<(\w[\w-]*)([^>]*className="([^"]*)")[^>]*>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const tag = m[1];
        const attrs = m[2];
        const cls = m[3];
        if (COVERED_TAGS.has(tag)) continue;            // global rule covers it
        if (/role="button"/.test(attrs)) continue;      // global rule covers it
        if (!HAS_TRANSITION.test(cls)) continue;         // no transition to time
        if (HAS_STEPS.test(cls)) continue;               // explicit stepped timing
        if (HAS_PIXEL_SHADOW.test(cls)) continue;        // pixel-shadow class steps it
        const line = text.slice(0, m.index).split('\n').length;
        offenders.push(`${file.replace(SRC, 'src')}:${line} <${tag}> transition without stepped timing — ${cls}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
