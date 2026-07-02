#!/usr/bin/env node
/** Upload local files to VPS and rebuild (no git required). */
import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VPS_HOST = process.env.VPS_HOST ?? '85.214.41.33';
const VPS_USER = process.env.VPS_USER ?? 'root';
const VPS_PASS = process.env.VPS_PASSWORD;
const APP_DIR = process.env.DEPLOY_APP_DIR ?? '/root/fonio-middleware';

const FILES = [
  'public/admin/app.js',
  'public/admin/index.html',
  'src/admin/dto/admin-users.dto.ts',
  'src/admin/admin-users.service.ts',
];

if (!VPS_PASS) {
  console.error('ERROR: Set VPS_PASSWORD');
  process.exit(1);
}

function exec(conn, command, timeoutMs = 1_800_000) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stderr = '';
      const timer = setTimeout(() => {
        stream.close();
        reject(new Error(`Timeout: ${command}`));
      }, timeoutMs);
      stream
        .on('close', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error(stderr || `Failed: ${command}`));
        })
        .on('data', (d) => process.stdout.write(d.toString()))
        .stderr.on('data', (d) => {
          stderr += d.toString();
          process.stderr.write(d.toString());
        });
    });
  });
}

function upload(conn, remotePath, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const stream = sftp.createWriteStream(remotePath);
      stream.on('close', resolve);
      stream.on('error', reject);
      stream.end(content);
    });
  });
}

const conn = new Client();
conn
  .on('ready', async () => {
    try {
      console.log('\n=== Syncing files to VPS ===\n');
      for (const file of FILES) {
        const content = readFileSync(join(ROOT, file), 'utf8');
        await upload(conn, `${APP_DIR}/${file}`, content);
        console.log(`Uploaded ${file}`);
      }
      await exec(
        conn,
        `cd "${APP_DIR}" && docker compose -f docker-compose.prod.yml up -d --build`,
      );
      await exec(
        conn,
        `sleep 20 && curl -fsS https://vermietung.brainions.digital/health`,
        60_000,
      );
      console.log('\n=== Sync complete ===\n');
    } catch (e) {
      console.error('SYNC FAILED:', e.message);
      process.exitCode = 1;
    } finally {
      conn.end();
    }
  })
  .connect({
    host: VPS_HOST,
    port: 22,
    username: VPS_USER,
    password: VPS_PASS,
    readyTimeout: 30_000,
    algorithms: { serverHostKey: ['ssh-rsa', 'ssh-ed25519', 'ecdsa-sha2-nistp256'] },
  });
