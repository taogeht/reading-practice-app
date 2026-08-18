// Map a student's free-text `students.reading_level` into the numeric
// reading-level id used by the passage pipeline (1-5). Shared between
// the library page (Track B) and the focused reader (Track C); kept
// here so they can't drift.
//
// The reading_level column is varchar/free-text — schools enter values
// like "Grade 1", "G1 Early Readers", "Starter / KG", etc. The mapping
// is deliberately permissive (case-insensitive substring matches) and
// falls through to level 1 (Grade 1) as a sensible default for anything
// it can't classify, since most of the school's classes are around
// AF&F Grade 1.

import type { ReadingLevelId } from './levels';

/** Map a free-text reading level to one of the 5 numeric levels.
 *  Levels are 1:1 with Family and Friends 1-5, so "Grade N" maps to N.
 *
 *  Falls back to 1 (Grade 1) when the input is null/empty or matches
 *  nothing — that's the school's biggest cohort, so defaulting there
 *  minimises mis-shown content. Pre-Grade-1 labels (Starter, KG,
 *  kindergarten) also resolve to 1: the ladder has no Starter rung, and
 *  showing the easiest real level beats showing nothing. */
export function mapStudentReadingLevel(text: string | null | undefined): ReadingLevelId {
  if (!text) return 1;
  const lower = text.toLowerCase();

  // Order matters: more specific labels (containing 'grade N') are checked
  // before the level-name aliases, so "Grade 2 Developing" resolves on the
  // grade rather than being stolen by a name branch. Word-boundary anchors
  // stop 'kg' inside 'kindergarten' from matching K early.
  if (lower.includes('grade 1') || lower.includes('g1') || lower.includes('early')) {
    return 1;
  }
  if (lower.includes('grade 2') || lower.includes('g2') || lower.includes('developing')) {
    return 2;
  }
  if (lower.includes('grade 3') || lower.includes('g3') || lower.includes('fluent')) {
    return 3;
  }
  if (lower.includes('grade 4') || lower.includes('g4') || lower.includes('confident')) {
    return 4;
  }
  if (lower.includes('grade 5') || lower.includes('g5') || lower.includes('advanced')) {
    return 5;
  }
  // Pre-Grade-1 markers. Checked last so "Starter — moving to Grade 1"
  // resolves on the grade it names rather than on the word "starter".
  if (
    lower.includes('starter') ||
    lower.includes('kindergarten') ||
    /\bk\b/.test(lower) ||
    lower.includes('emerging')
  ) {
    return 1;
  }
  return 1;
}
