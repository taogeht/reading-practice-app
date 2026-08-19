// Fills in the Traditional Mandarin (zh-Hant) translations in a book's
// spelling.json.
//
// WHY HERE, NOT AT IMPORT: translations belong to the curriculum, not to a
// class. Doing it once at this layer means a human reviews the list once, it
// lands in version control where a bad translation can be corrected by a diff,
// and every class and school reuses it. Translating per import would redo the
// work — and the cost — for every class.
//
// Only untranslated words are sent, so a re-run after adding a unit costs just
// the new words. Existing translations are never overwritten (pass --force to
// redo them all).
//
// Goes through the src/lib/llm facade, so --provider picks the model.
//
// Usage:
//   npm run translate:spelling -- --book=family-friends-2
//   npm run translate:spelling -- --book=family-friends-2 --write
//   npm run translate:spelling -- --book=family-friends-2 --provider=hetzner-qwen --write

import './_bootstrap-env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setTextProviderOverride, textClient, type TextProvider } from '../src/lib/llm';

const ARGS = process.argv.slice(2);
const WRITE = ARGS.includes('--write');
const FORCE = ARGS.includes('--force');

function arg(name: string): string | undefined {
  return ARGS.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

interface SpellingWordEntry { word: string; zh: string | null }
interface SpellingTest { index: number; focus: string; words: SpellingWordEntry[] }
interface SpellingUnit { unit: number; title: string; topic: string; tests: SpellingTest[] }
interface SpellingCurriculum { bookSlug: string; units: SpellingUnit[] }

const SYSTEM_PROMPT = [
  'You translate single English words into Traditional Chinese (zh-Hant) for',
  'young ESL learners in Taiwan.',
  '',
  'Rules:',
  '- Traditional characters only. Never Simplified.',
  '- Give the plain everyday word a Taiwanese primary-school child would use.',
  '- One translation per word. No pinyin, no romanisation, no explanation.',
  '- Translate the concrete sense a child means: "bat" the animal, "orange"',
  '  the fruit, "spring" the season.',
  '- Return every word you were given, exactly as it was spelled.',
].join('\n');

// Deliberately minimal: the Anthropic API rejects minItems/maxItems, and we
// re-validate the shape below anyway.
const TRANSLATION_SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { word: { type: 'string' }, zh: { type: 'string' } },
        required: ['word', 'zh'],
        additionalProperties: false,
      },
    },
  },
  required: ['translations'],
  additionalProperties: false,
} as const;

async function main(): Promise<void> {
  const bookSlug = arg('book');
  if (!bookSlug) throw new Error('--book=<slug> is required.');

  const provider = arg('provider');
  if (provider && provider !== 'claude' && provider !== 'hetzner-qwen') {
    throw new Error("--provider must be 'claude' or 'hetzner-qwen'.");
  }
  setTextProviderOverride((provider as TextProvider | undefined) ?? null);

  const filePath = path.resolve(process.cwd(), 'src/lib/curriculum', bookSlug, 'spelling.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`No spelling.json for "${bookSlug}". Run convert:spelling first.`);
  }
  const curriculum = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SpellingCurriculum;

  const allEntries = curriculum.units.flatMap((u) => u.tests.flatMap((t) => t.words));
  const pending = [...new Set(allEntries.filter((w) => FORCE || !w.zh).map((w) => w.word))].sort();

  console.log(`Book: ${bookSlug}`);
  console.log(`Words: ${allEntries.length} slots, ${new Set(allEntries.map((w) => w.word)).size} unique`);
  console.log(`Needing translation: ${pending.length}${FORCE ? ' (--force: redoing all)' : ''}`);
  if (pending.length === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }
  if (!WRITE) {
    console.log(`\n[dry-run] Would translate ${pending.length} word(s) with one provider call.`);
    console.log('Re-run with --write to apply.');
    process.exit(0);
  }

  console.log('\nCalling the text provider…');
  const response = await textClient.complete({
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Translate these ${pending.length} words:\n${pending.join('\n')}` }],
    // ~15 tokens per word plus JSON overhead, with headroom.
    maxTokens: Math.max(2000, pending.length * 25),
    jsonSchema: TRANSLATION_SCHEMA as unknown as Record<string, unknown>,
  });
  console.log(`  model=${response.model} in=${response.inputTokens} out=${response.outputTokens}`);

  const parsed = JSON.parse(response.text) as { translations?: { word: string; zh: string }[] };
  if (!Array.isArray(parsed.translations)) {
    throw new Error('Provider reply had no translations array.');
  }
  const byWord = new Map(parsed.translations.map((t) => [t.word.toLowerCase().trim(), t.zh.trim()]));

  const missing = pending.filter((w) => !byWord.get(w));
  if (missing.length > 0) {
    // Partial results are still worth keeping — report the gap and let a
    // re-run pick up only what is still missing.
    console.warn(`  ${missing.length} word(s) came back untranslated: ${missing.slice(0, 12).join(', ')}`);
  }

  let applied = 0;
  for (const entry of allEntries) {
    if (!FORCE && entry.zh) continue;
    const zh = byWord.get(entry.word.toLowerCase());
    if (zh) { entry.zh = zh; applied++; }
  }

  fs.writeFileSync(filePath, `${JSON.stringify(curriculum, null, 2)}\n`);
  console.log(`\nApplied ${applied} translation(s) across ${allEntries.length} slots.`);
  console.log(`Wrote ${filePath}`);
  console.log('Review the diff before importing — this is the file every class will reuse.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
