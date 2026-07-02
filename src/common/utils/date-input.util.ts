/** Normalize caller date to YYYY-MM-DD (accepts ISO or DD.MM.YYYY). */
export function normalizeDateInput(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const dotted = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotted) {
    const [, d, m, y] = dotted;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const slashed = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashed) {
    const [, d, m, y] = slashed;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return v;
}
