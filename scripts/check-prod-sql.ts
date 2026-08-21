// Reports which ops/prod-sql/*.sql files have been applied to a database.
//
// Reads the ledger rather than the schema: each file records its own id in
// `data_migrations` when it runs, so the row is the proof. A file whose
// statements happen to be idempotent still shows as PENDING until it has
// actually been run — which is the point, since "did I ever paste this into
// prod?" is the question this answers.
//
// Usage:
//   npm run check:prod-sql
//   DATABASE_URL="postgresql://..." npx tsx scripts/check-prod-sql.ts
//
// Read-only. Safe against production.

import './_bootstrap-env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';

const DIR = path.resolve(process.cwd(), 'ops/prod-sql');

/** A file's ledger id is its basename without .sql, matching the id each file
 *  inserts. Keeping them identical means no separate manifest to drift. */
function ledgerId(file: string): string {
  return file.replace(/\.sql$/, '');
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  console.log(`Database: ${url.replace(/:\/\/[^@]*@/, '://***@')}\n`);

  const files = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
    : [];
  if (files.length === 0) {
    console.log('No SQL files in ops/prod-sql/.');
    process.exit(0);
  }

  // The ledger table only exists once migration 0060 (or any of these files)
  // has run; treat its absence as "nothing applied" rather than an error.
  let applied = new Set<string>();
  try {
    const rows = await db.execute<{ id: string }>(
      sql`SELECT id FROM data_migrations`,
    );
    applied = new Set(rows.rows.map((r) => r.id));
  } catch {
    console.log('(no data_migrations table yet — nothing has been applied)\n');
  }

  let pending = 0;
  for (const file of files) {
    const id = ledgerId(file);
    if (applied.has(id)) {
      console.log(`APPLIED  ${file}`);
    } else {
      pending++;
      console.log(`PENDING  ${file}`);
    }
  }

  console.log(
    pending === 0
      ? '\nEverything here has been applied.'
      : `\n${pending} file(s) still to run. Paste them into the Postgres terminal`
        + ' on the Coolify VPS, in filename order.',
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
