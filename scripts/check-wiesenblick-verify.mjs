#!/usr/bin/env node
import { Client } from 'ssh2';

const pass = process.env.VPS_PASSWORD;
const cmd =
  'cd /root/fonio-middleware && docker compose -f docker-compose.prod.yml exec -T postgres psql -U vermietung -d vermietung ' +
  `-c "SELECT r.\\\"hostawayId\\\", r.\\\"arrivalDate\\\", r.\\\"departureDate\\\", r.\\\"guestPhone\\\", r.status, l.name FROM \\\"Reservation\\\" r JOIN \\\"Listing\\\" l ON r.\\\"listingId\\\" = l.id WHERE l.name ILIKE '%Wiesenblick%' AND r.\\\"arrivalDate\\\" >= '2025-07-01' AND r.\\\"arrivalDate\\\" <= '2026-08-01' ORDER BY r.\\\"arrivalDate\\\" DESC LIMIT 15;" ` +
  `-c "SELECT r.\\\"hostawayId\\\", r.\\\"arrivalDate\\\", r.\\\"departureDate\\\", r.\\\"guestPhone\\\", l.name FROM \\\"Reservation\\\" r JOIN \\\"Listing\\\" l ON r.\\\"listingId\\\" = l.id WHERE r.\\\"guestPhone\\\" LIKE '%3569939%' OR r.\\\"guestPhone\\\" LIKE '%1713569939%' LIMIT 5;" ` +
  `-c "SELECT action, \\\"statusCode\\\", metadata->'requestReceived' as req, metadata->'responseRecorded' as resp, \\\"createdAt\\\" FROM \\\"ApiLog\\\" WHERE source='fonio' AND action='guest_verify' AND \\\"createdAt\\\" > NOW() - interval '2 days' ORDER BY \\\"createdAt\\\" DESC LIMIT 5;"`;

const c = new Client();
c.on('ready', () => {
  c.exec(cmd, (e, s) => {
    if (e) throw e;
    s.on('data', (d) => process.stdout.write(d));
    s.stderr.on('data', (d) => process.stderr.write(d));
    s.on('close', () => c.end());
  });
}).connect({ host: '85.214.41.33', port: 22, username: 'root', password: pass, readyTimeout: 30000 });
