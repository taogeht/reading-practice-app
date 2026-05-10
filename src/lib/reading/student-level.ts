// Map a student's free-text `students.reading_level` into the numeric
// reading-level id used by the passage pipeline (1-5). Shared between
// the library page (Track B) and the focused reader (Track C); kept
// here so they can't drift.
//
// The reading_level column is varchar/free-text — schools enter values
// like "Grade 1", "G1 Early Readers", "Starter / KG", etc. The mapping
// is deliberately permissive (case-insensitive substring matches) and
// falls through to level 2 (Early) as a sensible default for anything
// it can't classify, since most of the school's classes are around
// AF&F Grade 1.

import type { ReadingLevelId } from './levels';

/** Map a free-text reading level to one of the 5 numeric levels.
 *  Falls back to 2 (Early / AF&F Grade 1) when the input is null/empty
 *  or doesn't match any known marker — that's the school's biggest
 *  cohort, so defaulting there minimises mis-shown content. */
export function mapStudentReadingLevel(text: string | null | undefined): ReadingLevelId {
  if (!text) return 2;
  const lower = text.toLowerCase();

  // Order matters: more specific labels (containing 'grade N') are
  // checked first so a label like "Grade 1 Emerging" still resolves
  // to 2 rather than getting stolen by the 'emerging' branch below.
  // Word-boundary anchors avoid 'kg' inside 'kindergarten' triggering K
  // before reaching the level-name aliases.
  if (
    lower.includes('starter') ||
    lower.includes('kindergarten') ||
    /\bk\b/.test(lower) ||
    lower.includes('emerging')
  ) {
    return 1;
  }
  if (lower.includes('grade 1') || lower.includes('g1') || lower.includes('early')) {
    return 2;
  }
  if (
    lower.includes('grade 2') ||
    lower.includes('g2') ||
    lower.includes('developing')
  ) {
    return 3;
  }
  if (lower.includes('grade 3') || lower.includes('g3') || lower.includes('fluent')) {
    return 4;
  }
  if (
    lower.includes('grade 4') ||
    lower.includes('g4') ||
    lower.includes('confident')
  ) {
    return 5;
  }
  return 2;
}
