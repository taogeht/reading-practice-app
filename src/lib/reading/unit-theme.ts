// Derives a story theme from the Family and Friends unit the target vocabulary
// comes from.
//
// WHY THIS EXISTS: every curriculum unit JSON already carries a `topic` —
// "We're having fun at the beach!", "In the museum", "The Ancient Mayans",
// "Billy's teddy bear!". Those are curriculum-aligned, age-appropriate story
// premises that the generator previously never read, which is why generated
// stories defaulted to the one setting hardcoded in the planner's prompt.
// Reading the topic gives us thematic variety that is *more* aligned to the
// lesson, not less.
//
// Server-only (node:fs via the curriculum loader). Call from API routes and
// generation stages, not client components.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type BookSlug, getBook } from '@/lib/practice/books';
import type { AfFLevel } from '@/lib/reading/generate/vocab';

const CURRICULUM_DIR = path.join(process.cwd(), 'src', 'lib', 'curriculum');

export interface UnitTheme {
  bookSlug: BookSlug;
  bookTitle: string;
  unit: number;
  /** The unit's headline topic, verbatim from the curriculum JSON. */
  topic: string;
  /** Sentence frames the unit drills. Surfaced to the planner as a nudge so
   *  beats naturally invite the grammar the class is practising. */
  grammarPatterns: string[];
}

/**
 * `vocabulary.af_f_level` is an enum of starter/grade1..grade6; the curriculum
 * files are keyed by book slug. gradeN maps to Family and Friends N.
 *
 * ASSUMPTION: 'starter' has no curriculum directory of its own — the school's
 * American Family and Friends progression starts its authored units at book 1
 * (FAF 2 and 3 additionally carry a unit 0 "Welcome back!" review section, but
 * there is no "starter" book on disk). Starter-tagged vocabulary therefore
 * yields no unit theme and the generator falls back to its other theme
 * sources. Same for grade6, which has no book in books.ts.
 */
export function afFLevelToBookSlug(level: AfFLevel | null | undefined): BookSlug | null {
  switch (level) {
    case 'grade1': return 'family-friends-1';
    case 'grade2': return 'family-friends-2';
    case 'grade3': return 'family-friends-3';
    case 'grade4': return 'family-friends-4';
    case 'grade5': return 'family-friends-5';
    default: return null; // 'starter', 'grade6', null
  }
}

/** Reads one unit's curriculum JSON. Returns null when the book/unit has no
 *  authored file — a normal condition (books.ts only lists curated units), so
 *  callers treat null as "no theme available", not as an error. */
export async function getUnitTheme(
  level: AfFLevel | null | undefined,
  unit: number | null | undefined,
): Promise<UnitTheme | null> {
  const slug = afFLevelToBookSlug(level);
  if (!slug || unit == null || !Number.isInteger(unit)) return null;

  const book = getBook(slug);
  if (!book || !book.availableUnits.includes(unit)) return null;

  try {
    const contents = await readFile(
      path.join(CURRICULUM_DIR, slug, `unit-${unit}.json`),
      'utf-8',
    );
    const json = JSON.parse(contents) as {
      topic?: unknown;
      grammar_patterns?: unknown;
    };

    const topic = typeof json.topic === 'string' ? json.topic.trim() : '';
    if (!topic) return null;

    const grammarPatterns = Array.isArray(json.grammar_patterns)
      ? json.grammar_patterns
          .map((p) => (p && typeof p === 'object' ? (p as { pattern?: unknown }).pattern : null))
          .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      : [];

    return { bookSlug: slug, bookTitle: book.title, unit, topic, grammarPatterns };
  } catch {
    // Missing or malformed JSON — no theme, not a failure.
    return null;
  }
}

/**
 * Picks the unit a set of target-vocabulary rows most represents.
 *
 * Targets usually all come from one unit, but a teacher selecting "random for
 * this level" can draw across several. Most-frequent wins; ties break toward
 * the HIGHEST unit, on the reasoning that the newest material is what the
 * lesson is actually about — an older unit's words are incidental review.
 */
export function pickDominantUnit(
  rows: { afFLevel: AfFLevel | null; afFUnit: number | null }[],
): { afFLevel: AfFLevel; afFUnit: number } | null {
  const counts = new Map<string, { level: AfFLevel; unit: number; n: number }>();

  for (const row of rows) {
    if (!row.afFLevel || row.afFUnit == null) continue;
    const key = `${row.afFLevel}:${row.afFUnit}`;
    const seen = counts.get(key);
    if (seen) seen.n += 1;
    else counts.set(key, { level: row.afFLevel, unit: row.afFUnit, n: 1 });
  }

  let best: { level: AfFLevel; unit: number; n: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.n > best.n || (entry.n === best.n && entry.unit > best.unit)) {
      best = entry;
    }
  }

  return best ? { afFLevel: best.level, afFUnit: best.unit } : null;
}
