// Single source of truth for the unit picker. Both student practice and teacher
// question-review pages import this list. Update the `topic` as you curate each
// unit's JSON.

export type UnitInfo = {
  unit: number;
  topic: string;
  emoji: string;
};

export const UNITS: UnitInfo[] = [
  { unit: 1, topic: 'My classroom', emoji: '🏫' },
  { unit: 2, topic: 'My toys', emoji: '🧸' },
  { unit: 3, topic: 'My body', emoji: '👋' },
  { unit: 4, topic: 'Jobs and people', emoji: '👩‍🏫' },
  { unit: 5, topic: 'At the park', emoji: '🛝' },
  { unit: 6, topic: 'Unit 6', emoji: '📖' },
  { unit: 7, topic: 'Unit 7', emoji: '📖' },
  { unit: 8, topic: 'Unit 8', emoji: '📖' },
  { unit: 9, topic: 'Unit 9', emoji: '📖' },
  { unit: 10, topic: 'Unit 10', emoji: '📖' },
  { unit: 11, topic: 'Unit 11', emoji: '📖' },
  { unit: 12, topic: 'Unit 12', emoji: '📖' },
  { unit: 13, topic: 'Clean up!', emoji: '🧹' },
  { unit: 14, topic: 'Unit 14', emoji: '📖' },
  { unit: 15, topic: 'Unit 15', emoji: '📖' },
];

export const MIN_UNIT = 1;
export const MAX_UNIT = 15;

export function isValidUnit(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_UNIT && n <= MAX_UNIT;
}
