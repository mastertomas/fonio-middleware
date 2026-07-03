#!/usr/bin/env node
import { Client } from 'ssh2';

const pass = process.env.VPS_PASSWORD;
if (!pass) {
  console.error('Set VPS_PASSWORD');
  process.exit(1);
}

const cmd =
  'cd /root/fonio-middleware && docker compose -f docker-compose.prod.yml exec -T postgres psql -U vermietung -d vermietung ' +
  `-c 'SELECT * FROM "LogSettings";' ` +
  `-c 'SELECT source, action, "createdAt", "expiresAt" FROM "ApiLog" ORDER BY "createdAt" DESC LIMIT 5;'`;

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
