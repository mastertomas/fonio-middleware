#!/usr/bin/env node
/**
 * Guest verification smoke test.
 * Usage:
 *   npm run test:verify -- --reservationId=123 --phone=+49... --arrival=2026-07-06 --departure=2026-07-16
 *   npm run test:verify -- --arrival=2026-08-08 --departure=2026-08-10 --listingName=Wiesenblick --email=guest@example.com
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

const reservationId = args.reservationId || args.id
  ? Number(args.reservationId || args.id)
  : undefined;

if (!args.arrival && !args.arrivalDate) {
  console.error('ERROR: Pass --arrival=YYYY-MM-DD and --departure=YYYY-MM-DD');
  process.exit(1);
}

const body = {
  reservationId: Number.isFinite(reservationId) ? reservationId : undefined,
  phone: args.phone || undefined,
  email: args.email || undefined,
  arrivalDate: args.arrival || args.arrivalDate,
  departureDate: args.departure || args.departureDate,
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
