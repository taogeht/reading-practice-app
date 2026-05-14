// Single source of truth for which character names the generator is
// allowed to put in a story. The constraint is operational, not
// curricular: Google Cloud TTS and OpenAI Whisper both reliably
// pronounce + transcribe these four names. A non-English name like
// "Mei" gets transcribed as "may" / "my" by Whisper, breaking the
// word-alignment grader and unfairly tanking a kid's accuracy score.
//
// If you add a new name here, smoke-test it against:
//   1. Google TTS Journey + Studio voices (does the audio say it right?)
//   2. Whisper transcription on a slow clear read (does it come back exact?)
// Only ship the addition if both pass.

export const APPROVED_CHARACTER_NAMES = ['Sally', 'Emma', 'Tom', 'Jake'] as const;

export type ApprovedCharacterName = (typeof APPROVED_CHARACTER_NAMES)[number];

/** Case-insensitive membership test. The planner is told to use the names
 *  with exact casing, but defending against title-case-leak ("sally" / "SALLY")
 *  costs nothing here. */
export function isApprovedCharacterName(name: string): boolean {
  const lc = name.trim().toLowerCase();
  return APPROVED_CHARACTER_NAMES.some((n) => n.toLowerCase() === lc);
}

/** Names that Whisper / Google TTS demonstrably can't pronounce or transcribe
 *  reliably. Used by the backfill script to find passages that need a name
 *  swap. NOT the inverse of APPROVED_CHARACTER_NAMES — legacy stories
 *  contain perfectly fine off-list names like "Dad", "Grandma", "Mr. Lin"
 *  that don't need rewriting. Extend this list only after confirming a
 *  specific name actually breaks TTS / STT in practice. */
export const PROBLEMATIC_CHARACTER_NAMES = ['Mei', 'Bao'] as const;

export function isProblematicCharacterName(name: string): boolean {
  const lc = name.trim().toLowerCase();
  return PROBLEMATIC_CHARACTER_NAMES.some((n) => n.toLowerCase() === lc);
}
