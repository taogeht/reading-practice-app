// Multi-word longest-first tokenizer for the prose validator, with a
// lightweight morphology layer for English inflections.
//
// Walks story text and matches against a known-vocabulary list (cumulative
// rows + target rows + plan character names). Multi-word entries like
// "polar bear" or "ice cream" are matched as a unit before single-word
// fallback so the validator doesn't flag the components as separately
// "unknown".
//
// Punctuation is stripped from edges; embedded apostrophes (don't, it's,
// we're) are preserved so contractions stay a single token. Curly quotes
// and curly apostrophes are normalised to ASCII before tokenisation.
// Pure digits are not flagged as unknown — numerals are valid story words.
//
// Morphology fallback (tryMorphologicalMatch): when a single-word token
// fails the direct lookup, a small set of suffix-stripping + irregular
// rules tries to recover its lemma. This is NOT a full lemmatiser — it's
// the ~95% rule set that covers beginner ESL inflection noise (runs,
// watches, cherries, baking, walked, went, children) so the validator's
// remaining "unknown_word" issues reflect genuine vocab gaps.

interface KnownVocab {
  /** Optional vocabulary.id. Function-word and seeded vocab rows have
   *  one; character names added at validate time don't, so the field
   *  is optional. */
  id?: string;
  word: string;
}

export interface TokenMatch {
  /** The matched form, lowercased. For multi-word entries this is the
   *  full phrase (e.g. "polar bear"); for single words / morphology
   *  matches it's the canonical lemma (e.g. "run", not "runs"). */
  word: string;
  /** vocabulary.id when matched against a row that carried one. Match
   *  with no id (e.g. character names) is still "matched" — caller
   *  inspects this for target-coverage tracking only. */
  vocabId?: string;
  /** Set when the match was recovered via the morphology fallback.
   *  Names the rule that fired (e.g. "ing-final-e", "irregular-verb",
   *  "possessive"). Undefined for direct hits. */
  matchedVia?: string;
}

export interface TokenizeResult {
  matched: TokenMatch[];
  /** Lowercased, punctuation-trimmed tokens that didn't match anything in
   *  knownVocab and didn't recover via morphology. One entry per
   *  occurrence (so a repeated unknown word appears multiple times — the
   *  validator dedupes if it wants). */
  unmatched: string[];
  /** The reader's word count for this text — multi-word vocab matches
   *  contribute their full constituent count, not 1. Used by the page
   *  word-count check, which should reflect what a child sees on the page. */
  totalTokens: number;
}

const PUNCTUATION_TRIM = /^[.,?!"'`;:—–\-(){}\[\]…]+|[.,?!"'`;:—–\-(){}\[\]…]+$/g;

function normalize(token: string): string {
  return token.replace(PUNCTUATION_TRIM, '').toLowerCase();
}

/** Curly → ASCII before any tokenisation so contraction handling and the
 *  possessive pre-step both work on a uniform character set. */
function normalizeQuotes(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

// ---------- Morphology helpers ----------

/** Past-tense / past-participle forms whose lemma can't be recovered by
 *  suffix stripping alone. Restricted to the common verbs a beginner
 *  ESL story is likely to reach for. */
const IRREGULAR_VERBS: Record<string, string> = {
  went: 'go', gone: 'go',
  saw: 'see', seen: 'see',
  ran: 'run',
  came: 'come',
  got: 'get', gotten: 'get',
  gave: 'give', given: 'give',
  took: 'take', taken: 'take',
  made: 'make',
  found: 'find',
  said: 'say',
  told: 'tell',
  thought: 'think',
  knew: 'know', known: 'know',
  brought: 'bring',
  bought: 'buy',
  caught: 'catch',
  taught: 'teach',
  fell: 'fall', fallen: 'fall',
  felt: 'feel',
  ate: 'eat', eaten: 'eat',
  drank: 'drink', drunk: 'drink',
  slept: 'sleep',
  swam: 'swim', swum: 'swim',
  wrote: 'write', written: 'write',
  // read / put / hit / cut / let / set are zero-marked in past tense;
  // a direct lookup against the lemma already succeeds, but we list
  // them so the rule still tags them when the surface form is identical.
  read: 'read', put: 'put', hit: 'hit', cut: 'cut', let: 'let', set: 'set',
  sat: 'sit',
  stood: 'stand',
  // Copula and primary auxiliaries — usually function-word matches, but
  // listed as a backup for is_function_word=false rows.
  was: 'be', were: 'be', been: 'be', am: 'be', is: 'be', are: 'be', be: 'be',
  had: 'have', has: 'have', have: 'have',
  did: 'do', done: 'do', does: 'do', do: 'do',
};

/** Plurals whose lemma can't be recovered by stripping -s/-es. */
const IRREGULAR_PLURALS: Record<string, string> = {
  children: 'child',
  men: 'man',
  women: 'woman',
  people: 'person',
  feet: 'foot',
  teeth: 'tooth',
  mice: 'mouse',
  geese: 'goose',
  fish: 'fish',
  sheep: 'sheep',
};

const CONSONANT_RE = /^[bcdfghjklmnpqrstvwxz]$/i;

interface MorphMatch {
  lemma: string;
  vocabId: string | undefined;
  rule: string;
}

/** Try to recover a token's lemma via a small set of regular-morphology
 *  rules. First match wins. A rule "succeeds" only if the candidate
 *  lemma is actually present in vocabByWord — otherwise we keep trying.
 *  Returns null when no rule produces a known lemma. */
export function tryMorphologicalMatch(
  token: string,
  vocabByWord: Map<string, string | undefined>,
): MorphMatch | null {
  const hit = (lemma: string, rule: string): MorphMatch | null =>
    vocabByWord.has(lemma)
      ? { lemma, vocabId: vocabByWord.get(lemma), rule }
      : null;

  // Pre-step: possessives. "Mei's" → try "Mei" before any other rule
  // so proper-noun owners are recovered cleanly.
  if (token.endsWith("'s") && token.length > 2) {
    const r = hit(token.slice(0, -2), 'possessive');
    if (r) return r;
  }

  // Rule 1: irregular verbs.
  if (Object.prototype.hasOwnProperty.call(IRREGULAR_VERBS, token)) {
    const r = hit(IRREGULAR_VERBS[token]!, 'irregular-verb');
    if (r) return r;
  }

  // Rule 2: irregular plurals.
  if (Object.prototype.hasOwnProperty.call(IRREGULAR_PLURALS, token)) {
    const r = hit(IRREGULAR_PLURALS[token]!, 'irregular-plural');
    if (r) return r;
  }

  // Rule 3: -es after sibilant (watches→watch, fixes→fix, kisses→kiss).
  if (token.endsWith('es') && token.length > 2) {
    const stem = token.slice(0, -2);
    if (/(s|x|z|ch|sh)$/.test(stem)) {
      const r = hit(stem, 'sibilant-es');
      if (r) return r;
    }
  }

  // Rule 4: -ies → -y (cherries→cherry, babies→baby).
  if (token.endsWith('ies') && token.length > 3) {
    const r = hit(token.slice(0, -3) + 'y', 'ies-to-y');
    if (r) return r;
  }

  // Rule 5: -ied → -y (tried→try, cried→cry).
  if (token.endsWith('ied') && token.length > 3) {
    const r = hit(token.slice(0, -3) + 'y', 'ied-to-y');
    if (r) return r;
  }

  // Rule 6: doubled-consonant + ing/ed (running→run, stopped→stop).
  // Must run before rule 7-8 so "stopp"+"ing" doesn't get misread as
  // bare "stopp" (which isn't a word).
  if (token.endsWith('ing') && token.length > 4) {
    const stem = token.slice(0, -3);
    const last = stem[stem.length - 1]!;
    const second = stem[stem.length - 2]!;
    if (last === second && CONSONANT_RE.test(last)) {
      const r = hit(stem.slice(0, -1), 'doubled-ing');
      if (r) return r;
    }
  }
  if (token.endsWith('ed') && token.length > 3) {
    const stem = token.slice(0, -2);
    const last = stem[stem.length - 1]!;
    const second = stem[stem.length - 2]!;
    if (last === second && CONSONANT_RE.test(last)) {
      const r = hit(stem.slice(0, -1), 'doubled-ed');
      if (r) return r;
    }
  }

  // Rule 7: -ing with final-e restoration (baking→bake) or bare stem
  // (walking→walk, eating→eat).
  if (token.endsWith('ing') && token.length > 3) {
    const stem = token.slice(0, -3);
    return (
      hit(stem + 'e', 'ing-final-e') ?? hit(stem, 'ing-bare') ?? continueAfterIng(token, vocabByWord)
    );
  }

  // Rule 8: -ed with final-e restoration (baked→bake) or bare stem
  // (walked→walk, looked→look).
  if (token.endsWith('ed') && token.length > 2) {
    const stem = token.slice(0, -2);
    return (
      hit(stem + 'e', 'ed-final-e') ?? hit(stem, 'ed-bare') ?? continueAfterEd(token, vocabByWord)
    );
  }

  // Rule 9: simple -es plural (tomatoes→tomato, potatoes→potato).
  // Most -es cases are handled above; this is the residual.
  if (token.endsWith('es') && token.length > 2) {
    const r = hit(token.slice(0, -2), 'es-bare');
    if (r) return r;
  }

  // Rule 10: -s plural / 3rd-person singular (runs→run, walks→walk).
  if (token.endsWith('s') && token.length > 1) {
    const r = hit(token.slice(0, -1), 's-bare');
    if (r) return r;
  }

  return null;
}

// continueAfterIng / continueAfterEd let rules 7-8 fall through to rules
// 9-10 if neither final-e nor bare-stem matched. Without these, "smashes"
// (which doesn't end in -ing or -ed but DOES end in -es) wouldn't be
// affected — but a token like "stopped" that fails rule 6 (no doubled
// trim because we already tried) would otherwise terminate at rule 8
// without checking the lower-priority rules. Keeps the chain intact.
function continueAfterIng(
  token: string,
  vocab: Map<string, string | undefined>,
): MorphMatch | null {
  if (token.endsWith('s') && token.length > 1) {
    const stem = token.slice(0, -1);
    if (vocab.has(stem)) return { lemma: stem, vocabId: vocab.get(stem), rule: 's-bare' };
  }
  return null;
}

function continueAfterEd(
  token: string,
  vocab: Map<string, string | undefined>,
): MorphMatch | null {
  if (token.endsWith('s') && token.length > 1) {
    const stem = token.slice(0, -1);
    if (vocab.has(stem)) return { lemma: stem, vocabId: vocab.get(stem), rule: 's-bare' };
  }
  return null;
}

// ---------- Main entry point ----------

export function tokenizeStoryText(
  text: string,
  knownVocab: KnownVocab[],
): TokenizeResult {
  const cleanText = normalizeQuotes(text);

  // Split known vocab into single-word index + multi-word list.
  const singleWordMap = new Map<string, string | undefined>();
  const multiWord: { tokens: string[]; vocabId?: string }[] = [];

  for (const v of knownVocab) {
    const key = normalize(v.word.trim());
    if (!key) continue;
    if (key.includes(' ')) {
      multiWord.push({ tokens: key.split(/\s+/), vocabId: v.id });
    } else {
      // First write wins on collision (a target word and a cumulative
      // row sharing the same lemma would land here; keeping the first
      // is fine since they're the same word — we just want any id).
      if (!singleWordMap.has(key)) singleWordMap.set(key, v.id);
    }
  }
  multiWord.sort((a, b) => b.tokens.length - a.tokens.length);

  // Tokenize text. Whitespace-split, then strip edge punctuation. A token
  // that strips to empty (pure punctuation) is dropped.
  const lowerTokens = cleanText
    .split(/\s+/)
    .map(normalize)
    .filter((t) => t.length > 0);

  const matched: TokenMatch[] = [];
  const unmatched: string[] = [];

  let i = 0;
  while (i < lowerTokens.length) {
    let consumed = false;

    // Multi-word match attempt, longest-first.
    for (const mw of multiWord) {
      if (i + mw.tokens.length > lowerTokens.length) continue;
      let allMatch = true;
      for (let k = 0; k < mw.tokens.length; k++) {
        if (lowerTokens[i + k] !== mw.tokens[k]) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        matched.push({ word: mw.tokens.join(' '), vocabId: mw.vocabId });
        i += mw.tokens.length;
        consumed = true;
        break;
      }
    }
    if (consumed) continue;

    const tok = lowerTokens[i]!;
    // Pure digits are valid (e.g. "He has 3 apples.") but don't need a
    // vocab match — skip both buckets so they don't appear as unknown.
    if (/^\d+$/.test(tok)) {
      i++;
      continue;
    }
    if (singleWordMap.has(tok)) {
      matched.push({ word: tok, vocabId: singleWordMap.get(tok) });
    } else {
      const morph = tryMorphologicalMatch(tok, singleWordMap);
      if (morph) {
        matched.push({
          word: morph.lemma,
          vocabId: morph.vocabId,
          matchedVia: morph.rule,
        });
      } else {
        unmatched.push(tok);
      }
    }
    i++;
  }

  return { matched, unmatched, totalTokens: lowerTokens.length };
}

// ---------- Inline self-tests ----------
// Run with: npx tsx src/lib/reading/generate/tokenize.ts
// (Module imports never trigger this — only when invoked as the entry.)

export function runMorphologyTests(): void {
  const fakeVocab: KnownVocab[] = [
    { id: 'v-run', word: 'run' },
    { id: 'v-walk', word: 'walk' },
    { id: 'v-watch', word: 'watch' },
    { id: 'v-cherry', word: 'cherry' },
    { id: 'v-bake', word: 'bake' },
    { id: 'v-stop', word: 'stop' },
    { id: 'v-go', word: 'go' },
    { id: 'v-child', word: 'child' },
    { id: 'v-tomato', word: 'tomato' },
    { id: 'v-mei', word: 'Mei' },
    { id: 'v-cat', word: 'cat' },
  ];

  // Build the same singleWordMap shape tokenizeStoryText would build.
  const map = new Map<string, string | undefined>();
  for (const v of fakeVocab) map.set(v.word.toLowerCase(), v.id);

  type Case = { token: string; expected: { lemma: string; rule: string } | null };
  const cases: Case[] = [
    { token: 'runs', expected: { lemma: 'run', rule: 's-bare' } },
    { token: 'watches', expected: { lemma: 'watch', rule: 'sibilant-es' } },
    { token: 'cherries', expected: { lemma: 'cherry', rule: 'ies-to-y' } },
    { token: 'baking', expected: { lemma: 'bake', rule: 'ing-final-e' } },
    { token: 'walking', expected: { lemma: 'walk', rule: 'ing-bare' } },
    { token: 'went', expected: { lemma: 'go', rule: 'irregular-verb' } },
    { token: 'children', expected: { lemma: 'child', rule: 'irregular-plural' } },
    { token: 'baked', expected: { lemma: 'bake', rule: 'ed-final-e' } },
    { token: 'walked', expected: { lemma: 'walk', rule: 'ed-bare' } },
    { token: 'stopped', expected: { lemma: 'stop', rule: 'doubled-ed' } },
    { token: 'stopping', expected: { lemma: 'stop', rule: 'doubled-ing' } },
    { token: 'tomatoes', expected: { lemma: 'tomato', rule: 'es-bare' } },
    { token: "mei's", expected: { lemma: 'mei', rule: 'possessive' } },
    { token: 'cats', expected: { lemma: 'cat', rule: 's-bare' } },
    { token: 'tray', expected: null },
  ];

  let passed = 0;
  let failed = 0;
  for (const c of cases) {
    const got = tryMorphologicalMatch(c.token, map);
    const ok =
      (c.expected === null && got === null) ||
      (c.expected !== null &&
        got !== null &&
        got.lemma === c.expected.lemma &&
        got.rule === c.expected.rule);
    if (ok) {
      passed++;
      console.log(`  ok    ${c.token.padEnd(12)} → ${got ? `${got.lemma} (${got.rule})` : 'null'}`);
    } else {
      failed++;
      console.log(
        `  FAIL  ${c.token.padEnd(12)} → got ${
          got ? `${got.lemma} (${got.rule})` : 'null'
        }, expected ${
          c.expected ? `${c.expected.lemma} (${c.expected.rule})` : 'null'
        }`,
      );
    }
  }
  console.log(`\n${passed}/${passed + failed} passed`);
  if (failed > 0) process.exit(1);
}

// Auto-run when invoked directly. tsx's main entry resolves to the .ts
// path; comparing against import.meta.url is the canonical guard.
import { fileURLToPath } from 'node:url';
const __isEntry =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (__isEntry) {
  runMorphologyTests();
}
