// Behaviors and rating values shown in the weekly recap when the teacher
// chooses 'checklist' format. Adding/removing entries here updates the form,
// the parent-facing view, and the server-side validator below.

export const BEHAVIORS = [
  { key: 'listening',            label: 'Listening' },
  { key: 'participation',        label: 'Participation' },
  { key: 'following_directions', label: 'Following directions' },
  { key: 'effort',               label: 'Effort' },
  { key: 'working_with_others',  label: 'Working with others' },
  { key: 'completing_work',      label: 'Completing work' },
] as const;

export type BehaviorKey = (typeof BEHAVIORS)[number]['key'];

export const BEHAVIOR_RATINGS = ['excellent', 'good', 'needs_work'] as const;
export type BehaviorRating = (typeof BEHAVIOR_RATINGS)[number];

export const BEHAVIOR_RATING_LABEL: Record<BehaviorRating, string> = {
  excellent: 'Excellent',
  good: 'Good',
  needs_work: 'Needs work',
};

// Tailwind class slugs for chip rendering. Kept here so UI and server agree
// on the same canonical set.
export const BEHAVIOR_RATING_COLOR: Record<BehaviorRating, string> = {
  excellent: 'bg-green-100 text-green-800 border-green-300',
  good: 'bg-blue-100 text-blue-800 border-blue-300',
  needs_work: 'bg-amber-100 text-amber-800 border-amber-300',
};

export const BEHAVIOR_FORMATS = ['checklist', 'comment'] as const;
export type BehaviorFormat = (typeof BEHAVIOR_FORMATS)[number];

export const RECAP_STATUSES = ['draft', 'published'] as const;
export type RecapStatus = (typeof RECAP_STATUSES)[number];

export type BehaviorRatingsMap = Partial<Record<BehaviorKey, BehaviorRating>>;

const BEHAVIOR_KEY_SET = new Set<string>(BEHAVIORS.map((b) => b.key));
const RATING_SET = new Set<string>(BEHAVIOR_RATINGS);

// Returns the validated map (drops any unknown keys / values) or null if input
// was malformed enough we'd rather reject the write outright. Used by the API
// when persisting per-student behavior.
export function validateBehaviorRatings(input: unknown): BehaviorRatingsMap | null {
  if (input === null || input === undefined) return {};
  if (typeof input !== 'object' || Array.isArray(input)) return null;
  const out: BehaviorRatingsMap = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!BEHAVIOR_KEY_SET.has(key)) continue;
    if (typeof value !== 'string' || !RATING_SET.has(value)) continue;
    out[key as BehaviorKey] = value as BehaviorRating;
  }
  return out;
}
