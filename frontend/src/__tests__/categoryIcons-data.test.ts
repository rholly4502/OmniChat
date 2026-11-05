import { describe, it, expect } from 'vitest';
import { CATEGORY_ICONS } from '../components/categoryIcons-data';

describe('category icon glyphs', () => {
  it('maps a dedicated coin glyph for salary ("Dari Gaji") instead of a heartbeat', () => {
    expect(CATEGORY_ICONS.Gaji).toBeDefined();
    expect(CATEGORY_ICONS.Gaji.length).toBeGreaterThan(0);
    // distinct from the Kesehatan (heartbeat) glyph
    expect(CATEGORY_ICONS.Gaji).not.toBe(CATEGORY_ICONS.Kesehatan);
  });

  it('keeps the fallback on Lain for unknown categories', () => {
    expect(CATEGORY_ICONS['TidakAda']).toBeUndefined();
  });
});
