/**
 * Shared pixel-ratio icon paths for expense categories.
 *
 * One source of truth for the per-category pixel glyphs so the category
 * breakdown, transaction badges and the "Pola pengeluaran" advice trend all
 * speak the same icon language. Pure data — the rendering component lives in
 * ./categoryIcons.tsx (kept separate so oxlint's only-export-components rule
 * stays quiet on the component file).
 */
export const CATEGORY_ICONS: Record<string, string> = {
  Makan: 'M9 3v4M15 3v4M4 7h16M6 7v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7M10 12h4',
  Transport: 'M8 4h8l3 5v10h-3M5 19v-5H4v5M8 8h8M9 17h.1M15 17h.1',
  Belanja: 'M4 5h3l1.5 10M4 5L3 8m1-3h16l-1.5 10H8.5M7 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM16 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  Tagihan: 'M7 3v18M17 3v18M5 5h14M5 19h14M8 8h.1M16 8h.1M8 12h.1M16 12h.1',
  Kesehatan: 'M12 4a3 3 0 0 1 3 3c2.5 0 4 1.5 4 4 0 3-2.5 6-7 9-4.5-3-7-6-7-9 0-2.5 1.5-4 4-4a3 3 0 0 1 3-3Z',
  Hiburan: 'M6 4l12 8-12 8V4Z',
  Nabung: 'M4 6h16v12H4V6ZM6 9h.1M6 15h.1M10 12h4',
  Lain: 'M12 3l3 3-3 3M9 6h6M12 15l3 3-3 3M9 18h6',
};
