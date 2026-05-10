// Manual test harness for Stage 1 of the reading-passage pipeline. Picks 5
// random non-function vocabulary rows at the AF&F level matching the given
// reading level, calls generatePassagePlan, and pretty-prints the result.
//
// Usage:
//   npm run test:plan -- 2          # reading level 2 (Early)
//   npm run test:plan -- 2 garden   # with a seed theme
//   npm run test:plan -- 4 "lost toy"
//
// Re-run a few times per level before wiring later stages so we can sanity
// check 10-20 plans first.

import './_bootstrap-env';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { vocabulary } from '../src/lib/db/schema';
import { generatePassagePlan } from '../src/lib/reading/generate';
import { getReadingLevel } from '../src/lib/reading/levels';

const TARGET_COUNT = 5;

async function main() {
  const args = process.argv.slice(2);
  const levelArg = args[0];
  const seedTheme = args[1];

  const levelId = parseInt(levelArg ?? '', 10);
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > 5) {
    console.error('Usage: npm run test:plan -- <readingLevel 1-5> [seedTheme]');
    process.exit(1);
  }

  const level = getReadingLevel(levelId);
  console.log(
    `Reading level ${level.id} (${level.name}) → AF&F ${level.targetAfFLevel}\n`,
  );

  // Pull every non-function vocab row at this AF&F level. Picking from this
  // pool at random is good enough for spot-checking the planner's behaviour
  // — we'll add curated seed sets later.
  const candidates = await db
    .select({ id: vocabulary.id, word: vocabulary.word, afFUnit: vocabulary.afFUnit })
    .from(vocabulary)
    .where(
      and(
        eq(vocabulary.afFLevel, level.targetAfFLevel),
        eq(vocabulary.isFunctionWord, false),
      ),
    );

  if (candidates.length < TARGET_COUNT) {
    console.error(
      `Only ${candidates.length} non-function words found at AF&F ${level.targetAfFLevel}. ` +
        `Run \`npm run seed:vocab -- --write\` first if the vocabulary table is empty.`,
    );
    process.exit(1);
  }

  // Shuffle + take 5. The targets may span units; the planner derives the
  // cumulative cap from the highest unit among them.
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const targets = shuffled.slice(0, TARGET_COUNT);

  console.log('Target vocab picks:');
  for (const t of targets) {
    console.log(`  ${t.word.padEnd(20)} (unit ${t.afFUnit ?? '?'}) [${t.id}]`);
  }
  if (seedTheme) console.log(`Seed theme: ${seedTheme}`);
  console.log('');

  console.log('Calling generatePassagePlan…');
  const { plan, meta } = await generatePassagePlan({
    readingLevel: level.id,
    targetVocabIds: targets.map((t) => t.id),
    seedTheme,
  });

  console.log('');
  console.log('═══ PLAN ═══════════════════════════════════════════════════');
  console.log(`Title:    ${plan.title}`);
  console.log(`Setting:  ${plan.setting}`);
  console.log(`Summary:  ${plan.summary}`);
  console.log('');
  console.log('Characters:');
  for (const c of plan.characters) {
    console.log(`  • ${c.name}: ${c.description}`);
  }
  console.log('');
  console.log('3-act arc:');
  console.log(`  PROBLEM:    ${plan.structuralPlan.problem}`);
  console.log(`  ATTEMPT:    ${plan.structuralPlan.attempt}`);
  console.log(`  RESOLUTION: ${plan.structuralPlan.resolution}`);
  console.log('');
  console.log(`Pages (${plan.pages.length}):`);
  // Map UUIDs back to words for human-readable output.
  const idToWord = new Map(targets.map((t) => [t.id, t.word]));
  for (const p of plan.pages) {
    console.log(`  Page ${p.pageNumber}:`);
    console.log(`    beat:  ${p.beat}`);
    console.log(`    scene: ${p.sceneDescription}`);
    if (p.targetVocabUsed.length) {
      const words = p.targetVocabUsed.map((id) => idToWord.get(id) ?? `?(${id})`);
      console.log(`    target: ${words.join(', ')}`);
    }
  }
  console.log('');
  console.log('═══ META ═══════════════════════════════════════════════════');
  console.log(`Model:        ${meta.model}`);
  console.log(`Input tokens: ${meta.inputTokens}`);
  console.log(`Output tokens:${meta.outputTokens}`);
  console.log(`Duration:     ${meta.durationMs}ms`);
  console.log('');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
