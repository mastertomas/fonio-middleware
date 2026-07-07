/** Hostaway / PostgreSQL integer limit for reservation IDs. */
export const MAX_HOSTAWAY_RESERVATION_ID = 2_147_483_647;

export function isValidHostawayReservationId(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_HOSTAWAY_RESERVATION_ID
  );
}

/**
 * Parse reservation ID from fonio input.
 * Strips spaces/dashes (e.g. "641 7940826"). Returns undefined if not a valid Hostaway ID.
 * Booking.com confirmation numbers are often too large — those are NOT Hostaway IDs.
 */
export function parseReservationIdInput(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.round(value);
    return isValidHostawayReservationId(n) ? n : undefined;
  }
  const raw = String(value).trim();
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return undefined;
  const n = Number(digits);
  if (!Number.isFinite(n) || !isValidHostawayReservationId(n)) return undefined;
  return n;
}

export function looksLikeChannelConfirmationNotHostawayId(value: unknown): boolean {
  if (value === '' || value === null || value === undefined) return false;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 8) return false;
  const n = Number(digits);
  return Number.isFinite(n) && n > MAX_HOSTAWAY_RESERVATION_ID;
}
