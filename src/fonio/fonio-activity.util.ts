import { maskEmail, maskPhone } from '../common/utils/pii.util';

const SENSITIVE_KEYS = new Set([
  'phone',
  'callerNumber',
  'caller_phone',
  'guestEmail',
  'email',
  'verificationToken',
  'password',
  'guestName',
  'guestFirstName',
  'guestLastName',
]);

export type FonioActivityOutcome = 'success' | 'failed';

export function sanitizeFonioValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (key === 'verificationToken' && typeof value === 'string') {
    return value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : '[token]';
  }
  if (
    (key === 'phone' || key === 'callerNumber' || key === 'caller_phone') &&
    typeof value === 'string'
  ) {
    return maskPhone(value) ?? '[phone]';
  }
  if ((key === 'email' || key === 'guestEmail') && typeof value === 'string') {
    return maskEmail(value) ?? '[email]';
  }
  if (typeof value === 'string' && value.length > 500) {
    return `${value.slice(0, 500)}…`;
  }
  return value;
}

export function sanitizeFonioPayload(
  input: unknown,
  depth = 0,
): unknown {
  if (depth > 4) return '[nested]';
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeFonioPayload(item, depth + 1));
  }
  if (typeof input !== 'object') return input;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      out[key] = sanitizeFonioValue(key, value);
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      out[key] = sanitizeFonioPayload(value, depth + 1);
    } else {
      out[key] = sanitizeFonioValue(key, value);
    }
  }
  return out;
}

export function listProvidedVerifyFields(dto: {
  reservationId?: number;
  phone?: string;
  email?: string;
  listingName?: string;
  arrivalDate?: string;
  departureDate?: string;
}): string[] {
  const fields: string[] = [];
  if (dto.arrivalDate && dto.departureDate) fields.push('stayDates');
  if (dto.reservationId !== undefined) fields.push('reservationId');
  if (dto.phone?.trim()) fields.push('phone');
  if (dto.email?.trim()) fields.push('email');
  if (dto.listingName?.trim()) fields.push('listingName');
  return fields;
}

export function buildFonioActivityMetadata(params: {
  callId?: string | null;
  requestReceived?: unknown;
  middlewareAction: string;
  outcome: FonioActivityOutcome;
  outcomeDetail?: string;
  responseRecorded?: unknown;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    callId: params.callId ?? null,
    requestReceived: sanitizeFonioPayload(params.requestReceived ?? {}),
    middlewareAction: params.middlewareAction,
    outcome: params.outcome,
    outcomeDetail: params.outcomeDetail ?? null,
    responseRecorded: sanitizeFonioPayload(params.responseRecorded ?? {}),
    ...(params.extra ?? {}),
  };
}
