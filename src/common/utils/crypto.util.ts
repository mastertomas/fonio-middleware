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

export function hashPhoneForStorage(phone: string): string {
  return hashValue(normalizePhone(phone));
}

export function phoneHashVariants(phone: string): string[] {
  const normalized = normalizePhone(phone);
  const variants = new Set<string>([hashValue(normalized), hashValue(phone)]);

  const digits = normalized.replace(/\D/g, '');
  if (digits.length >= 10) {
    variants.add(hashValue(digits.slice(-10)));
  }
  if (digits.startsWith('49') && digits.length > 10) {
    variants.add(hashValue(`+${digits}`));
    variants.add(hashValue(`0${digits.slice(2)}`));
  }

  return [...variants];
}

export function extractFirstName(maskedName: string | null): string | null {
  if (!maskedName) return null;
  const first = maskedName.trim().split(/\s+/)[0];
  if (!first || first === '*') return null;
  return first.replace(/\*+$/, '').length > 0
    ? first.replace(/\*+$/, '')
    : first[0];
}
