#!/usr/bin/env node
import { Client } from 'ssh2';

const pass = process.env.VPS_PASSWORD;
const cmd =
  'cd /root/fonio-middleware && docker compose -f docker-compose.prod.yml exec -T postgres psql -U vermietung -d vermietung ' +
  `-c "SELECT \\\"minMatchCount\\\", \\\"requiredFields\\\"::text FROM \\\"VerificationConfig\\\" WHERE \\\"isDefault\\\" = true;" ` +
  `-c "SELECT \\\"statusCode\\\", metadata->'requestReceived' as req, metadata->'responseRecorded'->>'verified' as verified, metadata->'responseRecorded'->>'matchedFields' as matched, metadata->'responseRecorded'->>'stillNeedCount' as still, metadata->'responseRecorded'->>'message' as msg, \\\"createdAt\\\" FROM \\\"ApiLog\\\" WHERE source='fonio' AND action='guest_verify' AND \\\"createdAt\\\" > NOW() - interval '6 hours' ORDER BY \\\"createdAt\\\" DESC LIMIT 25;"`;

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
