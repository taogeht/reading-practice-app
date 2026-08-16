// Single source of truth for which character names the generator is allowed to
// put in a story, organized into selectable CASTS.
//
// TWO CONSTRAINTS ARE IN TENSION HERE:
//
// 1. OPERATIONAL — Google Cloud TTS and OpenAI Whisper have to handle the name.
//    A name Whisper mis-transcribes breaks the word-alignment grader and
//    unfairly tanks a kid's accuracy score. "Mei" comes back as "may"/"my".
//
// 2. CURRICULAR — kids read fastest and most confidently when the characters
//    are the ones they already meet in their Family and Friends book. Billy,
//    Rosy, and Tim are names they have decoded in class dozens of times.
//
// These conflict for homophone-spelling names: "Rosy" is curricularly ideal
// and Whisper reliably writes it "Rosie". Rather than drop the protagonist of
// the curriculum, such names carry an `aliases` list which is mirrored in
// NAME_ALIASES in src/lib/grading/align.ts, so the grader treats the Whisper
// spelling as a match. Add an alias ONLY when the two spellings are true
// homophones — otherwise it would mask a real misread.
//
// `ttsVerified` records whether a name has been round-tripped through the
// smoke test (Google TTS Journey/Studio → Whisper on a slow clear read →
// exact match). Names default to false until that harness is run; false does
// NOT block use, it flags what still needs measuring.

export type CastId = 'faf_core' | 'faf_extended' | 'neutral';

export interface CastMember {
  name: string;
  /** Image-direction hint so the planner can describe them consistently.
   *  Deliberately loose — the planner still writes the full description. */
  role: string;
  /** Round-tripped TTS → Whisper exactly. See the smoke test in the header. */
  ttsVerified: boolean;
  /** Known alternate spellings Whisper emits. Mirror any entry here in
   *  NAME_ALIASES in src/lib/grading/align.ts or it has no grading effect. */
  aliases?: string[];
}

export interface CharacterCast {
  id: CastId;
  label: string;
  /** Shown to the teacher in the generation UI. */
  description: string;
  members: CastMember[];
}

/** Family roles are available to every cast — they're decodable, universal,
 *  and Whisper handles them cleanly. Kept separate from `members` because
 *  they're relational labels, not given names: a story can use "Mom" and
 *  "Billy" together without spending two of its three character slots. */
export const FAMILY_ROLE_NAMES = ['Mom', 'Dad', 'Grandma', 'Grandpa'] as const;

export const CHARACTER_CASTS: Record<CastId, CharacterCast> = {
  faf_core: {
    id: 'faf_core',
    label: 'Family and Friends family',
    description:
      'Billy, Rosy, and Tim — the sibling trio from the books. Students have already decoded these names in class.',
    members: [
      { name: 'Billy', role: 'boy, about 7', ttsVerified: false },
      { name: 'Rosy', role: 'girl, about 9', ttsVerified: false, aliases: ['Rosie'] },
      { name: 'Tim', role: 'boy, about 8', ttsVerified: false },
    ],
  },
  faf_extended: {
    id: 'faf_extended',
    label: 'Family and Friends — wider cast',
    description:
      'The core trio plus classmates and friends who recur across Family and Friends 1-3.',
    members: [
      { name: 'Billy', role: 'boy, about 7', ttsVerified: false },
      { name: 'Rosy', role: 'girl, about 9', ttsVerified: false, aliases: ['Rosie'] },
      { name: 'Tim', role: 'boy, about 8', ttsVerified: false },
      { name: 'Amy', role: 'girl, about 8', ttsVerified: false },
      { name: 'Ken', role: 'boy, about 9', ttsVerified: false },
      { name: 'Jim', role: 'boy, about 9', ttsVerified: false },
      { name: 'Max', role: 'boy, about 7', ttsVerified: false },
      { name: 'Alice', role: 'girl, about 8', ttsVerified: false },
      { name: 'Leo', role: 'boy, about 8', ttsVerified: false },
      { name: 'Katie', role: 'girl, about 9', ttsVerified: false, aliases: ['Katy'] },
    ],
  },
  neutral: {
    id: 'neutral',
    label: 'Neutral names',
    description:
      'Sally, Emma, Tom, Jake. Not from the books, but the only names verified end-to-end against TTS and Whisper.',
    members: [
      { name: 'Sally', role: 'girl, about 8', ttsVerified: true },
      { name: 'Emma', role: 'girl, about 9', ttsVerified: true },
      { name: 'Tom', role: 'boy, about 8', ttsVerified: true },
      { name: 'Jake', role: 'boy, about 9', ttsVerified: true },
    ],
  },
};

/** What a generation uses when the teacher expresses no preference. The books'
 *  own cast is the pedagogical default — decodability is the whole point. */
export const DEFAULT_CAST_ID: CastId = 'faf_core';

export function getCast(id: CastId | undefined): CharacterCast {
  return CHARACTER_CASTS[id ?? DEFAULT_CAST_ID] ?? CHARACTER_CASTS[DEFAULT_CAST_ID];
}

export function isCastId(value: unknown): value is CastId {
  return typeof value === 'string' && value in CHARACTER_CASTS;
}

/** Given names a plan may use, for the selected cast. */
export function castNames(id: CastId | undefined): string[] {
  return getCast(id).members.map((m) => m.name);
}

/** Every name any cast permits, plus family roles. The validity check has to
 *  span all casts: a stored plan is re-validated on regeneration paths that
 *  don't thread the original cast id through. */
const ALL_ALLOWED_NAMES: string[] = Array.from(
  new Set<string>([
    ...Object.values(CHARACTER_CASTS).flatMap((c) => c.members.map((m) => m.name)),
    ...FAMILY_ROLE_NAMES,
  ]),
);

/** Back-compat export. Historically the flat list of every legal name; still
 *  used by scripts/backfill-character-names.ts as its replacement pool. */
export const APPROVED_CHARACTER_NAMES = ALL_ALLOWED_NAMES;

/** Case-insensitive membership test against a specific cast when one is
 *  supplied, otherwise against every name any cast allows. Family roles are
 *  always acceptable. */
export function isApprovedCharacterName(name: string, castId?: CastId): boolean {
  const lc = name.trim().toLowerCase();
  if (FAMILY_ROLE_NAMES.some((n) => n.toLowerCase() === lc)) return true;
  const pool = castId ? castNames(castId) : ALL_ALLOWED_NAMES;
  return pool.some((n) => n.toLowerCase() === lc);
}

/** Names that Whisper / Google TTS demonstrably can't pronounce or transcribe
 *  reliably, AND that no alias can rescue (they aren't homophones of the
 *  intended spelling — they come back as a different word entirely). Used by
 *  the backfill script to find passages needing a name swap. NOT the inverse
 *  of the casts: legacy stories contain fine off-list names like "Mr. Lin"
 *  that don't need rewriting. Extend only after confirming a specific name
 *  actually breaks TTS / STT in practice. */
export const PROBLEMATIC_CHARACTER_NAMES = ['Mei', 'Bao'] as const;

export function isProblematicCharacterName(name: string): boolean {
  const lc = name.trim().toLowerCase();
  return PROBLEMATIC_CHARACTER_NAMES.some((n) => n.toLowerCase() === lc);
}
