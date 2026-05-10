// Seeder for the closed-class function-word list. Distinct from
// seed-vocabulary.ts which only flags AF&F curriculum entries that
// happen to be function words — that approach left every article,
// pronoun, copula, and basic preposition out of the table, so the
// prose validator was flagging "the", "is", "she" etc. as unknown.
//
// This script writes the canonical function-word set with
// is_function_word=true, af_f_level=null, cefr_level='A1'.
//
// Idempotent and safe at any time:
//   - Word collision with an AF&F-tagged row (af_f_level NOT NULL):
//     SKIP — those rows have a curriculum-meaningful POS we shouldn't
//     clobber (e.g. "can" the noun introduced by the curriculum should
//     not be promoted to auxiliary-verb status).
//   - Word collision with an untagged row (af_f_level IS NULL):
//     UPDATE — promote is_function_word false→true, fill in null POS,
//     fill in null CEFR, never overwrite an existing non-null value.
//   - No prior row: INSERT.
//
// Defaults to dry-run. Pass --write to actually upsert.
//
// Usage:
//   npm run seed:function-words
//   npm run seed:function-words -- --write
//
// A structured report of skipped/inserted/updated entries is written to
// scripts/seed-function-words.report.json on every run.

import './_bootstrap-env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { inArray, sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { vocabulary } from '../src/lib/db/schema';

const ARGS = new Set(process.argv.slice(2));
const WRITE = ARGS.has('--write');
const REPORT_PATH = path.resolve(
  process.cwd(),
  'scripts/seed-function-words.report.json',
);

type PartOfSpeech =
  | 'verb'
  | 'pronoun'
  | 'preposition'
  | 'conjunction'
  | 'determiner'
  | 'adverb';

type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

interface SeedEntry {
  word: string;
  partOfSpeech: PartOfSpeech;
}

// Canonical closed-class set. Comments document the dual-class
// disambiguation calls per the user spec:
//   - "her", "his" → pronoun (could also be determiner)
//   - "that"       → pronoun (also conjunction; pronoun usage is more common)
//   - "to"         → preposition (also infinitive marker; we tag the
//                    preposition sense)
const FUNCTION_WORDS: SeedEntry[] = [
  // Articles — tagged as determiners.
  { word: 'a',     partOfSpeech: 'determiner' },
  { word: 'an',    partOfSpeech: 'determiner' },
  { word: 'the',   partOfSpeech: 'determiner' },

  // Auxiliaries — tagged as verbs.
  { word: 'am',    partOfSpeech: 'verb' },
  { word: 'is',    partOfSpeech: 'verb' },
  { word: 'are',   partOfSpeech: 'verb' },
  { word: 'was',   partOfSpeech: 'verb' },
  { word: 'were',  partOfSpeech: 'verb' },
  { word: 'be',    partOfSpeech: 'verb' },
  { word: 'been',  partOfSpeech: 'verb' },
  { word: 'being', partOfSpeech: 'verb' },
  { word: 'do',    partOfSpeech: 'verb' },
  { word: 'does',  partOfSpeech: 'verb' },
  { word: 'did',   partOfSpeech: 'verb' },
  { word: 'have',  partOfSpeech: 'verb' },
  { word: 'has',   partOfSpeech: 'verb' },
  { word: 'had',   partOfSpeech: 'verb' },
  { word: 'will',  partOfSpeech: 'verb' },
  { word: 'would', partOfSpeech: 'verb' },
  { word: 'can',   partOfSpeech: 'verb' },
  { word: 'could', partOfSpeech: 'verb' },
  { word: 'should',partOfSpeech: 'verb' },
  { word: 'may',   partOfSpeech: 'verb' },
  { word: 'might', partOfSpeech: 'verb' },
  { word: 'must',  partOfSpeech: 'verb' },
  { word: 'shall', partOfSpeech: 'verb' },

  // Pronouns — including possessive determiners ("my", "his", etc.) and
  // demonstratives ("this", "that"); see header comment for disambig calls.
  { word: 'i',     partOfSpeech: 'pronoun' },
  { word: 'you',   partOfSpeech: 'pronoun' },
  { word: 'he',    partOfSpeech: 'pronoun' },
  { word: 'she',   partOfSpeech: 'pronoun' },
  { word: 'it',    partOfSpeech: 'pronoun' },
  { word: 'we',    partOfSpeech: 'pronoun' },
  { word: 'they',  partOfSpeech: 'pronoun' },
  { word: 'me',    partOfSpeech: 'pronoun' },
  { word: 'him',   partOfSpeech: 'pronoun' },
  { word: 'her',   partOfSpeech: 'pronoun' },
  { word: 'us',    partOfSpeech: 'pronoun' },
  { word: 'them',  partOfSpeech: 'pronoun' },
  { word: 'my',    partOfSpeech: 'pronoun' },
  { word: 'your',  partOfSpeech: 'pronoun' },
  { word: 'his',   partOfSpeech: 'pronoun' },
  { word: 'its',   partOfSpeech: 'pronoun' },
  { word: 'our',   partOfSpeech: 'pronoun' },
  { word: 'their', partOfSpeech: 'pronoun' },
  { word: 'this',  partOfSpeech: 'pronoun' },
  { word: 'that',  partOfSpeech: 'pronoun' },
  { word: 'these', partOfSpeech: 'pronoun' },
  { word: 'those', partOfSpeech: 'pronoun' },
  { word: 'who',   partOfSpeech: 'pronoun' },
  { word: 'what',  partOfSpeech: 'pronoun' },
  { word: 'where', partOfSpeech: 'pronoun' },
  { word: 'when',  partOfSpeech: 'pronoun' },
  { word: 'why',   partOfSpeech: 'pronoun' },
  { word: 'how',   partOfSpeech: 'pronoun' },

  // Prepositions.
  { word: 'at',      partOfSpeech: 'preposition' },
  { word: 'in',      partOfSpeech: 'preposition' },
  { word: 'on',      partOfSpeech: 'preposition' },
  { word: 'of',      partOfSpeech: 'preposition' },
  { word: 'to',      partOfSpeech: 'preposition' },
  { word: 'for',     partOfSpeech: 'preposition' },
  { word: 'from',    partOfSpeech: 'preposition' },
  { word: 'with',    partOfSpeech: 'preposition' },
  { word: 'by',      partOfSpeech: 'preposition' },
  { word: 'about',   partOfSpeech: 'preposition' },
  { word: 'as',      partOfSpeech: 'preposition' },
  { word: 'into',    partOfSpeech: 'preposition' },
  { word: 'onto',    partOfSpeech: 'preposition' },
  { word: 'up',      partOfSpeech: 'preposition' },
  { word: 'down',    partOfSpeech: 'preposition' },
  { word: 'over',    partOfSpeech: 'preposition' },
  { word: 'under',   partOfSpeech: 'preposition' },
  { word: 'through', partOfSpeech: 'preposition' },
  { word: 'before',  partOfSpeech: 'preposition' },
  { word: 'after',   partOfSpeech: 'preposition' },
  { word: 'between', partOfSpeech: 'preposition' },
  { word: 'among',   partOfSpeech: 'preposition' },

  // Conjunctions.
  { word: 'and',      partOfSpeech: 'conjunction' },
  { word: 'or',       partOfSpeech: 'conjunction' },
  { word: 'but',      partOfSpeech: 'conjunction' },
  { word: 'so',       partOfSpeech: 'conjunction' },
  { word: 'if',       partOfSpeech: 'conjunction' },
  { word: 'because',  partOfSpeech: 'conjunction' },
  { word: 'while',    partOfSpeech: 'conjunction' },
  { word: 'although', partOfSpeech: 'conjunction' },

  // Negation — adverbs.
  { word: 'not',   partOfSpeech: 'adverb' },
  { word: 'no',    partOfSpeech: 'adverb' },
  { word: 'never', partOfSpeech: 'adverb' },
];

const CEFR_LEVEL_ALL: CefrLevel = 'A1';

interface ReportEntry {
  word: string;
  detail: string;
}

interface SeedReport {
  generatedAt: string;
  mode: 'dry-run' | 'write';
  totals: {
    candidates: number;
    toInsert: number;
    toUpdate: number;
    skipped: number;
  };
  toInsert: ReportEntry[];
  toUpdate: ReportEntry[];
  skipped: ReportEntry[];
}

async function main() {
  console.log(`Function-word seed candidates: ${FUNCTION_WORDS.length}`);

  const candidateWords = FUNCTION_WORDS.map((e) => e.word);

  // Pull every existing row that matches the candidate set so we can
  // classify each candidate as INSERT / UPDATE / SKIP without round-trips.
  const existing = await db
    .select({
      word: vocabulary.word,
      partOfSpeech: vocabulary.partOfSpeech,
      isFunctionWord: vocabulary.isFunctionWord,
      afFLevel: vocabulary.afFLevel,
      afFUnit: vocabulary.afFUnit,
      cefrLevel: vocabulary.cefrLevel,
    })
    .from(vocabulary)
    .where(inArray(vocabulary.word, candidateWords));

  const existingByWord = new Map(existing.map((r) => [r.word, r]));

  const toInsert: SeedEntry[] = [];
  const toUpdate: SeedEntry[] = [];
  const reportInsert: ReportEntry[] = [];
  const reportUpdate: ReportEntry[] = [];
  const reportSkipped: ReportEntry[] = [];

  for (const cand of FUNCTION_WORDS) {
    const row = existingByWord.get(cand.word);
    if (!row) {
      toInsert.push(cand);
      reportInsert.push({
        word: cand.word,
        detail: `new ${cand.partOfSpeech}`,
      });
      continue;
    }
    if (row.afFLevel !== null) {
      // The word is part of the curriculum with a specific sense — the
      // noun "can", the verb "may" the curriculum chose, etc. Leaving
      // is_function_word=false and the existing POS untouched is the
      // safer default; a future task can revisit case-by-case.
      reportSkipped.push({
        word: cand.word,
        detail: `existing curriculum row (af_f_level=${row.afFLevel}, af_f_unit=${row.afFUnit ?? '?'}, partOfSpeech=${row.partOfSpeech}) — not promoting to function word`,
      });
      continue;
    }
    toUpdate.push(cand);
    reportUpdate.push({
      word: cand.word,
      detail:
        `existing untagged row (partOfSpeech=${row.partOfSpeech}, ` +
        `isFunctionWord=${row.isFunctionWord}) → ` +
        `${row.partOfSpeech ? 'POS preserved' : `POS will become ${cand.partOfSpeech}`}` +
        `${row.cefrLevel ? '' : `, CEFR will become ${CEFR_LEVEL_ALL}`}` +
        `, isFunctionWord → true`,
    });
  }

  const report: SeedReport = {
    generatedAt: new Date().toISOString(),
    mode: WRITE ? 'write' : 'dry-run',
    totals: {
      candidates: FUNCTION_WORDS.length,
      toInsert: toInsert.length,
      toUpdate: toUpdate.length,
      skipped: reportSkipped.length,
    },
    toInsert: reportInsert,
    toUpdate: reportUpdate,
    skipped: reportSkipped,
  };

  console.log('');
  console.log(`Mode: ${report.mode}`);
  console.log(`Candidates:   ${report.totals.candidates}`);
  console.log(`To insert:    ${report.totals.toInsert}`);
  console.log(`To update:    ${report.totals.toUpdate}`);
  console.log(`Skipped:      ${report.totals.skipped}`);
  console.log('');
  if (reportSkipped.length) {
    console.log('Skipped (curriculum-tagged, not promoted):');
    for (const s of reportSkipped) console.log(`  ${s.word} — ${s.detail}`);
    console.log('');
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Full report → ${path.relative(process.cwd(), REPORT_PATH)}`);

  if (!WRITE) {
    console.log('\n[dry-run] No DB writes. Re-run with --write to upsert.');
    process.exit(0);
  }

  const writeRows = [...toInsert, ...toUpdate].map((e) => ({
    word: e.word,
    partOfSpeech: e.partOfSpeech,
    cefrLevel: CEFR_LEVEL_ALL,
    isFunctionWord: true,
  }));

  if (writeRows.length === 0) {
    console.log('\nNothing to write — every function word is either curriculum-tagged or already in place.');
    process.exit(0);
  }

  console.log(`\nUpserting ${writeRows.length} rows…`);
  // Idempotent upsert mirroring seed-vocabulary's pattern: on conflict,
  // never clobber a non-null existing value, and only flip
  // is_function_word false→true. The pre-classification above already
  // excluded curriculum-tagged rows, so the WHERE clause below is the
  // belt-and-braces guard against a row being curriculum-tagged
  // between SELECT and INSERT.
  await db
    .insert(vocabulary)
    .values(writeRows)
    .onConflictDoUpdate({
      target: vocabulary.word,
      set: {
        partOfSpeech: sql`COALESCE(${vocabulary.partOfSpeech}, EXCLUDED.part_of_speech)`,
        cefrLevel: sql`COALESCE(${vocabulary.cefrLevel}, EXCLUDED.cefr_level)`,
        isFunctionWord: sql`${vocabulary.isFunctionWord} OR EXCLUDED.is_function_word`,
        updatedAt: sql`now()`,
      },
      setWhere: sql`${vocabulary.afFLevel} IS NULL`,
    });

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
