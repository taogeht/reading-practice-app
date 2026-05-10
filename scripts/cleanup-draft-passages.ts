// Delete reading_passages rows in status='draft' (test artifacts
// produced by `npm run test:passage -- … --skip-images`). The
// foreign-key cascades on story_pages and reading_questions handle
// the dependent rows automatically. Manually-invoked cleanup —
// intentionally no schedule.
//
// Usage:
//   npm run cleanup:drafts             # dry-run, just counts
//   npm run cleanup:drafts -- --write  # actually delete

import './_bootstrap-env';
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { readingPassages } from '../src/lib/db/schema';

async function main() {
  const write = process.argv.includes('--write');

  const drafts = await db
    .select({
      id: readingPassages.id,
      title: readingPassages.title,
      readingLevel: readingPassages.readingLevel,
      createdAt: readingPassages.createdAt,
    })
    .from(readingPassages)
    .where(eq(readingPassages.status, 'draft'));

  console.log(`Mode: ${write ? 'WRITE (delete)' : 'DRY-RUN'}`);
  console.log(`Found ${drafts.length} draft passages.`);
  for (const d of drafts.slice(0, 30)) {
    console.log(
      `  ${d.id} L${d.readingLevel} "${d.title}" (created ${d.createdAt.toISOString()})`,
    );
  }
  if (drafts.length > 30) {
    console.log(`  …and ${drafts.length - 30} more`);
  }

  if (!write) {
    console.log('');
    console.log('(dry-run — pass --write to delete)');
    process.exit(0);
  }
  if (drafts.length === 0) {
    console.log('Nothing to delete.');
    process.exit(0);
  }

  // FK cascades on story_pages and reading_questions handle the
  // dependent rows. R2 image blobs aren't cleaned up here — drafts
  // shouldn't have any (skip-images mode skips uploads), but if a
  // status='draft' row ever did pick up real keys, those would be
  // orphaned. Acceptable for v1; an R2 sweep job is out of scope.
  const result = await db
    .delete(readingPassages)
    .where(eq(readingPassages.status, 'draft'));
  const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? drafts.length;
  console.log(`Deleted ${rowCount} draft passages (cascading to story_pages + reading_questions).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
