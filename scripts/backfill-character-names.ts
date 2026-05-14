// One-off backfill: replace off-list character names in existing
// reading_passages so the AI TTS/STT can pronounce them.
//
// What it does per affected passage:
//   1. Read the stored plan from reading_passages.generation_meta.plan.
//   2. Build a name-substitution map: every off-list character gets a
//      distinct approved replacement, in the order Sally → Emma → Tom → Jake.
//   3. Re-run Stage 2/3 (generateValidatedProse) with the substituted
//      plan. Images, TTS audio, and vocab-pair illustrations are NOT
//      regenerated — the trade-off the teacher accepted.
//   4. UPDATE story_pages.text with the new prose, page-by-page.
//   5. SQL-substitute the same name swaps in reading_questions.questionText,
//      payload options/events, and evidenceQuote, so questions still
//      refer to the renamed characters.
//   6. UPDATE reading_passages.generation_meta.plan to reflect the new
//      names (so the future-self of this script doesn't reprocess them).
//
// Run with:
//   tsx scripts/backfill-character-names.ts            # dry-run
//   tsx scripts/backfill-character-names.ts --apply    # actually write
//
// Needs DATABASE_URL + ANTHROPIC_API_KEY in env.

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  readingPassages,
  readingQuestions,
  storyPages,
  type PassageGenerationMeta,
} from '@/lib/db/schema';
import { generateValidatedProse } from '@/lib/reading/generate/generate-validated-prose';
import {
  APPROVED_CHARACTER_NAMES,
  PROBLEMATIC_CHARACTER_NAMES,
  isProblematicCharacterName,
} from '@/lib/reading/names';
import type { PassagePlan } from '@/lib/reading/generate/types';

const APPLY = process.argv.includes('--apply');

interface AffectedPassage {
  id: string;
  title: string;
  readingLevel: number;
  plan: PassagePlan;
  problematicNames: string[];
}

function findAffected(
  meta: unknown,
): { plan: PassagePlan; problematic: string[] } | null {
  const m = meta as PassageGenerationMeta | null;
  const plan = m?.plan;
  if (!plan || !Array.isArray(plan.characters)) return null;
  const problematic = plan.characters
    .map((c) => c.name)
    .filter((n) => typeof n === 'string' && isProblematicCharacterName(n));
  if (problematic.length === 0) return null;
  return { plan, problematic };
}

/** Decide a replacement for each problematic name. Picks approved names
 *  in order, skipping any that are ALREADY in use by another character
 *  in this passage so we don't accidentally merge two characters into one. */
function buildNameMap(plan: PassagePlan, problematic: string[]): Map<string, string> {
  const existingNames = new Set(
    plan.characters
      .map((c) => c.name)
      .filter((n): n is string => typeof n === 'string')
      .map((n) => n.toLowerCase()),
  );
  const map = new Map<string, string>();
  const candidates = [...APPROVED_CHARACTER_NAMES];

  for (const old of problematic) {
    if (map.has(old)) continue;
    let pick: string | undefined;
    while (candidates.length > 0) {
      const c = candidates.shift()!;
      if (!existingNames.has(c.toLowerCase())) {
        pick = c;
        existingNames.add(c.toLowerCase());
        break;
      }
    }
    if (!pick) {
      throw new Error(
        `Passage has more problematic names than free approved replacements: ${problematic.join(', ')}`,
      );
    }
    map.set(old, pick);
  }
  return map;
}

/** Apply the swap to a string. Whole-word, case-sensitive. JS word
 *  boundaries treat the apostrophe in "Mei's" as a boundary, so this
 *  also handles possessive forms naturally. */
function substituteNames(text: string, map: Map<string, string>): string {
  let out = text;
  for (const [from, to] of map) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(from)}\\b`, 'g'), to);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Deep-substitute a question's payload — different shapes per question
 *  type, all of them ultimately containing strings the character name
 *  might appear in. */
function substituteInPayload(payload: unknown, map: Map<string, string>): unknown {
  if (payload == null || typeof payload !== 'object') return payload;
  const obj = payload as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };
  if (Array.isArray(out.options)) {
    out.options = (out.options as unknown[]).map((o) =>
      typeof o === 'string' ? substituteNames(o, map) : o,
    );
  }
  if (Array.isArray(out.events)) {
    out.events = (out.events as unknown[]).map((e) =>
      typeof e === 'string' ? substituteNames(e, map) : e,
    );
  }
  // vocab_matching pairs use vocabulary words (cat, apple) — character
  // names never live there. Leave pairs alone.
  return out;
}

async function loadAffected(): Promise<AffectedPassage[]> {
  const rows = await db
    .select({
      id: readingPassages.id,
      title: readingPassages.title,
      readingLevel: readingPassages.readingLevel,
      generationMeta: readingPassages.generationMeta,
    })
    .from(readingPassages);

  const affected: AffectedPassage[] = [];
  for (const r of rows) {
    const detect = findAffected(r.generationMeta);
    if (!detect) continue;
    affected.push({
      id: r.id,
      title: r.title,
      readingLevel: r.readingLevel,
      plan: detect.plan,
      problematicNames: detect.problematic,
    });
  }
  return affected;
}

async function backfillOne(p: AffectedPassage): Promise<void> {
  const map = buildNameMap(p.plan, p.problematicNames);
  console.log(
    `\n[${p.id}] "${p.title}" — substituting ${JSON.stringify(Object.fromEntries(map))}`,
  );

  // 1. Rewrite the plan in memory with substituted names. Same character
  //    descriptions, only the name field changes.
  const renamedPlan: PassagePlan = {
    ...p.plan,
    characters: p.plan.characters.map((c) => ({
      ...c,
      name: map.get(c.name) ?? c.name,
      description: substituteNames(c.description, map),
    })),
    title: substituteNames(p.plan.title, map),
    summary: substituteNames(p.plan.summary, map),
    setting: substituteNames(p.plan.setting, map),
    pages: p.plan.pages.map((pg) => ({
      ...pg,
      beat: substituteNames(pg.beat, map),
      sceneDescription: substituteNames(pg.sceneDescription, map),
    })),
    structuralPlan: {
      problem: substituteNames(p.plan.structuralPlan.problem, map),
      attempt: substituteNames(p.plan.structuralPlan.attempt, map),
      resolution: substituteNames(p.plan.structuralPlan.resolution, map),
    },
  };

  // 2. Re-run prose. cumulativeVocabIds default to the plan's targets'
  //    cumulative set (resolved inside generateValidatedProse). No need
  //    to thread overrides — passage was already generated with whatever
  //    the teacher used; defaults are fine for a name-only rewrite.
  console.log(`  regenerating prose…`);
  const proseResult = await generateValidatedProse({
    plan: renamedPlan,
    readingLevelId: p.readingLevel,
    maxAttempts: 3,
  });
  if (!proseResult.success) {
    console.warn(
      `  prose regen did NOT pass validation cleanly (${proseResult.finalValidation.errorCount} errors, ${proseResult.finalValidation.warningCount} warnings). Best attempt will be used anyway since the prior text definitely contained the off-list name.`,
    );
  }
  console.log(`  prose ok — ${proseResult.finalPages.length} pages`);

  if (!APPLY) {
    console.log(`  [DRY RUN] would UPDATE story_pages, reading_questions, generation_meta`);
    return;
  }

  // 3. UPDATE story_pages.text for each page. Use raw SQL so we can express
  //    the composite (passage_id, page_number) WHERE clause directly.
  const { sql } = await import('drizzle-orm');
  for (const page of proseResult.finalPages) {
    await db.execute(sql`
      UPDATE story_pages
      SET text = ${page.text}, updated_at = NOW()
      WHERE passage_id = ${p.id} AND page_number = ${page.pageNumber}
    `);
  }

  // 4. SQL-substitute names in reading_questions. Reuses existing question
  //    text and options — keeps any teacher edits intact, just renames.
  const questionRows = await db
    .select({
      id: readingQuestions.id,
      questionText: readingQuestions.questionText,
      payload: readingQuestions.payload,
      evidenceQuote: readingQuestions.evidenceQuote,
    })
    .from(readingQuestions)
    .where(eq(readingQuestions.passageId, p.id));

  for (const q of questionRows) {
    const newQuestionText = substituteNames(q.questionText, map);
    const newEvidence = q.evidenceQuote
      ? substituteNames(q.evidenceQuote, map)
      : q.evidenceQuote;
    const newPayload = substituteInPayload(q.payload, map);

    const changed =
      newQuestionText !== q.questionText ||
      newEvidence !== q.evidenceQuote ||
      JSON.stringify(newPayload) !== JSON.stringify(q.payload);
    if (!changed) continue;

    await db
      .update(readingQuestions)
      .set({
        questionText: newQuestionText,
        payload: newPayload as Record<string, unknown>,
        evidenceQuote: newEvidence,
        updatedAt: new Date(),
      })
      .where(eq(readingQuestions.id, q.id));
  }

  // 5. UPDATE generation_meta.plan so future runs of this script don't
  //    reprocess this passage.
  await db
    .update(readingPassages)
    .set({
      generationMeta: {
        ...(await db
          .select({ generationMeta: readingPassages.generationMeta })
          .from(readingPassages)
          .where(eq(readingPassages.id, p.id))
          .limit(1)
          .then((rows) => rows[0]?.generationMeta as PassageGenerationMeta | null))!,
        plan: renamedPlan,
      },
      updatedAt: new Date(),
    })
    .where(eq(readingPassages.id, p.id));

  console.log(`  ✓ written`);
}

async function main() {
  console.log(`Backfill character names — ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  const affected = await loadAffected();
  if (affected.length === 0) {
    console.log('Nothing to do — every passage already uses approved character names.');
    return;
  }

  console.log(
    `Found ${affected.length} passage(s) with problematic character names (${PROBLEMATIC_CHARACTER_NAMES.join(', ')}):`,
  );
  for (const p of affected) {
    console.log(
      `  - ${p.id} "${p.title}" — problematic: ${p.problematicNames.join(', ')}`,
    );
  }

  for (const p of affected) {
    try {
      await backfillOne(p);
    } catch (err) {
      console.error(`[${p.id}] FAILED:`, err);
    }
  }

  console.log(`\nDone.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
