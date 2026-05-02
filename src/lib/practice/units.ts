// Catalog of every book unit. Used by features that don't depend on curated
// per-unit curriculum JSON (e.g. the Sunny helper preview, which has its own
// knowledge-base.json). For the practice-quiz flow, use AVAILABLE_PRACTICE_UNITS
// instead — that list is restricted to units we actually have JSON for.

export type UnitInfo = {
  unit: number;
  topic: string;
  emoji: string;
};

export const UNITS: UnitInfo[] = [
  { unit: 1, topic: "What's this?", emoji: '🏫' },
  { unit: 2, topic: 'Playtime!', emoji: '🧸' },
  { unit: 3, topic: 'This is my nose!', emoji: '👃' },
  { unit: 4, topic: "He's a hero!", emoji: '🦸' },
  { unit: 5, topic: "Where's the ball?", emoji: '⚽' },
  { unit: 6, topic: "Billy's teddy bear!", emoji: '🧸' },
  { unit: 7, topic: 'Are these his pants?', emoji: '👕' },
  { unit: 8, topic: "Where's Grandma?", emoji: '🏠' },
  { unit: 9, topic: 'Lunchtime!', emoji: '🍱' },
  { unit: 10, topic: 'A new friend!', emoji: '👯' },
  { unit: 11, topic: 'I like monkeys!', emoji: '🐵' },
  { unit: 12, topic: 'Dinnertime!', emoji: '🍚' },
  { unit: 13, topic: 'Clean up!', emoji: '🧹' },
  { unit: 14, topic: 'Action Boy can run!', emoji: '🏃' },
  { unit: 15, topic: "Let's play ball!", emoji: '🏖️' },
];

export const MIN_UNIT = 1;
export const MAX_UNIT = 15;

export function isValidUnit(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_UNIT && n <= MAX_UNIT;
}

// Units with a curated curriculum JSON at src/lib/curriculum/unit-{N}.json.
// The practice-quiz generator only supports these — there is no PDF fallback.
// Add a unit number here when you write its JSON.
const PRACTICE_UNIT_NUMBERS: ReadonlySet<number> = new Set([12, 13, 14, 15]);

export const AVAILABLE_PRACTICE_UNITS: UnitInfo[] = UNITS.filter((u) =>
  PRACTICE_UNIT_NUMBERS.has(u.unit)
);

export function isAvailablePracticeUnit(n: number): boolean {
  return Number.isInteger(n) && PRACTICE_UNIT_NUMBERS.has(n);
}
