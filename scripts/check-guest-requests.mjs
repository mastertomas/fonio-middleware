#!/usr/bin/env node
import { Client } from 'ssh2';

const pass = process.env.VPS_PASSWORD;
const hostawayId = process.argv[2] ?? '62363926';
const cmd =
  'cd /root/fonio-middleware && docker compose -f docker-compose.prod.yml exec -T postgres psql -U vermietung -d vermietung ' +
  `-c "SELECT gr.\\\"requestType\\\", gr.status, gr.\\\"forwardedToHostaway\\\", gr.\\\"hostawayMessageId\\\", gr.payload::text, gr.\\\"createdAt\\\", r.\\\"hostawayId\\\", r.\\\"numberOfGuests\\\", r.pets FROM \\\"GuestRequest\\\" gr JOIN \\\"Reservation\\\" r ON gr.\\\"reservationId\\\" = r.id WHERE r.\\\"hostawayId\\\" = ${hostawayId} ORDER BY gr.\\\"createdAt\\\" DESC LIMIT 10;" ` +
  `-c "SELECT action, \\\"statusCode\\\", metadata->'requestReceived' as req, metadata->'responseRecorded' as resp, \\\"createdAt\\\" FROM \\\"ApiLog\\\" WHERE source='fonio' AND action='guest_request' AND metadata::text LIKE '%${hostawayId}%' ORDER BY \\\"createdAt\\\" DESC LIMIT 10;"`;

const c = new Client();
c.on('ready', () => {
  c.exec(cmd, (e, s) => {
    if (e) throw e;
    s.on('data', (d) => process.stdout.write(d));
    s.stderr.on('data', (d) => process.stderr.write(d));
    s.on('close', () => c.end());
  });
}).connect({
  host: '85.214.41.33',
  port: 22,
  username: 'root',
  password: pass,
  readyTimeout: 30000,
});
