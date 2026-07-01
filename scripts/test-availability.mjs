#!/usr/bin/env node
/**
 * Quick availability API smoke test.
 * Usage: npm run test:availability
 *        npm run test:availability -- --city=Stuttgart --checkIn=2026-07-10 --checkOut=2026-07-15 --guests=2
 */
import 'dotenv/config';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);

const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const apiKey = process.env.FONIO_API_KEY;

if (!apiKey) {
  console.error('ERROR: Set FONIO_API_KEY in .env');
  process.exit(1);
}

const params = new URLSearchParams({
  city: args.city ?? 'Stuttgart',
  checkIn: args.checkIn ?? '2026-07-10',
  checkOut: args.checkOut ?? '2026-07-15',
  guests: args.guests ?? '2',
});
if (args.pets === 'true') params.set('pets', 'true');
if (args.availableOnly === 'true') params.set('availableOnly', 'true');

const url = `${base}/api/v1/fonio/availability?${params}`;

console.log('Testing availability...');
console.log('URL:', url);
console.log('');

try {
  const res = await fetch(url, {
    headers: { 'x-api-key': apiKey },
  });
  const body = await res.json();
  if (!res.ok) {
    console.error('FAILED', res.status, body);
    process.exit(1);
  }
  console.log('OK', res.status);
  if (body.meta) {
    console.log(
      `Data source: ${body.meta.dataSource} (${body.meta.responseMs} ms, cache incomplete: ${body.meta.cacheIncomplete ?? 0})`,
    );
    if (body.meta.hint) console.log('Hint:', body.meta.hint);
  }
  console.log('Available count:', body.availableCount);
  console.log('Total results:', body.results?.length ?? 0);
  const sample = (body.results ?? []).slice(0, 5);
  for (const r of sample) {
    console.log(
      `  - [${r.available ? 'YES' : 'no'}] ${r.name} (${r.city}) guests≤${r.maxGuests}${r.groupName ? ` · ${r.groupName}` : ''}`,
    );
  }
  if ((body.results ?? []).length > 5) {
    console.log(`  ... and ${body.results.length - 5} more`);
  }
} catch (error) {
  console.error('ERROR:', error instanceof Error ? error.message : error);
  console.error('Is the API running? Try: npm run start:dev');
  process.exit(1);
}
