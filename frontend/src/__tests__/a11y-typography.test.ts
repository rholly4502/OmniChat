import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Source-level guards for the two floors the UI has already regressed on once.
 *
 * They read the source instead of rendering because jsdom resolves neither
 * Tailwind's colour tokens nor its computed text size -- a rendered assertion
 * would pass no matter which class was used.
 */

const SRC = resolve(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Tests assert about the components; they are not shipped UI.
      if (entry.name === '__tests__') continue;
      out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Measured against the surfaces this app actually uses:
 *   slate-500 #64748b -> 4.24:1 on slate-950, 3.75:1 on slate-900,
 *                        3.07:1 on slate-800  (AA needs 4.5:1 for body text)
 *   slate-600 #475569 -> worse on all three
 *   slate-400 #94a3b8 -> 7.87 / 6.96 / 5.71  (passes everywhere)
 */
const FAILING_CONTRAST = /text-slate-(500|600)\b/;

/** 12px is the legibility floor on mobile; `md:`-prefixed sizes are pointer-only. */
function bareSubTwelvePx(line: string): string[] {
  const hits: string[] = [];
  const re = /text-\[(\d+)px\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (Number(m[1]) >= 12) continue;
    // `md:text-[11px]` is a deliberate desktop-density variant; `text-[11px]` is not.
    const prefixed = line[m.index - 1] === ':';
    if (!prefixed) hits.push(m[0]);
  }
  return hits;
}

describe('typography and contrast floors', () => {
  const files = sourceFiles(SRC);

  it('scans the real source tree', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('never uses a text colour that fails WCAG AA on any app surface', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (FAILING_CONTRAST.test(line)) {
          offenders.push(`${file.replace(SRC, 'src')}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('never sets a bare text size below 12px', () => {
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const hits = bareSubTwelvePx(line);
        if (hits.length > 0) {
          offenders.push(`${file.replace(SRC, 'src')}:${i + 1}: ${hits.join(', ')}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
