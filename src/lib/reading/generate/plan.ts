// Stage 1 of the reading-passage generation pipeline: produce a structured
// PLAN (title, characters, page-by-page beats, scene descriptions, 3-act
// arc) given a reading level and a set of target vocabulary words.
//
// The model is instructed NOT to write prose here — it only outlines what
// will happen on each page. Stage 2 (prose.ts, future) will expand those
// beats into the actual student-facing text using the same vocab + grammar
// constraints surfaced to the planner.
//
// Architecture mirrors src/lib/practice/generate.ts:
//   - Anthropic Sonnet 5 with output_config.format json_schema for a
//     constrained, parse-clean response.
//   - cache_control: ephemeral on the system prompt and the level/cumulative
//     blocks of the user message, so repeated calls at the same level + unit
//     reuse the cache.
//   - Strict zod validation on top of the schema-constrained output, with
//     the raw text logged on parse failure.

import Anthropic from '@anthropic-ai/sdk';
import {
  applyOverridesToLevel,
  getReadingLevel,
  type EffectiveReadingLevel,
} from '@/lib/reading/levels';
import { logInfo } from '@/lib/logger';
import {
  PassagePlanSchema,
  type GenerationCallMeta,
  type GeneratePassagePlanInput,
  type GeneratePassagePlanResult,
  type PassagePlan,
  type ThemeSource,
} from './types';
import {
  DEFAULT_CAST_ID,
  FAMILY_ROLE_NAMES,
  getCast,
  isApprovedCharacterName,
  type CastId,
} from '@/lib/reading/names';
import { getUnitTheme, pickDominantUnit, type UnitTheme } from '@/lib/reading/unit-theme';
import {
  fetchTargetVocab,
  resolveCumulativeVocab,
  type CumulativeRow,
  type TargetRow,
} from './vocab';
import { assertPassagePlanMatchesRequest } from './validate-plan';
// `CumulativeRow` and `TargetRow` are imported even though only used as
// parameter types in the prompt builders below; explicit imports keep the
// reference traceable from this file.

const MODEL = 'claude-sonnet-5';

// Story variety used to come from temperature 0.7 here. Sonnet 5 rejects
// sampling parameters, so variation now has to come from the prompt — the
// cast rotation and unit themes carry that job.

/** Max tokens for the plan response. A 16-page plan with full beat +
 *  scene descriptions empirically lands well under this; headroom prevents
 *  truncation when the model is verbose. */
const MAX_TOKENS = 3000;

// ---------- Prompt structure ----------

const SYSTEM_PROMPT = `You are a curriculum-aligned story PLANNER for ESL students at Macmillan Language School in Kaohsiung, Taiwan, ages 6-10. You design story plans that will later be expanded into full prose by a separate writing pass.

YOU DO NOT WRITE THE PROSE IN THIS STEP. Your job is the structure, characters, page-by-page beats, and scene descriptions only. The prose writer will follow your plan.

GLOBAL RULES (apply to every plan):

CULTURAL CALIBRATION
- The readers are ESL students in Taiwan, but stories are NOT required to be set in Taiwan and should NOT default to it. What matters is that a setting is understandable without cultural background knowledge the student lacks.
- Range is encouraged: home, school, park, beach, farm, market, museum, zoo, campsite, and fully fantastical ones too — forest, space, under the sea, dragon's cave, cloud kingdom.
- Avoid culture-bound references that would need explaining (Halloween costumes, Thanksgiving, baseball innings, school lockers, the tooth fairy) UNLESS the target vocabulary or the story premise explicitly includes them.
- When the user message contains a STORY PREMISE block, follow it — it comes from the class's own textbook unit, so it is what the students are studying right now.

TONE
- Warm, age-appropriate, encouraging.
- A character may have a problem, but it MUST resolve positively by the end. No scary or sad endings, no unresolved conflict, no violence.

STRUCTURE
- 3-act mini-arc: setup → problem → attempt → resolution.
- Every page advances the story by exactly one beat.
- 1 to 3 named characters. Each character description must be concrete enough that an image generator can render the same character consistently across pages — name, approximate age, hair, signature outfit details.

CHARACTER NAMES
- Character names MUST come from the CHARACTER NAMES list supplied in the user message, using the exact casing shown there.
- Do NOT invent other names, do NOT use names from other languages, and do NOT use nicknames or shortened forms (if the list says "Billy", never write "Bill").
- These family words may ALWAYS be used in addition to the list, and do not count toward the character limit: ${FAMILY_ROLE_NAMES.join(', ')}.
- If you need two characters, pick two different names from the list.
- This is a non-negotiable hard rule. Off-list names will cause the generation to be rejected and retried.

FIELD SEMANTICS
- "beat" is a SUMMARY of what happens on the page, not the prose itself. Example beat: "Sally sees the cat run into the night market." NOT: "Sally said, 'Oh, look at the cat!'"
- "sceneDescription" is art direction for the page's image — describe what should appear in the picture concretely (subjects, setting, action, key props), and reference character outfits so the same characters look the same on every page.
- "targetVocabUsed" lists which TARGET VOCABULARY words land on this page. Use the EXACT words from the TARGET VOCABULARY list given in the user message — match case and spelling. Every target word must be introduced on at least one page. A page may have an empty list.

OUTPUT
- JSON only, matching the provided schema.
- No markdown, no commentary outside the JSON.`;

/** JSON Schema given to Anthropic's output_config so the response is shape-
 *  constrained at decode time. Mirrors PassagePlanSchema (zod) — both are
 *  kept because output_config constrains the model and zod gives us a
 *  defense-in-depth parse on the way back. */
const PASSAGE_PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    setting: { type: 'string' },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name', 'description'],
        additionalProperties: false,
      },
    },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pageNumber: { type: 'integer' },
          beat: { type: 'string' },
          sceneDescription: { type: 'string' },
          targetVocabUsed: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['pageNumber', 'beat', 'sceneDescription', 'targetVocabUsed'],
        additionalProperties: false,
      },
    },
    structuralPlan: {
      type: 'object',
      properties: {
        problem: { type: 'string' },
        attempt: { type: 'string' },
        resolution: { type: 'string' },
      },
      required: ['problem', 'attempt', 'resolution'],
      additionalProperties: false,
    },
  },
  required: ['title', 'summary', 'setting', 'characters', 'pages', 'structuralPlan'],
  additionalProperties: false,
} as const;

// DB lookups (fetchTargetVocab, deriveCumulativeVocab, resolveCumulativeVocab)
// now live in ./vocab so Stage 2 (prose) can reuse the exact same logic.

// ---------- Prompt builders ----------

function buildLevelConstraintsBlock(level: EffectiveReadingLevel): string {
  const yn = (b: boolean) => (b ? 'YES' : 'NO');
  const grammar = level.grammarConstraints;
  const vocabLimits = level.vocabConstraints;
  return [
    `READING LEVEL: ${level.id} (${level.name})`,
    '',
    'HARD CONSTRAINTS for this level:',
    `- Page count: ${level.pageCount.min}-${level.pageCount.max} pages`,
    `- Words per page (prose stage target): ${level.wordsPerPage.min}-${level.wordsPerPage.max}`,
    `- Maximum sentence length: ${level.maxSentenceWords} words`,
    `- Average sentence length target: ${level.avgSentenceWords} words`,
    `- Maximum clauses per sentence: ${grammar.maxClausesPerSentence}`,
    `- CEFR ceiling for non-target vocabulary: ${vocabLimits.cumulativeCefrCap}`,
    `- Allowed parts of speech: ${vocabLimits.allowedPartsOfSpeech.join(', ')}`,
    '',
    'GRAMMAR ALLOWED:',
    `- Contractions: ${yn(grammar.allowContractions)}`,
    `- Past tense: ${yn(grammar.allowPastTense)}`,
    `- Future tense: ${yn(grammar.allowFutureTense)}`,
    `- Conditionals: ${yn(grammar.allowConditionals)}`,
    `- Phrasal verbs: ${yn(grammar.allowPhrasalVerbs)}`,
    '',
    `Plan ${level.targetVocabPerStory}-or-so target-word introductions across the pages. Decompose beats so the prose stage can hit these constraints without restructuring — for example, at a ${level.maxSentenceWords}-word sentence cap, plan beats that decompose into short observable actions, not complex compound thoughts.`,
  ].join('\n');
}

function buildCumulativeBlock(cumulative: CumulativeRow[]): string {
  const byPos: Record<string, string[]> = {};
  const fn: string[] = [];
  for (const r of cumulative) {
    if (r.isFunctionWord) {
      fn.push(r.word);
    } else {
      (byPos[r.partOfSpeech] ??= []).push(r.word);
    }
  }
  const lines: string[] = [
    'CUMULATIVE VOCABULARY the student already knows. The prose writer may use these freely, in addition to the target vocabulary.',
    '',
  ];
  // Stable POS ordering for cache-friendliness.
  const order = [
    'noun', 'verb', 'adjective', 'adverb', 'pronoun',
    'preposition', 'conjunction', 'interjection', 'determiner', 'other',
  ];
  for (const pos of order) {
    const list = byPos[pos];
    if (!list?.length) continue;
    lines.push(`${pos.toUpperCase()}: ${list.sort().join(', ')}`);
  }
  if (fn.length) {
    lines.push('');
    lines.push(`FUNCTION WORDS (always available): ${fn.sort().join(', ')}`);
  }
  return lines.join('\n');
}

/** The permitted name list for this generation. Semi-static (one block per
 *  cast), so it carries cache_control alongside the level block. */
function buildCastBlock(castId: CastId | undefined): string {
  const cast = getCast(castId);
  const lines = [
    'CHARACTER NAMES you may use (exact casing):',
    '',
  ];
  for (const m of cast.members) {
    lines.push(`- ${m.name} (${m.role})`);
  }
  lines.push('');
  lines.push(
    `Always also available, not counting toward the character limit: ${FAMILY_ROLE_NAMES.join(', ')}.`,
  );
  return lines.join('\n');
}

/**
 * Story premise. Precedence is deliberate:
 *   custom       — the teacher typed something; it wins outright.
 *   unit_topic   — the class's own textbook unit supplies the premise.
 *   model_choice — no direction; the planner invents one.
 *
 * Under 'unit_topic' the teacher's setting/seedTheme still pass through as
 * secondary hints, so "the museum unit, but make it about a lost shoe" works.
 */
function buildThemeBlock(
  themeSource: ThemeSource,
  unitTheme: UnitTheme | null,
  seedTheme: string | undefined,
  setting: string | undefined,
): string {
  const lines: string[] = ['STORY PREMISE', ''];

  if (themeSource === 'unit_topic' && unitTheme) {
    lines.push(
      `This story is for ${unitTheme.bookTitle}, Unit ${unitTheme.unit}: "${unitTheme.topic}".`,
      'Build the premise around that topic. It is what the class is studying right now, so the story should feel like it belongs to the same lesson.',
      'Interpret the topic imaginatively rather than literally — a unit called "In the museum" can be a mystery, a lost-and-found, or a class trip that goes sideways. Do not simply restate the topic as the plot.',
    );
    if (unitTheme.grammarPatterns.length > 0) {
      lines.push(
        '',
        'The unit drills these sentence frames. Plan beats that naturally invite them; do NOT force every one in:',
        ...unitTheme.grammarPatterns.slice(0, 6).map((g) => `- ${g}`),
      );
    }
  } else if (themeSource === 'model_choice' || (themeSource === 'unit_topic' && !unitTheme)) {
    lines.push(
      'No premise is prescribed. Invent one that suits the target vocabulary.',
      'Vary your choice — do not default to a classroom or a family meal.',
    );
  }

  if (setting) {
    lines.push('', `SETTING (use this specific setting unless impossible): ${setting}`);
  }
  if (seedTheme) {
    lines.push('', `THEME HINT: ${seedTheme}`);
  }

  return lines.join('\n');
}

function buildTargetBlock(targets: TargetRow[]): string {
  const lines: string[] = [
    'TARGET VOCABULARY (introduce ALL of these in the story; multiple words may land on the same page if natural):',
    '',
  ];
  for (const t of targets) {
    const example = t.exampleSentence ? `  e.g. "${t.exampleSentence}"` : '';
    lines.push(`- "${t.word}" (${t.partOfSpeech})${example}`);
  }
  lines.push('');
  lines.push('Plan one passage. Output the JSON now.');
  return lines.join('\n');
}

// ---------- Main entry point ----------

export async function generatePassagePlan(
  input: GeneratePassagePlanInput,
): Promise<GeneratePassagePlanResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  // 1. Validate reading level (throws for unknown id). Then merge in
  //    any teacher overrides so the prompt + downstream stages all
  //    read from one effective config.
  const baseLevel = getReadingLevel(input.readingLevel);
  const level = applyOverridesToLevel(baseLevel, input.overrides);

  // 2. Pull target rows + reject function words / missing IDs.
  const targetRows = await fetchTargetVocab(input.targetVocabIds);

  // 3. Cumulative vocab — explicit override if given, derived from targets otherwise.
  const cumulativeRows = await resolveCumulativeVocab(targetRows, input.cumulativeVocabIds);

  // 4. Build prompt blocks. cache_control on the level + cumulative blocks
  //    so repeated calls at the same (level, vocab cap) reuse the cache.
  // 3b. Resolve the curriculum unit these targets belong to, so the story can
  //     take its premise from the class's actual textbook unit. Null for
  //     starter-level or un-mapped vocabulary — buildThemeBlock degrades to
  //     letting the model choose.
  const castId = input.overrides?.castId ?? DEFAULT_CAST_ID;
  const themeSource: ThemeSource = input.overrides?.themeSource ?? 'unit_topic';
  let unitTheme: UnitTheme | null = null;
  if (themeSource === 'unit_topic') {
    const dominant = pickDominantUnit(targetRows);
    if (dominant) {
      unitTheme = await getUnitTheme(dominant.afFLevel, dominant.afFUnit);
    }
  }

  const levelBlock = buildLevelConstraintsBlock(level);
  const cumulativeBlock = buildCumulativeBlock(cumulativeRows);
  const castBlock = buildCastBlock(castId);
  const themeBlock = buildThemeBlock(
    themeSource,
    unitTheme,
    input.seedTheme ?? input.overrides?.seedTheme,
    input.overrides?.setting,
  );
  const targetBlock = buildTargetBlock(targetRows);

  const userContent: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: levelBlock, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: cumulativeBlock, cache_control: { type: 'ephemeral' } },
    // Cast changes rarely; cached separately from the per-story premise.
    { type: 'text', text: castBlock, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: themeBlock },
    { type: 'text', text: targetBlock },
  ];

  // 5. Call Claude.
  const startedAt = Date.now();
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'disabled' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: PASSAGE_PLAN_JSON_SCHEMA },
    },
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userContent }],
  });
  const durationMs = Date.now() - startedAt;

  // 6. Parse + validate.
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('[generatePassagePlan] non-JSON response (truncated):', text.slice(0, 2000));
    throw new Error('Model did not return valid JSON');
  }

  const result = PassagePlanSchema.safeParse(parsed);
  if (!result.success) {
    console.error(
      '[generatePassagePlan] schema mismatch (truncated):',
      JSON.stringify(parsed).slice(0, 2000),
    );
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new Error(`PassagePlan validation failed: ${issues}`);
  }

  // Approved-name guardrail. The system prompt forbids off-list names, but
  // models occasionally drift on creative tasks; failing fast here lets the
  // orchestrator's retry loop pick the bad run up and re-roll. PassagePlanSchema
  // itself stays permissive so legacy stored plans (which may contain "Mei")
  // still round-trip through it during backfill / read paths.
  const offList = result.data.characters
    .map((c) => c.name)
    .filter((n) => !isApprovedCharacterName(n, castId));
  if (offList.length > 0) {
    throw new Error(
      `PassagePlan validation failed: character names not in the "${castId}" cast: ${offList.join(', ')}. Allowed: ${getCast(castId).members.map((m) => m.name).join(', ')} (plus ${FAMILY_ROLE_NAMES.join(', ')}).`,
    );
  }

  // 7. Map words → vocabulary.id UUIDs in targetVocabUsed. The model is told
  //    to emit exact words from the TARGET VOCABULARY list; we translate to
  //    the canonical UUID identifier so downstream stages don't re-resolve.
  const wordToId = new Map(targetRows.map((r) => [r.word.toLowerCase(), r.id]));
  const plan: PassagePlan = {
    ...result.data,
    pages: result.data.pages.map((page) => ({
      ...page,
      targetVocabUsed: page.targetVocabUsed.map((raw) => {
        const id = wordToId.get(raw.toLowerCase().trim());
        if (!id) {
          throw new Error(
            `Plan referenced an unknown target vocab word: "${raw}". Expected one of: ${[
              ...wordToId.keys(),
            ].join(', ')}`,
          );
        }
        return id;
      }),
    })),
  };

  assertPassagePlanMatchesRequest(plan, {
    pageCount: level.pageCount,
    requiredTargetVocabIds: input.targetVocabIds,
  });

  const meta: GenerationCallMeta = {
    model: MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
  };

  const themeLabel = unitTheme
    ? `${unitTheme.bookSlug} u${unitTheme.unit} "${unitTheme.topic}"`
    : themeSource;
  logInfo(
    `passage plan generated (${plan.pages.length} pages, level ${level.id} ${level.name}, cast ${castId}, theme ${themeLabel})`,
    `lib/reading/generate/plan model=${MODEL} input_tokens=${meta.inputTokens} output_tokens=${meta.outputTokens} duration_ms=${meta.durationMs}`,
  );

  return { plan, meta };
}
