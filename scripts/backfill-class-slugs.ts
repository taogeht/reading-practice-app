// One-shot backfill for the classes.slug column.
//
// Generates a slug for every class that doesn't have one yet using the same
// suggestSlug + findUniqueSlug helpers as the create flow. Idempotent — rows
// that already have a slug are skipped, so this is safe to re-run.
//
// Usage:
//   set -a; source .env.local; set +a
//   npx tsx scripts/backfill-class-slugs.ts
//
// Or against prod via Coolify's Postgres console / SSH tunnel — same DATABASE_URL,
// same script.

import 'dotenv/config';
import { db } from '../src/lib/db';
import { classes } from '../src/lib/db/schema';
import { eq, isNull } from 'drizzle-orm';
import { suggestSlug, findUniqueSlug } from '../src/lib/classes/slug';

async function main() {
  const rows = await db
    .select({
      id: classes.id,
      name: classes.name,
      academicYear: classes.academicYear,
    })
    .from(classes)
    .where(isNull(classes.slug));

  if (rows.length === 0) {
    console.log('All classes already have slugs. Nothing to do.');
    return;
  }

  console.log(`Backfilling slugs for ${rows.length} class${rows.length === 1 ? '' : 'es'}…`);

  let touched = 0;
  for (const row of rows) {
    const base = suggestSlug(row.name, row.academicYear);
    const slug = await findUniqueSlug(base);
    await db.update(classes).set({ slug }).where(eq(classes.id, row.id));
    console.log(`  ${row.name.padEnd(30)} → ${slug}`);
    touched += 1;
  }

  console.log(`Done — ${touched} class${touched === 1 ? '' : 'es'} updated.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
