// Shared DB lookups for the reading-passage generation pipeline.
// Stage 1 (plan) and Stage 2 (prose) both need:
//   - the target vocab rows (with word/POS/example for prompt context)
//   - the cumulative vocab rows (the allowlist the model can use freely)
// Putting the logic here once keeps the two stages in lockstep when we
// refine the cumulative-derivation rule.

import { and, count as sqlCount, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { vocabulary } from '@/lib/db/schema';
import {
  type AfFLevel,
  MIN_CURRICULUM_LEXICON,
  type VocabScope,
  resolveVocabScope,
} from './vocab-scope';

// Re-exported so existing importers keep their current import path; the rule
// itself lives in vocab-scope.ts, which stays free of the DB pool.
export type { AfFLevel, VocabScope } from './vocab-scope';
export { resolveVocabScope } from './vocab-scope';

export interface TargetRow {
  id: string;
  word: string;
  partOfSpeech: string;
  exampleSentence: string | null;
  mandarinTranslation: string | null;
  isFunctionWord: boolean;
  afFLevel: AfFLevel | null;
  afFUnit: number | null;
  /** Whether the word is suitable for vocab_matching picture cards.
   *  See scripts/mark-unpicturable-vocab.ts for the curated false set
   *  (numbers, abstract evaluatives, discourse markers). */
  isPicturable: boolean;
}

export interface CumulativeRow {
  id: string;
  word: string;
  partOfSpeech: string;
  isFunctionWord: boolean;
  /** Same semantics as TargetRow.isPicturable — present here so the
   *  question-pair validator can probe a word the model picked from
   *  the cumulative set (vs. from targets) for picture suitability. */
  isPicturable: boolean;
}

/** Fetch target vocab rows by id. Throws if any id is missing or if any
 *  row is a function word — function words can't be a story's target
 *  (you can't build a story around "the"). */
export async function fetchTargetVocab(ids: string[]): Promise<TargetRow[]> {
  if (ids.length === 0) {
    throw new Error('targetVocabIds must contain at least one id');
  }
  const rows: TargetRow[] = await db
    .select({
      id: vocabulary.id,
      word: vocabulary.word,
      partOfSpeech: vocabulary.partOfSpeech,
      exampleSentence: vocabulary.exampleSentence,
      mandarinTranslation: vocabulary.mandarinTranslation,
      isFunctionWord: vocabulary.isFunctionWord,
      afFLevel: vocabulary.afFLevel,
      afFUnit: vocabulary.afFUnit,
      isPicturable: vocabulary.isPicturable,
    })
    .from(vocabulary)
    .where(inArray(vocabulary.id, ids));

  const found = new Set(rows.map((r) => r.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`Target vocabulary IDs not found: ${missing.join(', ')}`);
  }

  const fnWords = rows.filter((r) => r.isFunctionWord);
  if (fnWords.length > 0) {
    throw new Error(
      `Function words cannot be target vocabulary: ${fnWords
        .map((r) => r.word)
        .join(', ')}. The model can't meaningfully build a story around closed-class words.`,
    );
  }

  return rows;
}

/** Fetch arbitrary vocabulary rows by id — used when the caller passes an
 *  explicit cumulativeVocabIds override. */
export async function fetchVocabByIds(ids: string[]): Promise<CumulativeRow[]> {
  if (ids.length === 0) return [];
  return db
    .select({
      id: vocabulary.id,
      word: vocabulary.word,
      partOfSpeech: vocabulary.partOfSpeech,
      isFunctionWord: vocabulary.isFunctionWord,
      isPicturable: vocabulary.isPicturable,
    })
    .from(vocabulary)
    .where(inArray(vocabulary.id, ids));
}

/** Run the scope query. `capUnits` false widens the current level to all of
 *  its units — the size-floor fallback. */
function selectScopedVocab(
  scope: VocabScope,
  capUnits: boolean,
): Promise<CumulativeRow[]> {
  // Always-available buckets, independent of level and unit.
  const clauses = [
    eq(vocabulary.isFunctionWord, true),
    eq(vocabulary.isScaffold, true),
    eq(vocabulary.isCoreVocabulary, true),
  ];

  if (scope.belowLevels.length > 0) {
    clauses.push(inArray(vocabulary.afFLevel, [...scope.belowLevels]));
  }

  if (scope.currentLevel) {
    const atCurrentLevel = eq(vocabulary.afFLevel, scope.currentLevel);
    clauses.push(
      capUnits && scope.unitCap !== null
        ? // A curriculum row carrying no unit cannot be shown to be future
          // material, so it stays in rather than being silently dropped.
          and(
            atCurrentLevel,
            or(lte(vocabulary.afFUnit, scope.unitCap), isNull(vocabulary.afFUnit)),
          )!
        : atCurrentLevel,
    );
  }

  return db
    .select({
      id: vocabulary.id,
      word: vocabulary.word,
      partOfSpeech: vocabulary.partOfSpeech,
      isFunctionWord: vocabulary.isFunctionWord,
      isPicturable: vocabulary.isPicturable,
    })
    .from(vocabulary)
    .where(or(...clauses));
}

/** Derive the vocabulary a story may use freely. Union of:
 *    - every level BELOW the story's level, all units — the class already
 *      finished those books
 *    - the story's own level, up to and including the newest unit its
 *      targets come from — nothing from lessons not yet taught
 *    - function words (the/is/she) — closed-class scaffolding
 *    - scaffold words (see/want/happy/behind) — open-class words the
 *      curriculum assumes but never lists
 *    - core vocabulary (look/run/go/give) — promoted curriculum verbs,
 *      available regardless of level
 *
 *  Scope history: an earlier version capped by unit but did NOT carry lower
 *  levels forward, so a grade2 unit-4 story saw only grade2 units 0-4. That
 *  starved stories and inflated the validator's unknown-word count, so the
 *  cap was removed outright — which then let a grade2 story use grade2
 *  unit-15 words the class had not reached. Both scopes were wrong, in
 *  opposite directions. Carrying every lower level forward pays for the
 *  unit cap everywhere except the bottom of the ladder, where nothing sits
 *  below to draw on; MIN_CUMULATIVE_LEXICON catches that case and widens
 *  back to the full level rather than shipping an unwritable lexicon. */
export async function deriveCumulativeVocab(
  targetRows: TargetRow[],
): Promise<CumulativeRow[]> {
  const scope = resolveVocabScope(targetRows);

  // No curriculum metadata on any target — fall back to the always-available
  // buckets. Callers wanting more can pass cumulativeVocabIds explicitly.
  if (scope.currentLevel === null) return selectScopedVocab(scope, false);

  if (scope.unitCap === null) return selectScopedVocab(scope, true);

  const curriculumCount = await countCurriculumVocab(scope, true);
  const capUnits = curriculumCount >= MIN_CURRICULUM_LEXICON;
  return selectScopedVocab(scope, capUnits);
}

/** How many level-scoped curriculum words the scope admits, ignoring the
 *  always-on buckets. Drives the widen decision in deriveCumulativeVocab. */
async function countCurriculumVocab(
  scope: VocabScope,
  capUnits: boolean,
): Promise<number> {
  const clauses = [];
  if (scope.belowLevels.length > 0) {
    clauses.push(inArray(vocabulary.afFLevel, [...scope.belowLevels]));
  }
  if (scope.currentLevel) {
    const atCurrentLevel = eq(vocabulary.afFLevel, scope.currentLevel);
    clauses.push(
      capUnits && scope.unitCap !== null
        ? and(
            atCurrentLevel,
            or(lte(vocabulary.afFUnit, scope.unitCap), isNull(vocabulary.afFUnit)),
          )!
        : atCurrentLevel,
    );
  }
  if (clauses.length === 0) return 0;

  const rows = await db
    .select({ n: sqlCount() })
    .from(vocabulary)
    .where(or(...clauses));
  return Number(rows[0]?.n ?? 0);
}

/** Helper used by both prose stage and validate stage: load the cumulative
 *  vocab to back the model's allowlist + the validator's known-vocab set,
 *  honouring an explicit override or deriving from target rows. */
export async function resolveCumulativeVocab(
  targetRows: TargetRow[],
  cumulativeVocabIds: string[] | undefined,
): Promise<CumulativeRow[]> {
  return cumulativeVocabIds
    ? fetchVocabByIds(cumulativeVocabIds)
    : deriveCumulativeVocab(targetRows);
}
