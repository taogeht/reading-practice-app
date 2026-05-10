// Shared DB lookups for the reading-passage generation pipeline.
// Stage 1 (plan) and Stage 2 (prose) both need:
//   - the target vocab rows (with word/POS/example for prompt context)
//   - the cumulative vocab rows (the allowlist the model can use freely)
// Putting the logic here once keeps the two stages in lockstep when we
// refine the cumulative-derivation rule.

import { eq, inArray, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { afFLevelEnum, vocabulary } from '@/lib/db/schema';

export type AfFLevel = (typeof afFLevelEnum.enumValues)[number];

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

/** Derive cumulative vocab from target rows. Returns the union of:
 *    - all curriculum rows at any AF&F level represented by the target
 *      set (no within-level unit cap — see "scope" note below)
 *    - function words (the/is/she/etc.) — closed-class scaffolding
 *    - scaffold words (see/want/happy/behind/etc.) — open-class words
 *      not in the curriculum but assumed by it
 *    - core-vocabulary words (look/run/go/give/etc.) — promoted curriculum
 *      verbs that are universally available regardless of level
 *
 *  Scope note: an earlier version capped curriculum rows at
 *  max(afFUnit) per represented level, modeling "the kid hasn't learned
 *  units 14-15 yet if today's targets are from unit 4." That assumption
 *  was wrong — a Grade 1 ESL student is studying through the FULL AF&F1
 *  curriculum over the year. Today's story practices specific words but
 *  the kid's available vocabulary is the entire level. The cap was
 *  starving low-target-unit stories of basic nouns/verbs they should
 *  have access to and inflating the validator's unknown-word issue
 *  count. The cap is now removed. */
export async function deriveCumulativeVocab(
  targetRows: TargetRow[],
): Promise<CumulativeRow[]> {
  // Collect the set of AF&F levels any target word belongs to. Multiple
  // targets at the same level collapse to one entry — the within-level
  // unit cap is no longer relevant.
  const levels = new Set<AfFLevel>();
  for (const r of targetRows) {
    if (r.afFLevel) levels.add(r.afFLevel);
  }

  if (levels.size === 0) {
    // None of the targets had curriculum metadata. Fall back to the
    // always-available buckets (function + scaffold + core) — the caller
    // can pass cumulativeVocabIds explicitly to opt in to a richer set.
    return db
      .select({
        id: vocabulary.id,
        word: vocabulary.word,
        partOfSpeech: vocabulary.partOfSpeech,
        isFunctionWord: vocabulary.isFunctionWord,
        isPicturable: vocabulary.isPicturable,
      })
      .from(vocabulary)
      .where(
        or(
          eq(vocabulary.isFunctionWord, true),
          eq(vocabulary.isScaffold, true),
          eq(vocabulary.isCoreVocabulary, true),
        ),
      );
  }

  // Single IN clause covers all represented levels — Drizzle accepts
  // the enum-typed array directly.
  const levelArray = Array.from(levels);

  return db
    .select({
      id: vocabulary.id,
      word: vocabulary.word,
      partOfSpeech: vocabulary.partOfSpeech,
      isFunctionWord: vocabulary.isFunctionWord,
      isPicturable: vocabulary.isPicturable,
    })
    .from(vocabulary)
    .where(
      or(
        inArray(vocabulary.afFLevel, levelArray),
        eq(vocabulary.isFunctionWord, true),
        eq(vocabulary.isScaffold, true),
        eq(vocabulary.isCoreVocabulary, true),
      ),
    );
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
