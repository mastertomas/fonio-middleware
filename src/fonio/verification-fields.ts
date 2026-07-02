/** Fields that can be required for guest verification (fonio → middleware). */
export const VERIFICATION_FIELD_OPTIONS = [
  'stayDates',
  'listingName',
  'phone',
  'email',
  'reservationId',
] as const;

/** @deprecated Legacy config values — mapped to stayDates on read */
export const LEGACY_DATE_FIELDS = ['arrivalDate', 'departureDate'] as const;

export type VerificationField = (typeof VERIFICATION_FIELD_OPTIONS)[number];

export function isVerificationField(value: string): value is VerificationField {
  return (VERIFICATION_FIELD_OPTIONS as readonly string[]).includes(value);
}

export function normalizeVerificationConfigFields(
  fields: string[],
): VerificationField[] {
  const mapped: VerificationField[] = [];
  let hasStayDates = false;

  for (const field of fields) {
    if (
      field === 'arrivalDate' ||
      field === 'departureDate' ||
      field === 'stayDates'
    ) {
      hasStayDates = true;
      continue;
    }
    if (isVerificationField(field)) {
      mapped.push(field);
    }
  }

  const normalized: VerificationField[] = hasStayDates ? ['stayDates'] : [];
  for (const field of mapped) {
    if (!normalized.includes(field)) normalized.push(field);
  }
  if (!normalized.includes('stayDates')) {
    normalized.unshift('stayDates');
  }
  return normalized;
}
