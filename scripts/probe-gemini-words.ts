// Per-word reliability probe for the Gemini vocab-image generator.
//
// Calls geminiImageClient.generateImagePanel directly with the same
// prompt template questions.ts uses (single object, white background,
// watercolor). Runs each word N times and reports per-word success
// rate.
//
// Goal: distinguish word-specific failures (some words 0/N, others
// N/N) from random failures (each word ~50%). The retry wrapper is
// intentionally NOT bypassed here — the question we're answering is
// "does Gemini struggle with these words even with retries?", which
// is the same pipeline the failing bulk run uses.
//
// Calls are made SERIALLY to avoid Gemini's concurrent-request rate
// limit confusing the per-word signal.
//
// Usage:
//   npx tsx scripts/probe-gemini-words.ts

import './_bootstrap-env';
import { geminiImageClient } from '../src/lib/image/gemini-client';

interface WordResult {
  word: string;
  cluster: 'fail' | 'success';
  successes: number;
  attempts: number;
  errors: string[];
}

// 5 words that exhausted retries in the most recent bulk run.
const FAIL_CLUSTER = ['draw', 'pencil', 'purple', 'tall', 'game'];
// 5 words that succeeded in the same bulk run (and earlier successful
// runs). All concrete picturable nouns.
const SUCCESS_CLUSTER = ['bag', 'parrot', 'sweater', 'mailman', 'sandcastle'];

const ATTEMPTS_PER_WORD = 5;

function buildVocabImagePrompt(word: string): string {
  return [
    `${word}`,
    'simple kid-friendly illustration',
    'watercolor style',
    'soft pastel colors',
    'single object centered',
    'white background',
    'no text, no letters, no numbers',
    'age 6-10',
  ].join(', ');
}

async function probeWord(word: string, cluster: 'fail' | 'success'): Promise<WordResult> {
  const errors: string[] = [];
  let successes = 0;
  for (let i = 1; i <= ATTEMPTS_PER_WORD; i++) {
    const prompt = buildVocabImagePrompt(word);
    const result = await geminiImageClient.generateImagePanel({
      prompt,
      label: `probe ${word} #${i}`,
    });
    if (result.success) {
      successes++;
    } else {
      errors.push(result.error ?? 'unknown');
    }
  }
  return { word, cluster, successes, attempts: ATTEMPTS_PER_WORD, errors };
}

async function main() {
  if (!geminiImageClient.isConfigured()) {
    console.error('GEMINI_API_KEY not configured. Aborting probe.');
    process.exit(1);
  }
  console.log(
    `Probing ${FAIL_CLUSTER.length + SUCCESS_CLUSTER.length} words × ${ATTEMPTS_PER_WORD} attempts each (${(FAIL_CLUSTER.length + SUCCESS_CLUSTER.length) * ATTEMPTS_PER_WORD} total Gemini calls).`,
  );
  console.log('NOTE: each call already retries up to 3× internally; per-attempt outcomes here reflect "did the retry chain produce an image?".');
  console.log('');

  const results: WordResult[] = [];
  // Interleave fail/success clusters so any quota/rate-limit smoothing
  // applies evenly across both groups.
  const order = [];
  for (let i = 0; i < ATTEMPTS_PER_WORD; i++) {
    // Each "round" hits one word per slot. We collapse to per-word
    // aggregation at the end. Doing it this way avoids the case where
    // Gemini has a 5-minute outage and one cluster eats all the
    // failures by the luck of running first.
  }
  const allWords: { word: string; cluster: 'fail' | 'success' }[] = [
    ...FAIL_CLUSTER.map((w) => ({ word: w, cluster: 'fail' as const })),
    ...SUCCESS_CLUSTER.map((w) => ({ word: w, cluster: 'success' as const })),
  ];

  // Shuffle the per-attempt order across words (round-robin × shuffled
  // each round).
  const tally = new Map<string, WordResult>();
  for (const w of allWords) {
    tally.set(w.word, { word: w.word, cluster: w.cluster, successes: 0, attempts: 0, errors: [] });
  }

  for (let round = 1; round <= ATTEMPTS_PER_WORD; round++) {
    const shuffled = [...allWords].sort(() => Math.random() - 0.5);
    console.log(`── Round ${round}/${ATTEMPTS_PER_WORD} ──`);
    for (const { word } of shuffled) {
      const prompt = buildVocabImagePrompt(word);
      const r = await geminiImageClient.generateImagePanel({
        prompt,
        label: `probe ${word} R${round}`,
      });
      const rec = tally.get(word)!;
      rec.attempts++;
      if (r.success) {
        rec.successes++;
        console.log(`  ✓ ${word.padEnd(11)} (${rec.successes}/${rec.attempts})`);
      } else {
        rec.errors.push(r.error ?? 'unknown');
        console.log(`  ✗ ${word.padEnd(11)} (${rec.successes}/${rec.attempts}) — ${r.error}`);
      }
    }
    console.log('');
  }

  // ---- Per-word table ----
  results.push(...tally.values());
  console.log('═══ PER-WORD SUCCESS TABLE ════════════════════════════════════');
  console.log(`${'word'.padEnd(12)} ${'cluster'.padEnd(8)} success/total  rate`);
  for (const cluster of ['fail', 'success'] as const) {
    for (const r of results.filter((x) => x.cluster === cluster).sort((a, b) => a.word.localeCompare(b.word))) {
      const rate = ((r.successes / r.attempts) * 100).toFixed(0);
      console.log(
        `${r.word.padEnd(12)} ${r.cluster.padEnd(8)} ${String(r.successes).padStart(3)}/${r.attempts}        ${rate.padStart(3)}%`,
      );
    }
  }

  // ---- Cluster aggregates ----
  console.log('');
  console.log('═══ CLUSTER AGGREGATES ════════════════════════════════════════');
  for (const cluster of ['fail', 'success'] as const) {
    const rs = results.filter((x) => x.cluster === cluster);
    const succ = rs.reduce((a, b) => a + b.successes, 0);
    const tot = rs.reduce((a, b) => a + b.attempts, 0);
    const rate = tot > 0 ? ((succ / tot) * 100).toFixed(1) : '—';
    console.log(`${cluster.padEnd(8)} cluster: ${succ}/${tot} (${rate}%)`);
  }

  // ---- Sample of unique error messages per failing word ----
  const erroredWords = results.filter((r) => r.errors.length > 0);
  if (erroredWords.length > 0) {
    console.log('');
    console.log('═══ SAMPLE ERROR MESSAGES (per word, first 2 unique) ══════════');
    for (const r of erroredWords) {
      const uniq = Array.from(new Set(r.errors)).slice(0, 2);
      for (const e of uniq) {
        console.log(`  ${r.word.padEnd(11)} → ${e}`);
      }
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
