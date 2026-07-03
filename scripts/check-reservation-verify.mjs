#!/usr/bin/env node
import { Client } from 'ssh2';

const pass = process.env.VPS_PASSWORD;
const reservationId = 62363926;

const cmd =
  'cd /root/fonio-middleware && docker compose -f docker-compose.prod.yml exec -T postgres psql -U vermietung -d vermietung ' +
  `-c "SELECT r.\\\"hostawayId\\\", r.\\\"arrivalDate\\\", r.\\\"departureDate\\\", r.\\\"guestPhone\\\", r.\\\"phoneHash\\\", r.status, l.name as listing FROM \\\"Reservation\\\" r JOIN \\\"Listing\\\" l ON r.\\\"listingId\\\" = l.id WHERE r.\\\"hostawayId\\\" = ${reservationId};" ` +
  `-c "SELECT action, \\\"statusCode\\\", metadata->>'outcomeDetail' as detail, metadata->'requestReceived' as req, metadata->'responseRecorded' as resp, \\\"createdAt\\\" FROM \\\"ApiLog\\\" WHERE source='fonio' AND action='guest_verify' ORDER BY \\\"createdAt\\\" DESC LIMIT 5;" ` +
  `-c "SELECT \\\"minMatchCount\\\", \\\"requiredFields\\\", \\\"bookingOfferEnabled\\\" FROM \\\"VerificationConfig\\\" WHERE \\\"isDefault\\\" = true;"`;

const conn = new Client();
conn
  .on('ready', () => {
    conn.exec(cmd, (err, stream) => {
      if (err) throw err;
      stream.on('data', (d) => process.stdout.write(d));
      stream.stderr.on('data', (d) => process.stderr.write(d));
      stream.on('close', () => conn.end());
    });
  })
  .connect({
    host: '85.214.41.33',
    port: 22,
    username: 'root',
    password: pass,
    readyTimeout: 30000,
  });
