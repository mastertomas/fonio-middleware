/**
 * Start embedded PostgreSQL for local development (no Docker required).
 * Usage:
 *   node scripts/start-db.mjs           # start DB (keep terminal open)
 *   node scripts/start-db.mjs --migrate # start DB + run prisma migrate deploy
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dataDir = path.join(root, '.data', 'postgres');
const runMigrate = process.argv.includes('--migrate');

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'vermietung',
  password: 'vermietung',
  port: 5432,
  persistent: true,
  createPostgresUser: true,
  onLog: (msg) => console.log(`[postgres] ${msg}`),
  onError: (err) => console.error(`[postgres] ${err}`),
});

async function runPrismaMigrate() {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: root,
      shell: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL:
          'postgresql://vermietung:vermietung@localhost:5432/vermietung?schema=public',
      },
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prisma migrate deploy exited with code ${code}`));
    });
  });
}

async function main() {
  console.log('Starting embedded PostgreSQL...');
  console.log(`Data directory: ${dataDir}`);

  await pg.initialise();
  await pg.start();

  try {
    await pg.createDatabase('vermietung');
    console.log('Created database: vermietung');
  } catch {
    console.log('Database vermietung already exists');
  }

  console.log('');
  console.log('PostgreSQL is running:');
  console.log('  postgresql://vermietung:vermietung@localhost:5432/vermietung');
  console.log('');

  if (runMigrate) {
    console.log('Running prisma migrate deploy...');
    await runPrismaMigrate();
    console.log('Migrations applied.');
    console.log('');
    console.log('You can now run in another terminal:');
    console.log('  npm run start:dev');
    console.log('');
    console.log('Keep this terminal open while developing.');
  } else {
    console.log('Run migrations in another terminal:');
    console.log('  npm run prisma:deploy');
    console.log('');
    console.log('Then start the API:');
    console.log('  npm run start:dev');
    console.log('');
    console.log('Press Ctrl+C to stop PostgreSQL.');
  }

  const shutdown = async () => {
    console.log('\nStopping PostgreSQL...');
    await pg.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(async (err) => {
  console.error('Failed to start database:', err);
  try {
    await pg.stop();
  } catch {
    // ignore
  }
  process.exit(1);
});
