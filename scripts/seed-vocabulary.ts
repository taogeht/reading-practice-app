// One-shot seeder for the vocabulary master table from the AF&F curriculum
// JSON in src/lib/curriculum/family-friends-1/unit-{0..15}.json. Idempotent —
// safe to re-run; uses ON CONFLICT (word) DO UPDATE with COALESCE so we
// never overwrite an existing non-null value with null.
//
// Defaults to dry-run. Pass --write to actually upsert.
//
// Usage:
//   npm run seed:vocab           # dry-run, prints stats + writes the JSON report
//   npm run seed:vocab -- --write
//
// A structured report of skipped/ambiguous/multi-word/duplicate entries is
// written to scripts/seed-vocabulary.report.json on every run.

// IMPORTANT: ./_bootstrap-env runs loadEnvConfig() at import-time so
// DATABASE_URL is set BEFORE ../src/lib/db evaluates its top-level pool
// constructor. ESM hoists imports, so this MUST stay above the db import.
import './_bootstrap-env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { vocabulary } from '../src/lib/db/schema';

// ---------- CLI flags ----------

const ARGS = new Set(process.argv.slice(2));
const WRITE = ARGS.has('--write');

// ---------- Constants ----------

const CURRICULUM_DIR = path.resolve(
  process.cwd(),
  'src/lib/curriculum/family-friends-1',
);
const REPORT_PATH = path.resolve(
  process.cwd(),
  'scripts/seed-vocabulary.report.json',
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

// Closed-class function words. If a word in the seed input matches one of
// these, the row is inserted with is_function_word=true so the future
// validator can skip frequency-cap rules for it. The list intentionally
// covers articles, the be/do/have copulas, modals, basic prepositions and
// conjunctions, demonstratives, and the standard pronoun + possessive set.
const FUNCTION_WORDS = new Set<string>([
  // articles
  'a', 'an', 'the',
  // be
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  // do
  'do', 'does', 'did',
  // have
  'have', 'has', 'had',
  // modals
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'shall',
  // common prepositions
  'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'about', 'as',
  // conjunctions
  'and', 'or', 'but', 'so', 'if', 'because', 'that',
  // demonstratives
  'this', 'these', 'those',
  // subject pronouns
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  // object pronouns
  'me', 'him', 'her', 'us', 'them',
  // possessive determiners
  'my', 'your', 'his', 'its', 'our', 'their',
]);

// Map AF&F unit-JSON typed-array keys → part of speech.
// `colors` are adjectives in F&F1 ("red ball", "blue car"). `numbers` are
// cardinal counters; per the user decision they go to 'other' rather than
// 'determiner'. Additional keys (e.g. future "adverbs") would extend this.
const ARRAY_KEY_POS: Record<string, PartOfSpeech> = {
  verbs: 'verb',
  adjectives: 'adjective',
  numbers: 'other',
  colors: 'adjective',
  prepositions: 'preposition',
};

// Lemma normalisation overrides applied AFTER trim+lowercase, BEFORE the
// row goes into the candidate list. Use this when the source JSON's word
// form is awkward as a master-list lemma (e.g. "the ocean" — the article
// is baked in for an image-card label, but we want "ocean" in vocab).
// The source JSON files stay untouched because other features (phonics
// deck, image paths like /images/unit-15/the-ocean.png) still rely on
// the original strings.
const WORD_OVERRIDES: Record<string, string> = {
  'the ocean': 'ocean',
};

// Section A from the AF&F1 word audit (see report archived in convo
// history): words AF&F1 demonstrably uses in narrative contexts —
// grammar examples, key sentences, phonics chants, topics — but the
// formal-array extraction missed because they're not in any
// vocabulary[]/verbs[]/adjectives[] list. Adding them here as canonical
// curriculum vocab tagged at the EARLIEST unit they appear narratively.
//
// is_scaffold = false (these are curriculum-introduced, not scaffold).
// is_function_word inherits from FUNCTION_WORDS check below — none of
// these words are in that set, so all land as content words.
const NARRATIVE_EXTRACTION: Array<{
  word: string;
  partOfSpeech: PartOfSpeech;
  earliestUnit: number;
  /** Free-text note for the report explaining where in the source the
   *  word was located, so a reviewer can verify without re-running the
   *  audit. */
  context: string;
}> = [
  { word: 'look', partOfSpeech: 'verb', earliestUnit: 14,
    context: 'unit-14 phonics chant: "Look at the fox / Look at the box"' },
  { word: 'good', partOfSpeech: 'adjective', earliestUnit: 15,
    context: 'unit-15 grammar pattern: "That\'s a good idea." (used in 5+ examples)' },
  { word: 'here', partOfSpeech: 'adverb', earliestUnit: 15,
    context: 'unit-15 grammar pattern: "Here is the [noun]."' },
  { word: 'there', partOfSpeech: 'adverb', earliestUnit: 13,
    context: 'unit-13 grammar pattern: "There\'s a [noun] [preposition]…"' },
  { word: 'bird', partOfSpeech: 'noun', earliestUnit: 14,
    context: 'unit-14 grammar example: "A bird can fly."; also unit-15' },
  { word: 'like', partOfSpeech: 'verb', earliestUnit: 11,
    context: 'unit-11 topic: "I like monkeys!"; recurring in units 12–14' },
  { word: 'give', partOfSpeech: 'verb', earliestUnit: 13,
    context: 'unit-13 phonics chant: "Give the fig to a pig"' },
  { word: "can't", partOfSpeech: 'verb', earliestUnit: 14,
    context: 'unit-14 grammar pattern: "[Subject] can\'t [verb]."' },
];

// ---------- Types ----------

interface UnitJson {
  unit: number;
  topic?: string;
  vocabulary?: Array<{ word: string }>;
  verbs?: string[];
  adjectives?: string[];
  numbers?: string[];
  colors?: string[];
  prepositions?: string[];
}

interface Candidate {
  word: string;          // normalised: lowercased + trimmed
  partOfSpeech: PartOfSpeech;
  afFLevel: 'grade1';
  afFUnit: number;
  isFunctionWord: boolean;
  isMultiWord: boolean;
  // Provenance for the report — which file + array key contributed this entry
  source: string;
}

interface ReportEntry {
  word: string;
  detail: string;
}

interface SeedReport {
  generatedAt: string;
  mode: 'dry-run' | 'write';
  totals: {
    candidatesBeforeDedupe: number;
    uniqueAfterDedupe: number;
    duplicatesCollapsed: number;
    skipped: number;
  };
  bySourceFile: Record<string, number>;
  byAfFLevel: Record<string, number>;
  byCefrLevel: Record<string, number>;
  byPartOfSpeech: Record<string, number>;
  topAmbiguous: ReportEntry[];
  topMultiWord: ReportEntry[];
  duplicates: ReportEntry[];
  skipped: ReportEntry[];
  functionWordCollisions: ReportEntry[];
}

// ---------- Helpers ----------

function normaliseWord(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  return WORD_OVERRIDES[trimmed] ?? trimmed;
}

function isMultiWord(word: string): boolean {
  return /\s/.test(word.trim());
}

function loadUnitFiles(): UnitJson[] {
  const files = fs
    .readdirSync(CURRICULUM_DIR)
    .filter((f) => /^unit-\d+\.json$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)![1]!, 10);
      const nb = parseInt(b.match(/(\d+)/)![1]!, 10);
      return na - nb;
    });

  return files.map((f) => {
    const full = path.join(CURRICULUM_DIR, f);
    return JSON.parse(fs.readFileSync(full, 'utf8')) as UnitJson;
  });
}

// Build the per-unit candidate list. Words in `vocabulary[]` default to
// 'noun' UNLESS the same-unit typed-array (verbs/adjectives/etc.) also
// contains the word — then we use the typed-array POS. Words that appear
// only in a typed array are emitted as their own candidates.
function extractFromUnit(u: UnitJson, sourceFile: string): Candidate[] {
  const result: Candidate[] = [];
  const seenInUnit = new Set<string>();

  // Build a {normalised word → POS} map from the typed arrays first.
  const typedPosByWord = new Map<string, PartOfSpeech>();
  for (const [key, pos] of Object.entries(ARRAY_KEY_POS)) {
    const arr = (u as unknown as Record<string, unknown>)[key];
    if (!Array.isArray(arr)) continue;
    for (const raw of arr as string[]) {
      const w = normaliseWord(raw);
      if (!w) continue;
      // First typed-array hit wins within a unit (e.g. if both verbs and
      // adjectives somehow listed the same token, the order in
      // ARRAY_KEY_POS decides — currently verbs is first).
      if (!typedPosByWord.has(w)) typedPosByWord.set(w, pos);
    }
  }

  // Emit vocabulary[] entries with POS resolution.
  for (const item of u.vocabulary ?? []) {
    const w = normaliseWord(item.word);
    if (!w || seenInUnit.has(w)) continue;
    seenInUnit.add(w);
    const pos = typedPosByWord.get(w) ?? 'noun';
    result.push({
      word: w,
      partOfSpeech: pos,
      afFLevel: 'grade1',
      afFUnit: u.unit,
      isFunctionWord: FUNCTION_WORDS.has(w),
      isMultiWord: isMultiWord(w),
      source: `${sourceFile}#vocabulary`,
    });
  }

  // Then emit any typed-array entries that weren't already captured by
  // vocabulary[]. Useful for unit-0 (numbers + colors only, empty vocab[])
  // and unit-13 (numbers/prepositions extras).
  for (const [key, pos] of Object.entries(ARRAY_KEY_POS)) {
    const arr = (u as unknown as Record<string, unknown>)[key];
    if (!Array.isArray(arr)) continue;
    for (const raw of arr as string[]) {
      const w = normaliseWord(raw);
      if (!w || seenInUnit.has(w)) continue;
      seenInUnit.add(w);
      result.push({
        word: w,
        partOfSpeech: pos,
        afFLevel: 'grade1',
        afFUnit: u.unit,
        isFunctionWord: FUNCTION_WORDS.has(w),
        isMultiWord: isMultiWord(w),
        source: `${sourceFile}#${key}`,
      });
    }
  }

  return result;
}

function tally<T extends string>(items: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const i of items) out[i] = (out[i] ?? 0) + 1;
  return out;
}

// ---------- Main ----------

async function main() {
  console.log(`Reading curriculum from ${path.relative(process.cwd(), CURRICULUM_DIR)}/`);
  const units = loadUnitFiles();
  console.log(`Loaded ${units.length} unit files (units ${units[0]?.unit}..${units[units.length - 1]?.unit}).`);

  // 1. Extract per-unit candidates.
  const allCandidates: Candidate[] = [];
  const bySourceFile: Record<string, number> = {};
  for (const u of units) {
    const fileLabel = `unit-${u.unit}.json`;
    const got = extractFromUnit(u, fileLabel);
    bySourceFile[fileLabel] = got.length;
    allCandidates.push(...got);
  }

  // 1b. Append narrative-extraction candidates from the Section A audit.
  //     These come AFTER the formal-array candidates so the dedupe
  //     "earliest wins" rule prefers the formal-array entry whenever the
  //     same word is in both (e.g. "find" is in unit-15 vocabulary[]; if
  //     it were also in NARRATIVE_EXTRACTION the formal one would win).
  const NARRATIVE_SOURCE_LABEL = '<narrative-audit>';
  bySourceFile[NARRATIVE_SOURCE_LABEL] = NARRATIVE_EXTRACTION.length;
  for (const item of NARRATIVE_EXTRACTION) {
    const w = normaliseWord(item.word);
    allCandidates.push({
      word: w,
      partOfSpeech: item.partOfSpeech,
      afFLevel: 'grade1',
      afFUnit: item.earliestUnit,
      isFunctionWord: FUNCTION_WORDS.has(w),
      isMultiWord: isMultiWord(w),
      source: `${NARRATIVE_SOURCE_LABEL}:${item.context}`,
    });
  }

  // 2. Dedupe across units. Earliest unit wins (stable iteration order
  //    because units were sorted ascending). Subsequent occurrences are
  //    flagged as duplicates with a note explaining the loss.
  const uniqueByWord = new Map<string, Candidate>();
  const duplicates: ReportEntry[] = [];
  for (const c of allCandidates) {
    const existing = uniqueByWord.get(c.word);
    if (!existing) {
      uniqueByWord.set(c.word, c);
      continue;
    }
    const note =
      existing.partOfSpeech === c.partOfSpeech
        ? `kept ${existing.source} (unit ${existing.afFUnit}); also seen in ${c.source} (unit ${c.afFUnit})`
        : `kept ${existing.source} as ${existing.partOfSpeech}; later seen in ${c.source} as ${c.partOfSpeech} — review if you want the later POS instead`;
    duplicates.push({ word: c.word, detail: note });
  }
  const unique = Array.from(uniqueByWord.values());

  // 3. Build the report buckets.
  const byAfFLevel = tally(unique.map((c) => c.afFLevel));
  const byPartOfSpeech = tally(unique.map((c) => c.partOfSpeech));
  // CEFR isn't inferred yet — every row's cefr_level is null. Reported as
  // a single bucket so the shape stays consistent for future passes.
  const byCefrLevel: Record<string, number> = { 'null': unique.length };

  const multiWord: ReportEntry[] = unique
    .filter((c) => c.isMultiWord)
    .map((c) => ({
      word: c.word,
      detail: `from ${c.source}, unit ${c.afFUnit}, POS=${c.partOfSpeech}`,
    }));

  // "Ambiguous" = the dedupe surfaced a POS conflict between units, OR the
  // word matched a function word (we'd be inserting a closed-class token
  // into a content-vocab table — usually a sign of weird source data).
  const ambiguous: ReportEntry[] = [
    ...duplicates.filter((d) => d.detail.includes('review if you want')),
  ];
  const functionWordCollisions: ReportEntry[] = unique
    .filter((c) => c.isFunctionWord)
    .map((c) => ({
      word: c.word,
      detail: `seeded as POS=${c.partOfSpeech} from ${c.source}; is_function_word=true on insert`,
    }));

  // Skipped: nothing is silently dropped today. If we add filters later
  // (e.g. phonics-only words explicitly), they'd land here.
  const skipped: ReportEntry[] = [];

  const report: SeedReport = {
    generatedAt: new Date().toISOString(),
    mode: WRITE ? 'write' : 'dry-run',
    totals: {
      candidatesBeforeDedupe: allCandidates.length,
      uniqueAfterDedupe: unique.length,
      duplicatesCollapsed: duplicates.length,
      skipped: skipped.length,
    },
    bySourceFile,
    byAfFLevel,
    byCefrLevel,
    byPartOfSpeech,
    topAmbiguous: ambiguous.slice(0, 20),
    topMultiWord: multiWord.slice(0, 20),
    duplicates,
    skipped,
    functionWordCollisions,
  };

  // 4. Print human-readable summary to stdout.
  console.log('');
  console.log(`Mode: ${report.mode}`);
  console.log(`Total candidates before dedupe: ${report.totals.candidatesBeforeDedupe}`);
  console.log(`Unique after dedupe:            ${report.totals.uniqueAfterDedupe}`);
  console.log(`Duplicates collapsed:           ${report.totals.duplicatesCollapsed}`);
  console.log('');
  console.log('By source file:');
  for (const [k, v] of Object.entries(bySourceFile)) console.log(`  ${k}: ${v}`);
  console.log('');
  console.log('By afFLevel:');
  for (const [k, v] of Object.entries(byAfFLevel)) console.log(`  ${k}: ${v}`);
  console.log('');
  console.log('By cefrLevel: (not inferred — all null)');
  console.log(`  null: ${byCefrLevel['null']}`);
  console.log('');
  console.log('By part of speech:');
  for (const [k, v] of Object.entries(byPartOfSpeech)) console.log(`  ${k}: ${v}`);
  console.log('');
  console.log(`Top ${report.topAmbiguous.length} ambiguous (POS conflicts across units):`);
  for (const e of report.topAmbiguous) console.log(`  ${e.word} — ${e.detail}`);
  console.log('');
  console.log(`Top ${report.topMultiWord.length} multi-word entries:`);
  for (const e of report.topMultiWord) console.log(`  ${e.word} — ${e.detail}`);
  console.log('');
  if (functionWordCollisions.length) {
    console.log(`Function-word collisions (${functionWordCollisions.length}):`);
    for (const e of functionWordCollisions) console.log(`  ${e.word} — ${e.detail}`);
  } else {
    console.log('Function-word collisions: none.');
  }
  console.log('');

  // 5. Write the JSON report.
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Full report → ${path.relative(process.cwd(), REPORT_PATH)}`);

  // 6. Either upsert or stop.
  if (!WRITE) {
    console.log('\n[dry-run] No DB writes. Re-run with --write to upsert.');
    process.exit(0);
  }

  console.log(`\nUpserting ${unique.length} rows into vocabulary…`);
  // Idempotent upsert: on word conflict, keep existing non-null values and
  // fill in nulls with whatever this run computed. is_function_word is
  // promoted false→true but never demoted (manual edits stick). word and
  // id are immutable; created_at is preserved.
  const rows = unique.map((c) => ({
    word: c.word,
    partOfSpeech: c.partOfSpeech,
    afFLevel: c.afFLevel,
    afFUnit: c.afFUnit,
    isFunctionWord: c.isFunctionWord,
  }));

  await db
    .insert(vocabulary)
    .values(rows)
    .onConflictDoUpdate({
      target: vocabulary.word,
      set: {
        partOfSpeech: sql`COALESCE(${vocabulary.partOfSpeech}, EXCLUDED.part_of_speech)`,
        afFLevel: sql`COALESCE(${vocabulary.afFLevel}, EXCLUDED.af_f_level)`,
        afFUnit: sql`COALESCE(${vocabulary.afFUnit}, EXCLUDED.af_f_unit)`,
        isFunctionWord: sql`${vocabulary.isFunctionWord} OR EXCLUDED.is_function_word`,
        // Curriculum classification wins over scaffold: any pre-existing
        // scaffold row for a word that's now curriculum-tagged should be
        // demoted. The mutual-exclusion invariant lives in the seed
        // scripts per the schema comment on is_scaffold.
        isScaffold: sql`false`,
        updatedAt: sql`now()`,
      },
    });

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
