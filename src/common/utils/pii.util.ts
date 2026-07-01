import { maskGuestName } from './crypto.util';

export function maskEmail(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `***${digits.slice(-4)}`;
}

export function maskReservationForViewer<
  T extends {
    guestName?: string | null;
    guestEmail?: string | null;
    guestPhone?: string | null;
    guestNameMasked?: string | null;
  },
>(reservation: T): T {
  return {
    ...reservation,
    guestName: reservation.guestNameMasked ?? maskGuestName(reservation.guestName ?? ''),
    guestEmail: maskEmail(reservation.guestEmail),
    guestPhone: maskPhone(reservation.guestPhone),
  };
}
