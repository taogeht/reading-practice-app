// Pure functions for grading a transcribed recording against the expected story
// text. No I/O, no DB. Easy to reason about and easy to swap if we ever change
// the alignment strategy.

const FILLER_WORDS = new Set(['um', 'uh', 'er', 'erm', 'uhh', 'umm', 'hmm']);

/**
 * Spellings Whisper produces for names that are pronounced identically to the
 * spelling our stories use. Without this, a student who reads "Rosy" perfectly
 * gets a substitution error on every occurrence, because Whisper writes
 * "Rosie" — in a story where Rosy is the protagonist that is a double-digit
 * accuracy penalty for a flawless read.
 *
 * THE RULE FOR ADDING ENTRIES: only true homophones — the two spellings must
 * be pronounced the same. That guarantees an alias can never mask a genuine
 * misread. "mum"/"mom" does NOT qualify (/mʌm/ vs /mɑm/): a student who says
 * "mum" really did say a different word, and we want the grader to see it.
 *
 * Keys and values are lowercase; tokenize() applies this after lowercasing,
 * to BOTH the expected text and the transcript, so alignment compares
 * canonical forms on each side. Keep in sync with the `aliases` declared on
 * cast members in src/lib/reading/names.ts.
 */
const NAME_ALIASES = new Map<string, string>([
  ['rosie', 'rosy'],
  ['katy', 'katie'],
]);

/** Canonicalize one token, preserving a possessive/contraction suffix so
 *  "rosie's" maps to "rosy's" rather than falling through unchanged. Story
 *  titles like "Billy's teddy bear!" make possessive name forms common. */
function canonicalizeToken(word: string): string {
  const direct = NAME_ALIASES.get(word);
  if (direct) return direct;

  const apostrophe = word.indexOf("'");
  if (apostrophe > 0) {
    const base = word.slice(0, apostrophe);
    const mapped = NAME_ALIASES.get(base);
    if (mapped) return mapped + word.slice(apostrophe);
  }

  return word;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    // strip everything except letters, digits, apostrophe, hyphen, whitespace
    .replace(/[^a-z0-9'\-\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[-']+|[-']+$/g, ''))
    .filter((w) => w.length > 0 && !FILLER_WORDS.has(w))
    .map(canonicalizeToken);
}

export type Op = 'match' | 'sub' | 'del' | 'ins';

export interface AlignedPair {
  op: Op;
  expected?: string;
  expectedIndex?: number;
  heard?: string;
  heardIndex?: number;
}

// Wagner–Fischer with backtrace. Returns the operation sequence that turns the
// `expected` token array into the `heard` token array, with per-token indices
// preserved so the teacher UI can highlight specific positions in the story.
export function align(expected: string[], heard: string[]): AlignedPair[] {
  const n = expected.length;
  const m = heard.length;

  // dp[i][j] = min edit distance between expected[0..i) and heard[0..j)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = expected[i - 1] === heard[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,         // deletion (expected word skipped)
        dp[i][j - 1] + 1,         // insertion (extra word said)
        dp[i - 1][j - 1] + cost,  // match or substitution
      );
    }
  }

  // Backtrace
  const out: AlignedPair[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && expected[i - 1] === heard[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      out.push({ op: 'match', expected: expected[i - 1], expectedIndex: i - 1, heard: heard[j - 1], heardIndex: j - 1 });
      i--; j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      out.push({ op: 'sub', expected: expected[i - 1], expectedIndex: i - 1, heard: heard[j - 1], heardIndex: j - 1 });
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      out.push({ op: 'del', expected: expected[i - 1], expectedIndex: i - 1 });
      i--;
    } else {
      out.push({ op: 'ins', heard: heard[j - 1], heardIndex: j - 1 });
      j--;
    }
  }
  out.reverse();
  return out;
}

export interface ExpectedTokenView {
  word: string;
  op: 'match' | 'sub' | 'del';
  heard?: string;
}

export interface HeardTokenView {
  word: string;
  op: 'match' | 'sub' | 'ins';
  expected?: string;
}

export interface GradeBreakdown {
  matched: number;
  substituted: number;
  missed: number;       // 'del'
  inserted: number;     // 'ins'
  expectedWordCount: number;
  transcribedWordCount: number;
  accuracyScore: number;        // 0–100, rounded to 1 decimal
  letterGrade: string;
  mispronouncedWords: { expected: string; heard: string; index: number }[];
  skippedWords: { word: string; index: number }[];
  insertedWords: { word: string; index: number }[];
  // Pre-rendered views for the teacher UI: each token in the expected order
  // (or transcribed order) tagged with its alignment op. Saves the client from
  // tokenizing or re-running alignment.
  expectedView: ExpectedTokenView[];
  heardView: HeardTokenView[];
}

export function summarize(pairs: AlignedPair[], expectedLen: number, heardLen: number): GradeBreakdown {
  let matched = 0;
  let substituted = 0;
  let missed = 0;
  let inserted = 0;
  const mispronouncedWords: GradeBreakdown['mispronouncedWords'] = [];
  const skippedWords: GradeBreakdown['skippedWords'] = [];
  const insertedWords: GradeBreakdown['insertedWords'] = [];

  const expectedView: ExpectedTokenView[] = [];
  const heardView: HeardTokenView[] = [];

  for (const p of pairs) {
    if (p.op === 'match') {
      matched++;
      expectedView.push({ word: p.expected!, op: 'match' });
      heardView.push({ word: p.heard!, op: 'match' });
    } else if (p.op === 'sub') {
      substituted++;
      mispronouncedWords.push({ expected: p.expected!, heard: p.heard!, index: p.expectedIndex! });
      expectedView.push({ word: p.expected!, op: 'sub', heard: p.heard });
      heardView.push({ word: p.heard!, op: 'sub', expected: p.expected });
    } else if (p.op === 'del') {
      missed++;
      skippedWords.push({ word: p.expected!, index: p.expectedIndex! });
      expectedView.push({ word: p.expected!, op: 'del' });
    } else {
      inserted++;
      insertedWords.push({ word: p.heard!, index: p.heardIndex! });
      heardView.push({ word: p.heard!, op: 'ins' });
    }
  }

  const accuracy = expectedLen > 0 ? (matched / expectedLen) * 100 : 0;
  return {
    matched,
    substituted,
    missed,
    inserted,
    expectedWordCount: expectedLen,
    transcribedWordCount: heardLen,
    accuracyScore: Math.round(accuracy * 10) / 10,
    letterGrade: letterGradeFor(accuracy),
    mispronouncedWords,
    skippedWords,
    insertedWords,
    expectedView,
    heardView,
  };
}

export function letterGradeFor(accuracyPercent: number): string {
  const a = accuracyPercent;
  if (a >= 98) return 'A+';
  if (a >= 93) return 'A';
  if (a >= 90) return 'A-';
  if (a >= 87) return 'B+';
  if (a >= 83) return 'B';
  if (a >= 80) return 'B-';
  if (a >= 77) return 'C+';
  if (a >= 73) return 'C';
  if (a >= 70) return 'C-';
  if (a >= 60) return 'D';
  return 'F';
}

// Hallucination guard: Whisper sometimes returns transcripts on near-silent
// audio. If the student barely said anything compared to the expected story,
// don't dignify it with a letter grade — the teacher should re-record.
export function isHallucination(expectedLen: number, transcribedLen: number): boolean {
  if (expectedLen === 0) return false;
  return transcribedLen < expectedLen * 0.1;
}

export interface GradeInput {
  storyText: string;
  transcript: string;
  durationSec: number;
}

export interface GradeOutput {
  accuracyScore: number;
  wpmScore: number;
  letterGrade: string | null;
  breakdown: GradeBreakdown;
  hallucinationSuspected: boolean;
}

export function gradeRecording({ storyText, transcript, durationSec }: GradeInput): GradeOutput {
  const expected = tokenize(storyText);
  const heard = tokenize(transcript);
  const pairs = align(expected, heard);
  const breakdown = summarize(pairs, expected.length, heard.length);
  const hallucination = isHallucination(expected.length, heard.length);
  const wpm = durationSec > 0 ? heard.length / (durationSec / 60) : 0;

  return {
    accuracyScore: breakdown.accuracyScore,
    wpmScore: Math.round(wpm * 10) / 10,
    letterGrade: hallucination ? null : breakdown.letterGrade,
    breakdown,
    hallucinationSuspected: hallucination,
  };
}
