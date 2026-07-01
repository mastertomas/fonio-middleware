#!/usr/bin/env node
/**
 * Guest verification smoke test.
 * Usage: npm run test:verify -- --reservationId=123 --phone=+49... --arrival=2026-07-06 --departure=2026-07-16
 */
import 'dotenv/config';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    return [k, v ?? ''];
  }),
);

const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const apiKey = process.env.FONIO_API_KEY;

if (!apiKey) {
  console.error('ERROR: Set FONIO_API_KEY in .env');
  process.exit(1);
}

const reservationId = Number(args.reservationId || args.id);
if (!Number.isFinite(reservationId)) {
  console.error('ERROR: Pass --reservationId=HOSTAWAY_ID (from Reservations tab)');
  process.exit(1);
}

const body = {
  reservationId,
  phone: args.phone || undefined,
  email: args.email || undefined,
  arrivalDate: args.arrival || args.arrivalDate || undefined,
  departureDate: args.departure || args.departureDate || undefined,
  listingName: args.listingName || undefined,
};

console.log('Testing guest verification...');
console.log('POST', `${base}/api/v1/fonio/guest/verify`);
console.log('Body:', JSON.stringify(body, null, 2));
console.log('');

try {
  const res = await fetch(`${base}/api/v1/fonio/guest/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('FAILED', res.status);
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }
  console.log('OK verified:', data.verified);
  console.log('Matched fields:', (data.matchedFields || []).join(', '));
  console.log('Token received:', data.verificationToken ? 'yes (use for guest/reservation)' : 'no');
  if (data.reservation) {
    console.log('Reservation:', data.reservation.listingName, data.reservation.arrivalDate, '→', data.reservation.departureDate);
  }
} catch (error) {
  console.error('ERROR:', error instanceof Error ? error.message : error);
  process.exit(1);
}
