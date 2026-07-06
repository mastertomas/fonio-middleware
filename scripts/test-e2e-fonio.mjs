#!/usr/bin/env node
/**
 * End-to-end fonio flow smoke test (production or local).
 * Usage: APP_URL=https://vermietung.brainions.digital node scripts/test-e2e-fonio.mjs
 */
import 'dotenv/config';

const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const apiKey = process.env.FONIO_API_KEY;
const RESERVATION_ID = Number(process.env.TEST_RESERVATION_ID ?? 62363926);

if (!apiKey) {
  console.error('ERROR: Set FONIO_API_KEY in .env');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': apiKey,
};

const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

console.log(`\n=== fonio E2E test @ ${base} ===\n`);

// 1. Health
{
  const res = await fetch(`${base}/health`);
  const data = await res.json();
  if (res.ok && data.status === 'ok') pass('Health check');
  else fail('Health check', JSON.stringify(data));
}

// 2. Call context (inbound webhook simulation)
{
  const { res, data } = await api('POST', '/api/v1/fonio/call-context', {
    callerNumber: '+4915150601701',
  });
  if (res.ok && data.verification_hint_de && data.verification_additional_min_match_count !== undefined) {
    pass(
      'Call context (inbound webhook)',
      `additionalMin=${data.verification_additional_min_match_count}, minMatch=${data.verification_min_match_count}`,
    );
  } else {
    fail('Call context', `status=${res.status}`);
  }
}

// 3. Requirements
{
  const { res, data } = await api('GET', '/api/v1/fonio/guest/verify/requirements');
  if (
    res.ok &&
    data.additionalMinMatchCount === 2 &&
    data.minMatchCount === 3 &&
    data.guestScriptDe?.includes('2 weitere')
  ) {
    pass('Verify requirements', `minMatch=3, additionalMin=2`);
  } else {
    fail('Verify requirements', JSON.stringify({
      minMatchCount: data.minMatchCount,
      additionalMinMatchCount: data.additionalMinMatchCount,
      scriptSnippet: data.guestScriptDe?.slice(0, 80),
    }));
  }
}

// 4. Verify — Frank scenario (dates + listing + reservation, NO email)
let verificationToken = '';
let guestNameHint = '';
{
  const { res, data } = await api('POST', '/api/v1/fonio/guest/verify', {
    arrivalDate: '2026-08-08',
    departureDate: '2026-08-10',
    reservationId: RESERVATION_ID,
    listingName: 'Wiesenblick',
  });
  if (res.ok && data.verified && data.verificationToken) {
    verificationToken = data.verificationToken;
    guestNameHint = data.guestNameHint ?? data.reservation?.guestNameHint ?? '';
    const matched = (data.matchedFields || []).join(', ');
    pass('Verify (dates + listing + res#, no email)', `matched: ${matched}`);
    if (data.postVerifyHintDe) pass('Verify postVerifyHintDe present');
    else fail('Verify postVerifyHintDe missing');
  } else {
    fail('Verify Frank scenario', `${res.status} ${JSON.stringify(data)}`);
  }
}

// 5. Verify — German month dates
{
  const { res, data } = await api('POST', '/api/v1/fonio/guest/verify', {
    arrivalDate: '8. August 2026',
    departureDate: '10. August 2026',
    reservationId: RESERVATION_ID,
    phone: '0151 50601701',
  });
  if (res.ok && data.verified) pass('Verify German date format');
  else fail('Verify German dates', `${res.status}`);
}

// 6. Verify failure — only 2 matches (dates + listing)
{
  const { res, data } = await api('POST', '/api/v1/fonio/guest/verify', {
    arrivalDate: '2026-08-08',
    departureDate: '2026-08-10',
    listingName: 'Wiesenblick',
  });
  const body = data.message && typeof data === 'object' ? data : data;
  const msg = body.message ?? data.message;
  const whatToAsk = body.whatToAskDe ?? data.whatToAskDe;
  if (res.status === 401 && (whatToAsk || body.stillNeedCount)) {
    pass('Verify partial fail returns whatToAskDe', whatToAsk?.slice(0, 60) ?? `stillNeed=${body.stillNeedCount}`);
  } else if (res.status === 401) {
    pass('Verify partial fail (401)', msg);
  } else {
    fail('Verify partial should fail with 2 matches only', `status=${res.status} verified=${data.verified}`);
  }
}

if (!verificationToken) {
  console.error('\nCannot continue guest-request tests without token.\n');
  process.exit(1);
}

// 7. Get reservation with token
{
  const url = `${base}/api/v1/fonio/guest/reservation?reservationId=${RESERVATION_ID}&verificationToken=${encodeURIComponent(verificationToken)}`;
  const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
  const data = await res.json();
  if (res.ok && data.listingName && data.guestNameHint !== undefined) {
    pass('Get reservation (verified)', data.listingName);
  } else {
    fail('Get reservation', `${res.status}`);
  }
}

// 8. Guest request ADD_PET
{
  const { res, data } = await api('POST', '/api/v1/fonio/guest/requests', {
    reservationId: RESERVATION_ID,
    requestType: 'ADD_PET',
    verificationToken,
    details: { note: 'E2E test: Hund dazubuchen' },
  });
  if (res.ok && data.guestMessageDe) {
    pass('Guest request ADD_PET', data.guestMessageDe);
  } else {
    fail('Guest request ADD_PET', `${res.status} ${JSON.stringify(data)}`);
  }
}

// 9. Guest request ADD_GUEST
{
  const { res, data } = await api('POST', '/api/v1/fonio/guest/requests', {
    reservationId: RESERVATION_ID,
    requestType: 'ADD_GUEST',
    verificationToken,
    additionalGuests: 1,
    details: { note: 'E2E test: zusätzlicher Gast' },
  });
  if (res.ok && data.guestMessageDe) {
    pass('Guest request ADD_GUEST', data.guestMessageDe);
  } else {
    fail('Guest request ADD_GUEST', `${res.status} ${JSON.stringify(data)}`);
  }
}

// 10. Guest request without token (must fail)
{
  const { res, data } = await api('POST', '/api/v1/fonio/guest/requests', {
    reservationId: RESERVATION_ID,
    requestType: 'ADD_PET',
    details: { note: 'should fail' },
  });
  if (res.status === 401 || res.status === 400) {
    pass('Guest request without token rejected', `status=${res.status}`);
  } else {
    fail('Guest request without token should fail', `status=${res.status}`);
  }
}

// Summary
const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (guestNameHint) console.log(`Guest name hint: ${guestNameHint}`);
if (failed.length) {
  console.error('\nFailed:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}
console.log('\nAll fonio flows OK.\n');
