#!/usr/bin/env node
/**
 * Verify Hostaway Public API access including Messaging/Conversations.
 * Usage: npm run test:hostaway
 */
import 'dotenv/config';

const accountId = process.env.HOSTAWAY_ACCOUNT_ID;
const apiSecret = process.env.HOSTAWAY_API_SECRET;
const base =
  (process.env.HOSTAWAY_API_BASE_URL ?? 'https://api.hostaway.com/v1').replace(
    /\/$/,
    '',
  );

if (!accountId || !apiSecret) {
  console.error('ERROR: Set HOSTAWAY_ACCOUNT_ID and HOSTAWAY_API_SECRET in .env');
  process.exit(1);
}

async function getToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: accountId,
    client_secret: apiSecret,
    scope: 'general',
  });
  const res = await fetch(`${base}/accessTokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Token failed: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function apiGet(token, path) {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return { status: res.status, data };
}

console.log('Hostaway API credential check\n');

try {
  console.log('1. Access token...');
  const token = await getToken();
  console.log('   OK\n');

  console.log('2. Listings (GET /listings?limit=1)...');
  const listings = await apiGet(token, '/listings?limit=1');
  const listingCount = listings.data?.result?.length ?? 0;
  if (listings.status !== 200) {
    console.error('   FAILED', listings.status, listings.data);
    process.exit(1);
  }
  console.log(`   OK (${listingCount} listing in sample)\n`);

  console.log('3. Conversations / Messaging API (GET /conversations?limit=1)...');
  const conv = await apiGet(token, '/conversations?limit=1');
  if (conv.status === 403 || conv.status === 401) {
    console.error(
      '   FAILED — Messaging API may not be enabled for this account.',
    );
    console.error('   Contact Hostaway support to enable conversation API access.');
    console.error('   Response:', conv.status, JSON.stringify(conv.data));
    process.exit(1);
  }
  if (conv.status !== 200) {
    console.error('   UNEXPECTED', conv.status, conv.data);
    process.exit(1);
  }
  const convCount = conv.data?.result?.length ?? 0;
  console.log(`   OK (${convCount} conversation in sample)`);
  console.log(
    '\n✓ Credentials are sufficient for listings AND messaging/inbox API.',
  );
  console.log(
    '  Guest request forwarding uses POST /conversations/{id}/messages',
  );
} catch (error) {
  console.error('ERROR:', error instanceof Error ? error.message : error);
  process.exit(1);
}
