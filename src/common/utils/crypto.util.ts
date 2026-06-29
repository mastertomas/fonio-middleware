import { createHash } from 'crypto';

export function hashValue(value: string, pepper = ''): string {
  return createHash('sha256')
    .update(`${pepper}:${value.trim().toLowerCase()}`)
    .digest('hex');
}

export function maskGuestName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .map((part) => (part.length <= 1 ? '*' : `${part[0]}${'*'.repeat(part.length - 1)}`))
    .join(' ');
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a).replace(/^00/, '+');
  const nb = normalizePhone(b).replace(/^00/, '+');
  if (na === nb) return true;
  const da = na.replace(/\D/g, '').slice(-10);
  const db = nb.replace(/\D/g, '').slice(-10);
  return da.length >= 8 && da === db;
}

export function emailsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
