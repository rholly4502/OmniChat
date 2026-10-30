/** Short month label from a YYYY-MM key, e.g. "Okt". */
export function shortMonth(month: string): string {
  const [, mm] = month.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const idx = Number(mm) - 1;
  return names[idx] ?? mm;
}
