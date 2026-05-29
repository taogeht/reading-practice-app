// Per-book unit catalog for the practice picker. Replaces the hardcoded,
// FAF1-only `UNITS` list (src/lib/practice/units.ts) for any flow that needs to
// be book-aware: it reads each unit's `topic` straight from the curriculum JSON
// so there's a single source of truth across all five books.
//
// Server-only (uses node:fs). Call from API routes, not client components.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type BookSlug, getBook } from './books';
import { UNITS } from './units';

export interface BookUnitInfo {
  unit: number;
  topic: string;
  emoji?: string;
}

// FAF1 is the only book with curated emojis (in units.ts). Other books fall
// back to no emoji until/unless emojis are authored for them.
const FAF1_EMOJI = new Map(UNITS.map((u) => [u.unit, u.emoji]));

const CURRICULUM_DIR = path.join(process.cwd(), 'src', 'lib', 'curriculum');

// Returns the picker entries for a book — one per unit listed in that book's
// `availableUnits` (books.ts), with the topic pulled from the unit JSON.
export async function getBookUnits(slug: BookSlug): Promise<BookUnitInfo[]> {
  const book = getBook(slug);
  if (!book) return [];

  const entries = await Promise.all(
    book.availableUnits.map(async (unit): Promise<BookUnitInfo> => {
      let topic = `Unit ${unit}`;
      try {
        const contents = await readFile(
          path.join(CURRICULUM_DIR, slug, `unit-${unit}.json`),
          'utf-8'
        );
        const json = JSON.parse(contents) as { topic?: unknown };
        if (typeof json.topic === 'string' && json.topic.trim()) topic = json.topic;
      } catch {
        // Missing/invalid JSON — keep the placeholder topic. books.ts should
        // not list a unit without a JSON file, so this is a safety net.
      }
      return {
        unit,
        topic,
        emoji: slug === 'family-friends-1' ? FAF1_EMOJI.get(unit) : undefined,
      };
    })
  );

  return entries.sort((a, b) => a.unit - b.unit);
}
