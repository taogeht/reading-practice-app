// Scaffold-vocabulary seeder. Adds open-class words AF&F1 doesn't
// formally introduce but assumes/uses — basic action verbs, common
// adjectives, locative prepositions, discourse adverbs. They get
// is_scaffold=true, af_f_level=null, cefr_level='A1'.
//
// Distinct from seed-vocabulary.ts (curriculum-tagged words from the
// AF&F unit JSONs) and seed-function-words.ts (closed-class function
// words). The mutual-exclusion invariant — a word is at most one of
// {curriculum, function, scaffold} — is enforced here by pre-classifying
// existing rows and skipping any that already carry a curriculum tag
// (af_f_level set) or function-word flag.
//
// Idempotent: safe to re-run. Defaults to dry-run; pass --write to apply.
//
// Usage:
//   npm run seed:scaffold
//   npm run seed:scaffold -- --write
//
// A structured report of inserted/updated/skipped entries is written to
// scripts/seed-scaffold-vocabulary.report.json on every run.

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
  'scripts/seed-scaffold-vocabulary.report.json',
);

type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'preposition'
  | 'conjunction'
  | 'interjection'
  | 'determiner'
  | 'other';

type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

interface SeedEntry {
  word: string;
  partOfSpeech: PartOfSpeech;
}

// Section B from the AF&F1 word audit: lemmas only — the morphology
// layer in tokenize.ts handles -s/-es/-ed/-ing automatically, so the
// 3sg / past / progressive forms don't need their own rows. Dual-class
// disambiguation calls match the audit:
//   - "help" tagged verb (also a noun, but the verb sense is what the
//     model reaches for in narrative context)
//   - "smile" tagged verb (likewise)
//   - "near" tagged preposition (also adjective; preposition sense is
//     what's missing from AF&F1's spatial-language curriculum)
const SCAFFOLD_WORDS: SeedEntry[] = [
  // Action verbs the model relies on but the curriculum doesn't list.
  { word: 'see',   partOfSpeech: 'verb' },
  { word: 'smile', partOfSpeech: 'verb' },
  { word: 'point', partOfSpeech: 'verb' },
  { word: 'want',  partOfSpeech: 'verb' },
  { word: 'need',  partOfSpeech: 'verb' },
  { word: 'hope',  partOfSpeech: 'verb' },
  { word: 'come',  partOfSpeech: 'verb' },
  { word: 'get',   partOfSpeech: 'verb' },
  { word: 'take',  partOfSpeech: 'verb' },
  { word: 'put',   partOfSpeech: 'verb' },
  { word: 'jump',  partOfSpeech: 'verb' },
  { word: 'eat',   partOfSpeech: 'verb' },
  { word: 'sit',   partOfSpeech: 'verb' },
  { word: 'stand', partOfSpeech: 'verb' },
  { word: 'fall',  partOfSpeech: 'verb' },
  { word: 'open',  partOfSpeech: 'verb' },
  { word: 'close', partOfSpeech: 'verb' },
  { word: 'stop',  partOfSpeech: 'verb' },
  { word: 'help',  partOfSpeech: 'verb' },
  { word: 'show',  partOfSpeech: 'verb' },
  { word: 'ask',   partOfSpeech: 'verb' },
  { word: 'tell',  partOfSpeech: 'verb' },
  { word: 'say',   partOfSpeech: 'verb' },

  // Universal feeling/quality adjectives.
  { word: 'happy',  partOfSpeech: 'adjective' },
  { word: 'sad',    partOfSpeech: 'adjective' },
  { word: 'nice',   partOfSpeech: 'adjective' },
  { word: 'pretty', partOfSpeech: 'adjective' },
  { word: 'bad',    partOfSpeech: 'adjective' },

  // Locative prepositions / phrases the curriculum's spatial coverage
  // misses (it teaches in/on/under but not the rest of the basic set).
  { word: 'behind',      partOfSpeech: 'preposition' },
  { word: 'in front of', partOfSpeech: 'preposition' },
  { word: 'next to',     partOfSpeech: 'preposition' },
  { word: 'near',        partOfSpeech: 'preposition' },

  // Discourse / intensifier adverbs.
  { word: 'too',  partOfSpeech: 'adverb' },
  { word: 'also', partOfSpeech: 'adverb' },
  { word: 'very', partOfSpeech: 'adverb' },

  // Pass 2 — residuals from the regen-batch measurement (10 runs at
  // level 2): universal starter-set ESL words AF&F1 doesn't introduce
  // and the first scaffold pass missed. Same handling as Pass 1.

  // Concrete starter-set nouns kids name regardless of textbook order.
  { word: 'desk',    partOfSpeech: 'noun' },
  { word: 'cup',     partOfSpeech: 'noun' },
  { word: 'room',    partOfSpeech: 'noun' },
  { word: 'table',   partOfSpeech: 'noun' },
  { word: 'hair',    partOfSpeech: 'noun' },
  { word: 'picture', partOfSpeech: 'noun' },
  { word: 'grass',   partOfSpeech: 'noun' },
  { word: 'sky',     partOfSpeech: 'noun' },
  { word: 'tail',    partOfSpeech: 'noun' },
  { word: 'spot',    partOfSpeech: 'noun' },
  // "wave" is also a verb but the noun (water-motion) sense is the
  // one regen runs reach for; tagging it as the noun matches that.
  { word: 'wave',    partOfSpeech: 'noun' },

  // Adjectives.
  { word: 'fast', partOfSpeech: 'adjective' },
  { word: 'warm', partOfSpeech: 'adjective' },
  // "fun" tagged as adjective per spec ("this is fun"); the noun
  // sense ("we have fun") covers the same row via direct match.
  { word: 'fun',  partOfSpeech: 'adjective' },

  // General action verbs not in AF&F1 + not in the first scaffold pass.
  { word: 'hold',  partOfSpeech: 'verb' },
  { word: 'roll',  partOfSpeech: 'verb' },
  { word: 'feel',  partOfSpeech: 'verb' },
  { word: 'count', partOfSpeech: 'verb' },

  // Spatial / temporal adverbs. ("out" is sometimes a particle, but
  // tagging adverb matches its standalone use the model emits.)
  { word: 'now', partOfSpeech: 'adverb' },
  { word: 'far', partOfSpeech: 'adverb' },
  { word: 'out', partOfSpeech: 'adverb' },

  // Pass 3 — question / metalanguage residuals from Stage 4 question
  // validation. These are the words the model uses in question stems,
  // option text, and definition meanings — universal at K/G1 level but
  // not in AF&F1's curriculum scope. Same shape as Pass 1/2.

  // "which" is conceptually a function word alongside who/what/when/
  // etc., but the function-word seed didn't include it (gap to fix
  // separately). Adding here as scaffold so the validator stops
  // flagging it as unknown; flag has the same "always available"
  // effect either way.
  { word: 'which', partOfSpeech: 'pronoun' },

  // Quantity / comparison adverbs.
  { word: 'many', partOfSpeech: 'adverb' },
  { word: 'much', partOfSpeech: 'adverb' },
  { word: 'more', partOfSpeech: 'adverb' },
  { word: 'less', partOfSpeech: 'adverb' },
  { word: 'most', partOfSpeech: 'adverb' },

  // Question-stem verbs.
  { word: 'match',  partOfSpeech: 'verb' },
  { word: 'choose', partOfSpeech: 'verb' },
  { word: 'pick',   partOfSpeech: 'verb' },

  // Metalanguage nouns the question text uses to refer to the story.
  { word: 'word',     partOfSpeech: 'noun' },
  { word: 'meaning',  partOfSpeech: 'noun' },
  { word: 'sentence', partOfSpeech: 'noun' },
  { word: 'story',    partOfSpeech: 'noun' },
  { word: 'page',     partOfSpeech: 'noun' },
  { word: 'order',    partOfSpeech: 'noun' },
  { word: 'number',   partOfSpeech: 'noun' },
  { word: 'event',    partOfSpeech: 'noun' },
  { word: 'part',     partOfSpeech: 'noun' },
  { word: 'group',    partOfSpeech: 'noun' },
  { word: 'set',      partOfSpeech: 'noun' },

  // Truth-value / comparison adjectives used in MCQ options + meanings.
  { word: 'true',      partOfSpeech: 'adjective' },
  { word: 'false',     partOfSpeech: 'adjective' },
  { word: 'correct',   partOfSpeech: 'adjective' },
  { word: 'right',     partOfSpeech: 'adjective' },
  { word: 'wrong',     partOfSpeech: 'adjective' },
  { word: 'same',      partOfSpeech: 'adjective' },
  { word: 'different', partOfSpeech: 'adjective' },
  { word: 'both',      partOfSpeech: 'adjective' },

  // Discourse / temporal adverbs the model uses in sequence-event
  // descriptions and option phrasing.
  { word: 'then',  partOfSpeech: 'adverb' },
  { word: 'next',  partOfSpeech: 'adverb' },
  { word: 'first', partOfSpeech: 'adverb' },
  { word: 'last',  partOfSpeech: 'adverb' },

  // Pass 4 — gaps surfaced by the bulk-generation failure analysis
  // (15-passage run at level 2). All universal pre-K/G1-level words
  // AF&F1 doesn't formally introduce; the model reaches for them in
  // narrative prose and the validator was correctly flagging them as
  // unknown. Lemmas only — morphology rule 10 handles -s/-ed/-ing
  // (verified by the diagnostic: throws→throw, hits→hit, claps→clap,
  // pops→pop all recover via `s-bare` once the lemma exists).
  //
  // Verbs.
  { word: 'throw', partOfSpeech: 'verb' },
  { word: 'hit',   partOfSpeech: 'verb' },
  { word: 'clap',  partOfSpeech: 'verb' },
  { word: 'pop',   partOfSpeech: 'verb' },

  // Concrete nouns.
  { word: 'park',  partOfSpeech: 'noun' },
  { word: 'paper', partOfSpeech: 'noun' },
  { word: 'time',  partOfSpeech: 'noun' },
  { word: 'song',  partOfSpeech: 'noun' },
  // "wind" the noun (weather), not the verb (winding). The verb is
  // rare enough at this level that we accept the noun-only sense.
  { word: 'wind',  partOfSpeech: 'noun' },
  // "line" the noun (queue / mark on paper), not the verb.
  { word: 'line',  partOfSpeech: 'noun' },
  { word: 'ice',   partOfSpeech: 'noun' },

  // Adverb.
  { word: 'together', partOfSpeech: 'adverb' },
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
    skippedCurriculum: number;
    skippedFunction: number;
  };
  toInsert: ReportEntry[];
  toUpdate: ReportEntry[];
  skippedCurriculum: ReportEntry[];
  skippedFunction: ReportEntry[];
}

async function main() {
  console.log(`Scaffold seed candidates: ${SCAFFOLD_WORDS.length}`);

  const candidateWords = SCAFFOLD_WORDS.map((e) => e.word);

  const existing = await db
    .select({
      word: vocabulary.word,
      partOfSpeech: vocabulary.partOfSpeech,
      isFunctionWord: vocabulary.isFunctionWord,
      isScaffold: vocabulary.isScaffold,
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
  const skippedCurriculum: ReportEntry[] = [];
  const skippedFunction: ReportEntry[] = [];

  for (const cand of SCAFFOLD_WORDS) {
    const row = existingByWord.get(cand.word);
    if (!row) {
      toInsert.push(cand);
      reportInsert.push({
        word: cand.word,
        detail: `new ${cand.partOfSpeech} (scaffold)`,
      });
      continue;
    }
    if (row.afFLevel !== null) {
      // Curriculum classification wins over scaffold (mutual exclusion).
      skippedCurriculum.push({
        word: cand.word,
        detail: `existing curriculum row (af_f_level=${row.afFLevel}, af_f_unit=${row.afFUnit ?? '?'}, partOfSpeech=${row.partOfSpeech}) — not promoting to scaffold`,
      });
      continue;
    }
    if (row.isFunctionWord) {
      // Function classification wins over scaffold.
      skippedFunction.push({
        word: cand.word,
        detail: `existing function-word row (partOfSpeech=${row.partOfSpeech}) — not promoting to scaffold`,
      });
      continue;
    }
    toUpdate.push(cand);
    reportUpdate.push({
      word: cand.word,
      detail:
        `existing untagged row (partOfSpeech=${row.partOfSpeech ?? '?'}, ` +
        `isScaffold=${row.isScaffold}) → ` +
        `${row.partOfSpeech ? 'POS preserved' : `POS will become ${cand.partOfSpeech}`}` +
        `${row.cefrLevel ? '' : `, CEFR will become ${CEFR_LEVEL_ALL}`}` +
        `, isScaffold → true`,
    });
  }

  const report: SeedReport = {
    generatedAt: new Date().toISOString(),
    mode: WRITE ? 'write' : 'dry-run',
    totals: {
      candidates: SCAFFOLD_WORDS.length,
      toInsert: toInsert.length,
      toUpdate: toUpdate.length,
      skippedCurriculum: skippedCurriculum.length,
      skippedFunction: skippedFunction.length,
    },
    toInsert: reportInsert,
    toUpdate: reportUpdate,
    skippedCurriculum,
    skippedFunction,
  };

  console.log('');
  console.log(`Mode: ${report.mode}`);
  console.log(`Candidates:           ${report.totals.candidates}`);
  console.log(`To insert (new):      ${report.totals.toInsert}`);
  console.log(`To update (untagged): ${report.totals.toUpdate}`);
  console.log(`Skipped (curriculum): ${report.totals.skippedCurriculum}`);
  console.log(`Skipped (function):   ${report.totals.skippedFunction}`);
  console.log('');
  if (skippedCurriculum.length) {
    console.log('Skipped — curriculum row already exists (curriculum wins):');
    for (const s of skippedCurriculum) console.log(`  ${s.word} — ${s.detail}`);
    console.log('');
  }
  if (skippedFunction.length) {
    console.log('Skipped — function-word row already exists (function wins):');
    for (const s of skippedFunction) console.log(`  ${s.word} — ${s.detail}`);
    console.log('');
  }
  if (reportInsert.length) {
    console.log(`Will insert ${reportInsert.length} new scaffold rows:`);
    for (const i of reportInsert) console.log(`  ${i.word} — ${i.detail}`);
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
    isScaffold: true,
    // Explicit on insert so the row's classification is unambiguous.
    // The pre-classification above doesn't skip is_core_vocabulary rows
    // because that flag wasn't part of the original scaffold rules; on
    // a hypothetical run where a row is core-tagged but not curriculum
    // or function, this insert would conflict and the SET below clears
    // it. Documents mutual exclusion at both the insert and update
    // boundaries.
    isCoreVocabulary: false,
  }));

  if (writeRows.length === 0) {
    console.log(
      '\nNothing to write — every scaffold word is either curriculum-tagged, function-tagged, or already a scaffold row.',
    );
    process.exit(0);
  }

  console.log(`\nUpserting ${writeRows.length} rows…`);
  // Idempotent upsert. The pre-classification above already excluded
  // curriculum-tagged + function-word rows, so the WHERE clause below is
  // belt-and-braces protection against a row being classified between
  // SELECT and INSERT. is_scaffold can only flip false→true here, never
  // false→true→false on a re-run; is_function_word is forcibly cleared
  // (would be redundant given the pre-filter, but the explicit set
  // documents the mutual-exclusion invariant).
  await db
    .insert(vocabulary)
    .values(writeRows)
    .onConflictDoUpdate({
      target: vocabulary.word,
      set: {
        partOfSpeech: sql`COALESCE(${vocabulary.partOfSpeech}, EXCLUDED.part_of_speech)`,
        cefrLevel: sql`COALESCE(${vocabulary.cefrLevel}, EXCLUDED.cefr_level)`,
        isScaffold: sql`true`,
        // Defensive: scaffold rows are never function words. The
        // pre-filter already skips function-tagged rows, so this branch
        // wouldn't trigger in practice, but the explicit clear keeps
        // the invariant readable.
        isFunctionWord: sql`false`,
        // Same logic for is_core_vocabulary: scaffold and core are
        // separate "always-available" buckets and a row should be at
        // most one of them.
        isCoreVocabulary: sql`false`,
        updatedAt: sql`now()`,
      },
      setWhere: sql`${vocabulary.afFLevel} IS NULL AND ${vocabulary.isFunctionWord} = false`,
    });

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
