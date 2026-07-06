/** Normalize caller date to YYYY-MM-DD (accepts ISO, DD.MM.YYYY, or German month names). */
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
  const german = v.match(/^(\d{1,2})\.?\s+([A-Za-zäöüÄÖÜ]+)\s+(\d{4})$/);
  if (german) {
    const month = GERMAN_MONTHS[german[2].toLowerCase()];
    if (month) {
      return `${german[3]}-${String(month).padStart(2, '0')}-${String(Number(german[1])).padStart(2, '0')}`;
    }
  }
  return v;
}

const GERMAN_MONTHS: Record<string, number> = {
  januar: 1,
  february: 2,
  februar: 2,
  märz: 3,
  maerz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};
