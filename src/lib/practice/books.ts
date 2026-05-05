// The five Family and Friends books. Each book has its own units 1..N with
// distinct topics and vocabulary, so practice_questions are tagged with both
// a book_slug and a unit number — unit alone isn't unique across the
// curriculum.
//
// `availableUnits` lists the units that have a curated curriculum JSON file at
// `src/lib/curriculum/{slug}/unit-{N}.json`. The practice generator only works
// for those — there is no PDF fallback.
//
// As you author new curriculum files, add the unit number to the corresponding
// book here and the picker UI will light it up automatically.

export type BookSlug =
  | 'family-friends-1'
  | 'family-friends-2'
  | 'family-friends-3'
  | 'family-friends-4'
  | 'family-friends-5';

export interface PracticeBook {
  slug: BookSlug;
  title: string;
  shortLabel: string;
  availableUnits: number[];
}

export const BOOKS: PracticeBook[] = [
  {
    slug: 'family-friends-1',
    title: 'Family and Friends 1',
    shortLabel: 'FAF 1',
    availableUnits: [12, 13, 14, 15],
  },
  {
    slug: 'family-friends-2',
    title: 'Family and Friends 2',
    shortLabel: 'FAF 2',
    availableUnits: [],
  },
  {
    slug: 'family-friends-3',
    title: 'Family and Friends 3',
    shortLabel: 'FAF 3',
    availableUnits: [],
  },
  {
    slug: 'family-friends-4',
    title: 'Family and Friends 4',
    shortLabel: 'FAF 4',
    availableUnits: [],
  },
  {
    slug: 'family-friends-5',
    title: 'Family and Friends 5',
    shortLabel: 'FAF 5',
    availableUnits: [],
  },
];

export const DEFAULT_BOOK_SLUG: BookSlug = 'family-friends-1';

export function isValidBookSlug(slug: string): slug is BookSlug {
  return BOOKS.some((b) => b.slug === slug);
}

export function getBook(slug: string): PracticeBook | undefined {
  return BOOKS.find((b) => b.slug === slug);
}

export function isUnitAvailableForBook(slug: string, unit: number): boolean {
  const book = getBook(slug);
  return !!book && book.availableUnits.includes(unit);
}
