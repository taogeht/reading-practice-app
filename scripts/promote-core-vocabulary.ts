// Promote a curated set of curriculum-tagged verbs to is_core_vocabulary.
//
// Why: AF&F1 introduces core action verbs (look, run, go, give, draw,
// drink, walk, play, read, write, find, make, swim) in units 13–15.
// Without this flag, those verbs are excluded from the cumulative-vocab
// allowlist when a story's target words come from earlier units, even
// though every K/G1 kid knows them. Setting is_core_vocabulary=true on
// these rows tells the validator "include this regardless of the
// (af_f_level, af_f_unit) cap."
//
// Idempotent: re-running is safe. Words already promoted are reported as
// no-ops, not errors. Words missing from the table or with the wrong
// base classification are logged and skipped.
//
// Usage:
//   npm run promote:core
//   npm run promote:core -- --write
//
// Report at scripts/promote-core-vocabulary.report.json on every run.

import './_bootstrap-env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { vocabulary } from '../src/lib/db/schema';

const ARGS = new Set(process.argv.slice(2));
const WRITE = ARGS.has('--write');
const REPORT_PATH = path.resolve(
  process.cwd(),
  'scripts/promote-core-vocabulary.report.json',
);

// Curated list. POS is documentation-only — the script doesn't enforce a
// POS match because some entries may have been seeded with a different
// POS sense (e.g. "drink" was tagged as a noun in unit-15 vocabulary[]
// even though the universally-known sense is the verb). The is_core
// flag's effect is "always available" regardless of POS, so we just
// promote the lemma row.
const CORE_VERBS = [
  'look',
  'run',
  'go',
  'give',
  'draw',
  'drink',
  'walk',
  'play',
  'read',
  'write',
  'find',
  'make',
  'swim',
] as const;

interface ExistingRow {
  word: string;
  partOfSpeech: string | null;
  afFLevel: string | null;
  afFUnit: number | null;
  isFunctionWord: boolean;
  isScaffold: boolean;
  isCoreVocabulary: boolean;
}

interface ReportEntry {
  word: string;
  detail: string;
}

interface PromoteReport {
  generatedAt: string;
  mode: 'dry-run' | 'write';
  totals: {
    candidates: number;
    toPromote: number;
    alreadyPromoted: number;
    skippedMissing: number;
    skippedWrongState: number;
  };
  toPromote: ReportEntry[];
  alreadyPromoted: ReportEntry[];
  skippedMissing: ReportEntry[];
  skippedWrongState: ReportEntry[];
}

async function main() {
  console.log(`Core-vocabulary promotion candidates: ${CORE_VERBS.length}`);

  const existing: ExistingRow[] = await db
    .select({
      word: vocabulary.word,
      partOfSpeech: vocabulary.partOfSpeech,
      afFLevel: vocabulary.afFLevel,
      afFUnit: vocabulary.afFUnit,
      isFunctionWord: vocabulary.isFunctionWord,
      isScaffold: vocabulary.isScaffold,
      isCoreVocabulary: vocabulary.isCoreVocabulary,
    })
    .from(vocabulary)
    .where(inArray(vocabulary.word, CORE_VERBS as readonly string[] as string[]));

  const byWord = new Map(existing.map((r) => [r.word, r]));

  const toPromote: string[] = [];
  const alreadyPromoted: ReportEntry[] = [];
  const skippedMissing: ReportEntry[] = [];
  const skippedWrongState: ReportEntry[] = [];
  const promoteDetail: ReportEntry[] = [];

  for (const word of CORE_VERBS) {
    const row = byWord.get(word);
    if (!row) {
      skippedMissing.push({
        word,
        detail: 'no row in vocabulary table — expected curriculum entry; skipping',
      });
      continue;
    }
    // Per spec: only promote rows that are currently classified as
    // curriculum (af_f_level set, neither function nor scaffold).
    if (row.afFLevel === null) {
      skippedWrongState.push({
        word,
        detail: `row exists but af_f_level=NULL (not a curriculum row); skipping`,
      });
      continue;
    }
    if (row.isFunctionWord) {
      skippedWrongState.push({
        word,
        detail: `row exists but is_function_word=true; closed-class words don't need core promotion (already always-available); skipping`,
      });
      continue;
    }
    if (row.isScaffold) {
      skippedWrongState.push({
        word,
        detail: `row exists but is_scaffold=true; scaffold words are already always-available; skipping`,
      });
      continue;
    }
    if (row.isCoreVocabulary) {
      alreadyPromoted.push({
        word,
        detail: `already is_core_vocabulary=true (af_f_level=${row.afFLevel}, af_f_unit=${row.afFUnit ?? '?'}); no-op`,
      });
      continue;
    }
    toPromote.push(word);
    promoteDetail.push({
      word,
      detail: `curriculum row (af_f_level=${row.afFLevel}, af_f_unit=${row.afFUnit ?? '?'}, partOfSpeech=${row.partOfSpeech}) → set is_core_vocabulary=true`,
    });
  }

  const report: PromoteReport = {
    generatedAt: new Date().toISOString(),
    mode: WRITE ? 'write' : 'dry-run',
    totals: {
      candidates: CORE_VERBS.length,
      toPromote: toPromote.length,
      alreadyPromoted: alreadyPromoted.length,
      skippedMissing: skippedMissing.length,
      skippedWrongState: skippedWrongState.length,
    },
    toPromote: promoteDetail,
    alreadyPromoted,
    skippedMissing,
    skippedWrongState,
  };

  console.log('');
  console.log(`Mode: ${report.mode}`);
  console.log(`Candidates:        ${report.totals.candidates}`);
  console.log(`To promote:        ${report.totals.toPromote}`);
  console.log(`Already promoted:  ${report.totals.alreadyPromoted}`);
  console.log(`Missing rows:      ${report.totals.skippedMissing}`);
  console.log(`Wrong base state:  ${report.totals.skippedWrongState}`);
  console.log('');

  if (promoteDetail.length) {
    console.log('Will promote:');
    for (const e of promoteDetail) console.log(`  ${e.word.padEnd(8)} — ${e.detail}`);
    console.log('');
  }
  if (alreadyPromoted.length) {
    console.log('Already promoted (no-op):');
    for (const e of alreadyPromoted) console.log(`  ${e.word.padEnd(8)} — ${e.detail}`);
    console.log('');
  }
  if (skippedMissing.length) {
    console.log('Skipped — row missing:');
    for (const e of skippedMissing) console.log(`  ${e.word.padEnd(8)} — ${e.detail}`);
    console.log('');
  }
  if (skippedWrongState.length) {
    console.log('Skipped — wrong base state:');
    for (const e of skippedWrongState) console.log(`  ${e.word.padEnd(8)} — ${e.detail}`);
    console.log('');
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Full report → ${path.relative(process.cwd(), REPORT_PATH)}`);

  if (!WRITE) {
    console.log('\n[dry-run] No DB writes. Re-run with --write to apply.');
    process.exit(0);
  }

  if (toPromote.length === 0) {
    console.log('\nNothing to write.');
    process.exit(0);
  }

  console.log(`\nUpdating ${toPromote.length} rows…`);
  // Defensive WHERE — even though we pre-filtered, only flip the flag on
  // rows that are still curriculum-classified. If something changed
  // between SELECT and UPDATE, we no-op rather than violate the
  // documented contract.
  await db
    .update(vocabulary)
    .set({
      isCoreVocabulary: true,
      updatedAt: sql`now()`,
    })
    .where(
      sql`${vocabulary.word} IN (${sql.join(toPromote.map((w) => sql`${w}`), sql`, `)})
        AND ${vocabulary.afFLevel} IS NOT NULL
        AND ${vocabulary.isFunctionWord} = false
        AND ${vocabulary.isScaffold} = false`,
    );

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
