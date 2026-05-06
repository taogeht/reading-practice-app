import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { GeneratedQuestion } from './generate';

// Phonics question generation — fully deterministic, no LLM. The unit JSON's
// `phonics` block is already structured (sound + word_families[] + chant), so
// we can compose questions directly from it. Three kinds today:
//
//   rhyme  — "Which word rhymes with [pig]?" → choices from rhyming family vs others
//   sound  — "Which word has the short i sound?" → choices from this unit vs other units
//   listen — "Listen and choose the word."     → audio prompt, choices are the unit's words
//
// The student renderer plays audio for `listen` via Web Speech API (no audio
// files to host). For `rhyme` and `sound` the existing image-generation
// background job (Nano Banana / Gemini) renders an emoji-style picture from
// the prompt we set on each question.

export type PhonicsKind = 'rhyme' | 'sound' | 'listen';
export type PhonicsKindOrMixed = PhonicsKind | 'mixed';

interface PhonicsWord {
  word: string;
  emoji?: string;
  image?: string;
}
interface PhonicsFamily {
  family: string;
  words: PhonicsWord[];
}
interface PhonicsBlock {
  sound: string;
  description?: string;
  word_families: PhonicsFamily[];
  chant?: string[];
}
interface UnitWithPhonics {
  unit: number;
  bookSlug: string;
  phonics: PhonicsBlock;
}

const CURRICULUM_DIR = path.join(process.cwd(), 'src', 'lib', 'curriculum');

// Loads every unit JSON in the given book directory that has a `phonics`
// block. Used as the candidate pool for cross-unit "sound" question
// distractors (so a short-i question's wrong answers are pulled from
// short-o or short-u units, not from the same family).
async function loadAllPhonics(bookSlug: string): Promise<UnitWithPhonics[]> {
  const dir = path.join(CURRICULUM_DIR, bookSlug);
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: UnitWithPhonics[] = [];
  for (const name of entries) {
    const m = name.match(/^unit-(\d+)\.json$/);
    if (!m) continue;
    const unitNum = parseInt(m[1], 10);
    try {
      const contents = await readFile(path.join(dir, name), 'utf-8');
      const json = JSON.parse(contents) as { phonics?: PhonicsBlock };
      if (json.phonics) out.push({ unit: unitNum, bookSlug, phonics: json.phonics });
    } catch {
      // skip malformed
    }
  }
  return out;
}

// Fisher–Yates shuffle. Deterministic-looking seedable shuffle isn't worth
// the complexity here; teachers regenerate when they want a different mix.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickN<T>(pool: T[], n: number): T[] {
  return shuffle(pool).slice(0, n);
}

// Lower-case dedupe for distractor selection — we don't want the correct
// answer's word to also appear as a distractor in a different case.
function uniqueByWord<T extends { word: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = it.word.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function buildImagePrompt(word: PhonicsWord): string {
  // Friendly, simple visual prompts that work well with Gemini's image model.
  // For abstract words (in, fun, hot, big) Gemini still produces something
  // reasonable — usually a kid-friendly scene. The emoji on the JSON is the
  // immediate fallback before the image arrives.
  return `A simple, friendly children's-book cartoon illustration of "${word.word}". Bright colors, clear outlines, white background. Suitable for early-reading kindergarten students.`;
}

// ----- Question builders, one per kind ------------------------------------

function buildRhymeQuestion(unit: UnitWithPhonics): GeneratedQuestion | null {
  const families = unit.phonics.word_families;
  if (families.length < 2) return null;
  // Need at least one family with 2+ words (so we have a target + a rhyming
  // correct answer) and a separate family with at least 2 words for distractors.
  const eligibleTargets = families.filter((f) => f.words.length >= 2);
  if (eligibleTargets.length === 0) return null;
  const targetFamily = pickN(eligibleTargets, 1)[0];
  const [target, correct] = pickN(targetFamily.words, 2);

  const distractorPool = uniqueByWord(
    families
      .filter((f) => f.family !== targetFamily.family)
      .flatMap((f) => f.words),
  ).filter((w) => w.word.toLowerCase() !== correct.word.toLowerCase());
  if (distractorPool.length < 2) return null;
  const distractors = pickN(distractorPool, 3).slice(0, 3);

  return {
    prompt: `Which word rhymes with "${target.word}"?`,
    correctAnswer: correct.word,
    distractors: distractors.map((d) => d.word),
    imagePrompt: buildImagePrompt(target),
    payload: {
      kind: 'rhyme',
      sound: unit.phonics.sound,
      target: target.word,
      targetEmoji: target.emoji ?? null,
      family: targetFamily.family,
    },
  };
}

function buildSoundQuestion(
  unit: UnitWithPhonics,
  others: UnitWithPhonics[],
): GeneratedQuestion | null {
  const ownPool = uniqueByWord(unit.phonics.word_families.flatMap((f) => f.words));
  if (ownPool.length === 0) return null;

  // Distractors come from units with a *different* sound. Falls back to
  // same-unit different-family if no other units have phonics yet.
  const otherPool = uniqueByWord(
    others
      .filter((u) => u.unit !== unit.unit && u.phonics.sound !== unit.phonics.sound)
      .flatMap((u) => u.phonics.word_families.flatMap((f) => f.words)),
  );
  const distractorPool = otherPool.length > 0 ? otherPool : ownPool;

  const correct = pickN(ownPool, 1)[0];
  const distractors = pickN(
    distractorPool.filter((w) => w.word.toLowerCase() !== correct.word.toLowerCase()),
    3,
  ).slice(0, 3);
  if (distractors.length < 2) return null;

  return {
    prompt: `Which word has the ${unit.phonics.sound} sound?`,
    correctAnswer: correct.word,
    distractors: distractors.map((d) => d.word),
    imagePrompt: buildImagePrompt(correct),
    payload: {
      kind: 'sound',
      sound: unit.phonics.sound,
      correctEmoji: correct.emoji ?? null,
    },
  };
}

function buildListenQuestion(unit: UnitWithPhonics): GeneratedQuestion | null {
  const pool = uniqueByWord(unit.phonics.word_families.flatMap((f) => f.words));
  if (pool.length < 3) return null;
  const correct = pickN(pool, 1)[0];
  // Mix family-mate and cross-family distractors to keep the listen task
  // genuinely about hearing the difference, not just rhyme-matching.
  const distractors = pickN(
    pool.filter((w) => w.word.toLowerCase() !== correct.word.toLowerCase()),
    3,
  ).slice(0, 3);
  if (distractors.length < 2) return null;

  return {
    // The student renderer hides this prompt behind a Play button, so the
    // text just describes the activity for screen readers / fallback.
    prompt: 'Listen and choose the word.',
    correctAnswer: correct.word,
    distractors: distractors.map((d) => d.word),
    // No image for listen kind — the audio is the prompt. Sending an empty
    // string skips the background image-gen pass.
    imagePrompt: '',
    payload: {
      kind: 'listen',
      audioWord: correct.word,
      sound: unit.phonics.sound,
    },
  };
}

// Round-robin across requested kinds for a "mixed" batch, otherwise build all
// items as the chosen single kind. Skips builders that return null (not enough
// data) and tries the next kind so we don't fall short of `count`.
export async function generatePhonicsQuestions(params: {
  bookSlug: string;
  unit: number;
  count: number;
  kind?: PhonicsKindOrMixed;
}): Promise<GeneratedQuestion[]> {
  const all = await loadAllPhonics(params.bookSlug);
  const target = all.find((u) => u.unit === params.unit);
  if (!target) {
    throw new Error(
      `No phonics block in ${params.bookSlug}/unit-${params.unit}.json — add a "phonics" field before generating.`,
    );
  }

  const kindOrder: PhonicsKind[] =
    params.kind && params.kind !== 'mixed'
      ? [params.kind]
      : ['rhyme', 'listen', 'sound']; // round-robin order for mixed

  const builders: Record<PhonicsKind, () => GeneratedQuestion | null> = {
    rhyme: () => buildRhymeQuestion(target),
    sound: () => buildSoundQuestion(target, all),
    listen: () => buildListenQuestion(target),
  };

  const out: GeneratedQuestion[] = [];
  // Try up to count*4 attempts to hit the requested count, since each builder
  // can return null on bad luck of the shuffle (e.g., only 2 distractors found).
  let attempts = 0;
  let kindIdx = 0;
  while (out.length < params.count && attempts < params.count * 6) {
    const kind = kindOrder[kindIdx % kindOrder.length];
    const q = builders[kind]();
    if (q) out.push(q);
    kindIdx += 1;
    attempts += 1;
  }
  return out;
}
