import { CATEGORY_ICONS } from './categoryIcons-data';

/**
 * Shared pixel-ratio icon for an expense category (inline SVG, stroke =
 * currentColor, hard square line-joins). One source of truth across the
 * expenses page: category breakdown, transaction badges and the
 * "Pola pengeluaran" advice trend all use the same glyphs.
 */
export function CategoryIcon({ kategori, className = '' }: { kategori: string; className?: string }) {
  const d = CATEGORY_ICONS[kategori] ?? CATEGORY_ICONS.Lain;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      className={`shrink-0 w-5 h-5 ${className}`}
    >
      <path d={d} />
    </svg>
  );
}
