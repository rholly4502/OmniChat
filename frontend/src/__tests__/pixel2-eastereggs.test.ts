import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Source-level guards for the pixel2 "chill vibe" easter eggs and the
 * full-canvas checkerboard backdrop that the design direction mandates.
 *
 * Like the other pixel2 guards, these read source instead of rendering
 * (jsdom resolves neither Tailwind tokens nor geometry). They pin the
 * decorative easter eggs (Stardew Valley sage sprout, Dave-the-Diver
 * deep-sea bubble, the empty-state coin+fish) and the `.pixel-grid`
 * texture that the focused runtime must never silently drop — a refactor
 * that deleted the decorative layer would otherwise pass every rendered
 * test while erasing the theme's signature touches.
 */

const F = (p: string) => readFileSync(resolve(process.cwd(), 'src/' + p), 'utf8');

describe('pixel2 easter eggs + canvas texture', () => {
  it('keeps the full-canvas checkerboard backdrop on every app shell', () => {
    const app = F('App.tsx');
    // Both render paths (guest gate + main app) mount a full-bleed
    // `.pixel-grid` backdrop — the checkerboard canvas texture.
    const n = (app.match(/pixel-grid/g) ?? []).length;
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it('index.css defines the checkerboard texture (pixel grid), not a blur', () => {
    const css = F('index.css');
    const block = css.match(/\.pixel-grid\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(block).toContain('repeating-conic-gradient');
    expect(block).toContain('background-size');
  });

  it('ExpensesView keeps both easter-egg families (coin+fish, deep-sea bubble)', () => {
    const v = F('components/ExpensesView.tsx');
    // Empty-state reveal + its two decorative sprites (gold coin, fish).
    expect(v).toContain('harvest is coming');
    expect(v).toContain('text-chill-accent');     // coin
    expect(v).toContain('text-chill-deepsea');    // fish
    // Header bubble easter egg (Dave the Diver deep-sea accent).
    expect(v).toContain('Dave the Diver');
  });

  it('ExpensesView empty states carry the shared pixel glyph stamp', () => {
    const v = F('components/ExpensesView.tsx');
    expect(v).toContain('Belum ada transaksi.');
    expect(v).toContain('Tidak ada transaksi yang cocok dengan filter.');
    expect(v).toContain('M4 9h16M4 13h16M4 17h10'); // transactions-empty ledger
    expect(v).toContain('M15 15l4 4');               // filter no-match search lens
  });

  it('AdvicePanel keeps both easter-egg families (sage sprout, deep-sea bubble)', () => {
    const a = F('components/AdvicePanel.tsx');
    expect(a).toContain('Stardew Valley'); // sage sprout tooltip
    expect(a).toContain('Dave the Diver'); // deep-sea bubble tooltip
    expect(a).toContain('text-chill-sage');
    expect(a).toContain('text-chill-deepsea');
    expect(a).toContain('pixel-shine');    // golden-star shine sweep
  });
});
