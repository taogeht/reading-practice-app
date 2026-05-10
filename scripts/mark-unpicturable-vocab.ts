// Mark a curated set of vocabulary words as not picture-matchable.
// These words still belong in stories — the spelling/reading-comprehension
// flows use them — but they don't get vocab_matching pair illustrations
// because Gemini produces ambiguous or confusing pictures for them
// (numerals, abstract evaluatives, discourse markers).
//
// Usage:
//   npm run mark:unpicturable           # dry-run; prints the report
//   npm run mark:unpicturable -- --write   # apply UPDATEs
//
// Idempotent: writing twice is a no-op (already-false rows pass through).
// Words missing from the vocabulary table are warned but not inserted —
// the goal here is to flag a subset of EXISTING rows, not seed new vocab.

import './_bootstrap-env';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { vocabulary } from '../src/lib/db/schema';

interface Group {
  label: string;
  words: string[];
}

const GROUPS: Group[] = [
  {
    label: 'Numbers (cardinal 0-20)',
    // Numerals render as multi-object montages or garbled glyphs;
    // counts are taught with picturable nouns ("three apples"), not
    // bare numerals.
    words: [
      'one', 'two', 'three', 'four', 'five',
      'six', 'seven', 'eight', 'nine', 'ten',
      'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
      'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
    ],
  },
  {
    label: 'Abstract evaluative adjectives',
    // Color adjectives and size/shape adjectives stay PICTURABLE
    // (they have clear referents); only purely evaluative ones are
    // excluded here.
    words: ['good', 'bad', 'nice', 'fine', 'okay'],
  },
  {
    label: 'Discourse / quantity modifiers',
    words: [
      'many', 'much', 'more', 'less', 'most',
      'here', 'there', 'too', 'so', 'very',
    ],
  },
  {
    label: 'Time / order',
    words: [
      'now', 'then', 'soon', 'before', 'after',
      'first', 'last', 'next',
    ],
  },
];

const ALL_WORDS = Array.from(new Set(GROUPS.flatMap((g) => g.words)));

interface FoundRow {
  id: string;
  word: string;
  partOfSpeech: string;
  isPicturable: boolean;
}

async function main() {
  const write = process.argv.includes('--write');

  // Look up every word in one query so the dry-run shows the full
  // picture without N round-trips.
  const found = await db
    .select({
      id: vocabulary.id,
      word: vocabulary.word,
      partOfSpeech: vocabulary.partOfSpeech,
      isPicturable: vocabulary.isPicturable,
    })
    .from(vocabulary)
    .where(inArray(vocabulary.word, ALL_WORDS));

  const foundByWord = new Map<string, FoundRow>();
  for (const r of found) foundByWord.set(r.word.toLowerCase().trim(), r);

  console.log(`Mode: ${write ? 'WRITE' : 'DRY-RUN'}`);
  console.log(`Curated unpicturable words: ${ALL_WORDS.length}`);
  console.log('');

  const toMark: FoundRow[] = [];
  const alreadyMarked: FoundRow[] = [];
  const missing: string[] = [];

  for (const group of GROUPS) {
    console.log(`── ${group.label} ──`);
    for (const word of group.words) {
      const row = foundByWord.get(word.toLowerCase());
      if (!row) {
        console.log(`  ! ${word.padEnd(14)} (not in DB — skipping, won't insert)`);
        missing.push(word);
        continue;
      }
      if (row.isPicturable === false) {
        alreadyMarked.push(row);
        console.log(`  ✓ ${row.word.padEnd(14)} [${row.partOfSpeech}] already unpicturable`);
        continue;
      }
      toMark.push(row);
      console.log(`  → ${row.word.padEnd(14)} [${row.partOfSpeech}] will mark unpicturable`);
    }
    console.log('');
  }

  console.log('───── Summary ─────');
  console.log(`  to mark:        ${toMark.length}`);
  console.log(`  already marked: ${alreadyMarked.length}`);
  console.log(`  not in DB:      ${missing.length}${missing.length ? ` (${missing.join(', ')})` : ''}`);
  console.log('');

  if (!write) {
    console.log('(dry-run — pass --write to apply)');
    process.exit(0);
  }

  if (toMark.length === 0) {
    console.log('Nothing to update. Already at desired state.');
    process.exit(0);
  }

  const ids = toMark.map((r) => r.id);
  const result = await db
    .update(vocabulary)
    .set({ isPicturable: false, updatedAt: sql`now()` })
    .where(inArray(vocabulary.id, ids));
  console.log(`UPDATE applied. rows affected: ${(result as unknown as { rowCount?: number }).rowCount ?? toMark.length}`);

  // Sanity post-check: read back the rows we just touched.
  const verify = await db
    .select({ word: vocabulary.word, isPicturable: vocabulary.isPicturable })
    .from(vocabulary)
    .where(inArray(vocabulary.id, ids));
  const stillTrue = verify.filter((r) => r.isPicturable);
  if (stillTrue.length) {
    console.error(`✗ ${stillTrue.length} rows are still picturable: ${stillTrue.map((r) => r.word).join(', ')}`);
    process.exit(1);
  }
  console.log(`✓ verified — all ${verify.length} rows are now is_picturable=false`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
