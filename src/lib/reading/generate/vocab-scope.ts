// The curriculum scope rule for story generation: which words a story at a
// given level/unit is allowed to use.
//
// Split out from vocab.ts (which opens a DB pool at import time) so the rule
// itself stays pure and unit-testable. vocab.ts turns a scope into SQL.

import { afFLevelEnum } from '@/lib/db/schema';

export type AfFLevel = (typeof afFLevelEnum.enumValues)[number];

/** Ordered curriculum sequence. The enum's declaration order in schema.ts IS
 *  the pedagogical order (starter -> grade1 -> ... -> grade6), so an index
 *  comparison is a valid "is this level below that one" test. */
export const LEVEL_ORDER: readonly AfFLevel[] = afFLevelEnum.enumValues;

/** Below this many CURRICULUM words we stop capping by unit and widen to the
 *  full level. Counts only level-scoped words (levels below + the capped
 *  current level) — deliberately NOT the function/scaffold/core buckets.
 *
 *  Those buckets are constant and say nothing about whether a story has
 *  enough material: an early-unit story is starved of nouns and verbs even
 *  though the always-on words are all still there. Measuring the total
 *  instead made the floor grow with the scaffold list, and a scaffold pass
 *  that pushed the total over the line silently switched the widening off
 *  and SHRANK the usable lexicon. Curriculum-only keeps the floor stable
 *  no matter how the always-on buckets grow. */
export const MIN_CURRICULUM_LEXICON = 150;

export interface VocabScope {
  /** Every level strictly below the story's own. All of their units are fair
   *  game — the class finished those books already. */
  belowLevels: AfFLevel[];
  /** The story's level: the highest level any target belongs to. Null when no
   *  target carried curriculum metadata. */
  currentLevel: AfFLevel | null;
  /** Highest unit of currentLevel the story may draw from; null means no cap.
   *  Derived as the MAX unit across targets at currentLevel (not the dominant
   *  one, as unit-theme.ts does) specifically so a target word can never fall
   *  outside its own scope — a story must always be able to use the words it
   *  is built around. */
  unitCap: number | null;
}

/** Resolve the scope a set of target words implies. Pure. */
export function resolveVocabScope(
  targetRows: { afFLevel: AfFLevel | null; afFUnit: number | null }[],
): VocabScope {
  let currentLevel: AfFLevel | null = null;
  for (const row of targetRows) {
    if (!row.afFLevel) continue;
    if (
      currentLevel === null ||
      LEVEL_ORDER.indexOf(row.afFLevel) > LEVEL_ORDER.indexOf(currentLevel)
    ) {
      currentLevel = row.afFLevel;
    }
  }
  if (currentLevel === null) {
    return { belowLevels: [], currentLevel: null, unitCap: null };
  }

  let unitCap: number | null = null;
  for (const row of targetRows) {
    if (row.afFLevel !== currentLevel || row.afFUnit == null) continue;
    if (unitCap === null || row.afFUnit > unitCap) unitCap = row.afFUnit;
  }

  return {
    belowLevels: LEVEL_ORDER.slice(0, LEVEL_ORDER.indexOf(currentLevel)),
    currentLevel,
    unitCap,
  };
}
