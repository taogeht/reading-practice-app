// All gamification tuning lives here. Tweak values without touching call sites.

export type XpEventType =
  | 'spelling_won'
  | 'spelling_lost'
  | 'practice_correct'
  | 'practice_first_try_bonus'
  | 'practice_wrong_first_attempt'
  | 'recording_submitted'
  | 'daily_login'
  | 'streak_7_bonus'
  | 'streak_30_bonus'
  | 'streak_100_bonus';

export const XP_VALUES: Record<XpEventType, number> = {
  spelling_won: 5,
  spelling_lost: 1,
  practice_correct: 3,
  practice_first_try_bonus: 2,
  // Effort credit when a student gets a question wrong, but ONLY on their very
  // first attempt at that question — prevents grinding XP by spamming wrong
  // answers on the same question.
  practice_wrong_first_attempt: 1,
  recording_submitted: 20,
  daily_login: 10,
  streak_7_bonus: 25,
  streak_30_bonus: 100,
  streak_100_bonus: 500,
};

// Polynomial level curve. xp_required(N) = 100 * N * (N-1) / 2
//   Level 1 → 0, Level 2 → 100, Level 3 → 300, Level 5 → 1000, Level 10 → 4500.
// Fast-feels-good early, naturally slows so a year-long student lands around L15-20.
export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  return 100 * level * (level - 1) / 2;
}

export function levelForXp(totalXp: number): number {
  // Solve N(N-1)/2 ≤ xp/100 → N ≤ (1 + sqrt(1 + 8*xp/100)) / 2
  if (totalXp <= 0) return 1;
  const n = Math.floor((1 + Math.sqrt(1 + (8 * totalXp) / 100)) / 2);
  return Math.max(1, n);
}

export function xpProgressToNextLevel(totalXp: number): {
  currentLevel: number;
  xpInLevel: number;
  xpForNextLevel: number;
  fraction: number;
} {
  const currentLevel = levelForXp(totalXp);
  const base = xpRequiredForLevel(currentLevel);
  const next = xpRequiredForLevel(currentLevel + 1);
  const xpInLevel = totalXp - base;
  const xpForNextLevel = next - base;
  const fraction = xpForNextLevel > 0 ? xpInLevel / xpForNextLevel : 1;
  return { currentLevel, xpInLevel, xpForNextLevel, fraction };
}

// Human-readable metadata for each student-visible XP event. Powers the
// "How XP Works" guide. Streak/login bonuses are excluded here — streaks have
// their own section in the guide, and `daily_login` is shown as a free bonus.
export type XpEventIcon = 'mic' | 'book' | 'spell' | 'star' | 'login';

export const XP_EVENT_LABELS: Array<{
  eventType: XpEventType;
  label: string;
  description: string;
  icon: XpEventIcon;
}> = [
  {
    eventType: 'recording_submitted',
    label: 'Submit a recording',
    description: 'Record yourself reading an assignment story.',
    icon: 'mic',
  },
  {
    eventType: 'spelling_won',
    label: 'Win a spelling game',
    description: 'Spell the word correctly in Snowman, Listen & Spell, and friends.',
    icon: 'spell',
  },
  {
    eventType: 'spelling_lost',
    label: 'Try a spelling game',
    description: 'Effort credit even when the snowman melts.',
    icon: 'spell',
  },
  {
    eventType: 'practice_correct',
    label: 'Answer a practice question',
    description: 'Each correct answer in the Practice tab.',
    icon: 'star',
  },
  {
    eventType: 'practice_first_try_bonus',
    label: 'First-try bonus',
    description: 'Bonus on your first correct practice answer of the day.',
    icon: 'star',
  },
  {
    eventType: 'practice_wrong_first_attempt',
    label: 'Try a practice question',
    description: 'Effort credit on your first attempt at a question, even if it’s wrong.',
    icon: 'star',
  },
  {
    eventType: 'daily_login',
    label: 'Log in today',
    description: 'Free bonus the first time you do anything each day.',
    icon: 'login',
  },
];

// Streak milestones — when current_streak_days hits one of these on increment,
// fire the matching bonus event + unlock the matching badge.
export const STREAK_MILESTONES: Array<{ days: number; eventType: XpEventType; badgeKey: string }> = [
  { days: 7, eventType: 'streak_7_bonus', badgeKey: 'streak-7' },
  { days: 30, eventType: 'streak_30_bonus', badgeKey: 'streak-30' },
  { days: 100, eventType: 'streak_100_bonus', badgeKey: 'streak-100' },
];

// Animal collection — each level-up unlocks the next entry in this list.
// Custom-illustrated avatars live in public/images/avatars/.
export const ANIMAL_UNLOCK_ORDER: Array<{ key: string; displayName: string; image: string }> = [
  { key: 'monkey',     displayName: 'Monkey',     image: '/images/avatars/monkey.png' },
  { key: 'parrot',     displayName: 'Parrot',     image: '/images/avatars/parrot.png' },
  { key: 'seal',       displayName: 'Seal',       image: '/images/avatars/seal.png' },
  { key: 'snake',      displayName: 'Snake',      image: '/images/avatars/snake.png' },
  { key: 'tiger',      displayName: 'Tiger',      image: '/images/avatars/tiger.png' },
  { key: 'elephant',   displayName: 'Elephant',   image: '/images/avatars/elephant.png' },
  { key: 'giraffe',    displayName: 'Giraffe',    image: '/images/avatars/giraffe.png' },
  { key: 'polar-bear', displayName: 'Polar Bear', image: '/images/avatars/polarbear.png' },
];

// The student's "current avatar" is the highest-level animal they've unlocked.
// Levels 1..8 unlock animals 1..8; level 9+ stays on the last animal until we ship more.
export function animalForLevel(level: number) {
  const idx = Math.min(level - 1, ANIMAL_UNLOCK_ORDER.length - 1);
  return ANIMAL_UNLOCK_ORDER[Math.max(0, idx)];
}

// Returns the animal newly unlocked when crossing from oldLevel → newLevel,
// or null if no new animal is available.
export function newAnimalUnlockOnLevelUp(oldLevel: number, newLevel: number) {
  if (newLevel <= oldLevel) return null;
  const newIdx = newLevel - 1;
  if (newIdx >= ANIMAL_UNLOCK_ORDER.length) return null;
  return ANIMAL_UNLOCK_ORDER[newIdx];
}
