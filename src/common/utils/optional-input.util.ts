/**
 * Normalize optional caller-provided input coming from fonio.
 *
 * fonio often sends optional fields even when the guest hasn't provided them yet:
 * either as an empty string ("") or as an unresolved template placeholder
 * (e.g. "{{email}}"). With strict validators like @IsEmail() those values would
 * reject the WHOLE request with HTTP 400 — even though the required fields were valid.
 *
 * Returning undefined for these cases lets @IsOptional() skip validation, so a
 * verify call with valid dates + one identifier succeeds regardless of the other
 * (still empty) optional fields.
 */
export function normalizeOptionalInput(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Unresolved fonio template variable, e.g. "{{email}}" or "{{ phone }}".
  if (trimmed.includes('{{') || trimmed.includes('}}')) return undefined;
  return trimmed;
}
