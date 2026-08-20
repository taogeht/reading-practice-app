// Refreshes the local dev database from a production snapshot, so the whole
// app can be exercised locally instead of round-tripping through a VPS deploy.
//
// Both pg_dump and pg_restore run INSIDE the dev Postgres container. The host's
// Homebrew pg_dump is a different major version than the container's server,
// and a newer archive format cannot be read by an older pg_restore — running
// both in the container keeps client and server versions identical by
// construction.
//
// Usage:
//   npm run db:sync-from-prod              # dump prod, restore into local
//   npm run db:sync-from-prod -- --reuse   # restore the last snapshot again
//   npm run db:sync-from-prod -- --dump-only
//
// Requires PROD_DATABASE_URL and DATABASE_URL in .env.local. Snapshots land in
// .local-snapshots/ (gitignored via .env*-adjacent rules; see below).
//
// SAFETY: refuses to run unless DATABASE_URL points at localhost. The restore
// uses --clean --if-exists, which drops every object it is about to recreate;
// pointed at prod that would be catastrophic, so the guard is not optional.

import './_bootstrap-env';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CONTAINER = 'rhw-postgres-dev';
const SNAPSHOT_DIR = path.resolve(process.cwd(), '.local-snapshots');
const SNAPSHOT = path.join(SNAPSHOT_DIR, 'prod.dump');

const ARGS = process.argv.slice(2);
const REUSE = ARGS.includes('--reuse');
const DUMP_ONLY = ARGS.includes('--dump-only');

/** Local-only hosts. Anything else means DATABASE_URL is not a dev database. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function parsed(url: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }
}

/** Never let a connection string reach stdout — these get pasted into issues. */
function redact(url: string): string {
  const u = parsed(url);
  return `${u.protocol}//<redacted>@${u.host}${u.pathname}`;
}

function run(cmd: string, args: string[], opts: { stdinFile?: string; stdoutFile?: string } = {}): void {
  const stdin = opts.stdinFile ? fs.openSync(opts.stdinFile, 'r') : 'inherit';
  const stdout = opts.stdoutFile ? fs.openSync(opts.stdoutFile, 'w') : 'inherit';
  const result = spawnSync(cmd, args, {
    stdio: [stdin as never, stdout as never, 'inherit'],
    encoding: 'utf-8',
  });
  if (typeof stdin === 'number') fs.closeSync(stdin);
  if (typeof stdout === 'number') fs.closeSync(stdout);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args[0]} exited with code ${result.status}`);
  }
}

function main(): void {
  const localUrl = process.env.DATABASE_URL;
  if (!localUrl) throw new Error('DATABASE_URL is not set (expected in .env.local).');

  const local = parsed(localUrl);
  if (!LOCAL_HOSTS.has(local.hostname)) {
    throw new Error(
      `Refusing to run: DATABASE_URL points at "${local.hostname}", not localhost.\n`
        + 'This script drops and recreates every table in the target database.',
    );
  }
  const localDb = local.pathname.replace(/^\//, '');
  const localUser = decodeURIComponent(local.username) || 'rhw';

  // Confirm the container is actually the thing on that port, so we never
  // restore into some other Postgres that happens to be listening locally.
  const inspect = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER], {
    encoding: 'utf-8',
  });
  if (inspect.status !== 0 || inspect.stdout.trim() !== 'true') {
    throw new Error(
      `Container "${CONTAINER}" is not running.\n`
        + 'Start it with: docker compose -f docker-compose.dev.yml up -d',
    );
  }

  if (!REUSE) {
    const prodUrl = process.env.PROD_DATABASE_URL;
    if (!prodUrl) {
      throw new Error(
        'PROD_DATABASE_URL is not set. Add it to .env.local (copy it from the '
          + 'Coolify service env), or pass --reuse to restore the last snapshot.',
      );
    }
    parsed(prodUrl); // validate before shelling out

    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    console.log(`Dumping ${redact(prodUrl)}`);
    console.log(`  → ${SNAPSHOT}`);
    // -Fc so the restore can be selective and parallel later if needed.
    run(
      'docker',
      [
        'exec',
        '-e', `PGURL=${prodUrl}`,
        CONTAINER,
        'sh', '-c',
        'pg_dump "$PGURL" -Fc --no-owner --no-acl',
      ],
      { stdoutFile: SNAPSHOT },
    );
    const mb = (fs.statSync(SNAPSHOT).size / 1024 / 1024).toFixed(1);
    console.log(`  ✓ ${mb} MB`);
  }

  if (DUMP_ONLY) {
    console.log('\n--dump-only: stopping before the restore.');
    return;
  }

  if (!fs.existsSync(SNAPSHOT)) {
    throw new Error(`No snapshot at ${SNAPSHOT}. Run without --reuse first.`);
  }

  // Drop and recreate the database rather than pg_restore --clean. --clean
  // emits DROPs in TOC order, not dependency order, so a table referenced by a
  // surviving foreign key refuses to drop and the restore limps on into
  // "already exists" and duplicate-primary-key errors. A fresh database has no
  // such ordering problem and cannot leave stale objects behind.
  console.log(`\nRecreating ${localDb} on ${local.host}`);
  const psql = (sql: string) =>
    run('docker', [
      'exec', CONTAINER,
      'psql', '-U', localUser, '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql,
    ]);
  // FORCE terminates any leftover connections (a dev server holding its pool
  // open would otherwise block the drop). Requires PG13+.
  psql(`DROP DATABASE IF EXISTS "${localDb}" WITH (FORCE)`);
  psql(`CREATE DATABASE "${localDb}" OWNER "${localUser}"`);

  console.log(`Restoring into ${redact(localUrl)}`);
  // --exit-on-error: a partially restored dev database that looks fine until a
  // specific page 500s is worse than a loud failure here.
  run(
    'docker',
    [
      'exec', '-i',
      CONTAINER,
      'pg_restore',
      '--no-owner', '--no-acl',
      '--exit-on-error',
      '-U', localUser,
      '-d', localDb,
    ],
    { stdinFile: SNAPSHOT },
  );
  console.log('  ✓ restored');
  console.log('\nNext: npm run check:migrations');
}

try {
  main();
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
