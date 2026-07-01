/** Fields that can be required for guest verification (fonio → middleware). */
export const VERIFICATION_FIELD_OPTIONS = [
  'reservationId',
  'phone',
  'email',
  'arrivalDate',
  'departureDate',
  'listingName',
] as const;

export type VerificationField = (typeof VERIFICATION_FIELD_OPTIONS)[number];

export function isVerificationField(value: string): value is VerificationField {
  return (VERIFICATION_FIELD_OPTIONS as readonly string[]).includes(value);
}
