import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

export type QuestionType = 'fill_blank_mcq' | 'true_false' | 'sentence_builder';

export type GeneratedQuestion = {
  prompt: string;
  correctAnswer: string;
  distractors: string[];
  imagePrompt: string;
  // Per-type extra data. sentence_builder: { tokens: string[] } in canonical order
  // (multi-word phrases like "teddy bear" stay grouped as one token).
  payload?: Record<string, unknown> | null;
};

type UnitCurriculum = {
  unit: number;
  topic: string;
  vocabulary: Array<{ word: string; image?: string }>;
  numbers?: string[];
  prepositions?: string[];
  colors?: string[];
  verbs?: string[];
  adjectives?: string[];
  // Optional — vocab-only stub units (used as cumulative providers) won't have
  // grammar patterns. The generator refuses to run for a unit without patterns.
  grammar_patterns?: Array<{ pattern: string; examples?: string[] }>;
  key_sentences?: string[];
};

// ---------- JSON loader ----------

async function loadUnitJson(unit: number): Promise<UnitCurriculum | null> {
  const jsonPath = path.join(process.cwd(), 'src', 'lib', 'curriculum', `unit-${unit}.json`);
  try {
    const contents = await readFile(jsonPath, 'utf-8');
    return JSON.parse(contents) as UnitCurriculum;
  } catch {
    return null;
  }
}

// Builds a unit spec for question generation that includes vocabulary from
// every prior unit (0..targetUnit-1) the student has studied — spiral curriculum.
// The grammar_patterns and key_sentences come from ONLY the target unit, so
// generated questions still focus on what's currently being taught.
async function loadCumulativeCurriculum(targetUnit: number): Promise<UnitCurriculum | null> {
  const target = await loadUnitJson(targetUnit);
  if (!target) return null;

  const merged: UnitCurriculum = {
    unit: target.unit,
    topic: target.topic,
    vocabulary: [...target.vocabulary],
    numbers: [...(target.numbers ?? [])],
    prepositions: [...(target.prepositions ?? [])],
    colors: [...(target.colors ?? [])],
    verbs: [...(target.verbs ?? [])],
    adjectives: [...(target.adjectives ?? [])],
    grammar_patterns: target.grammar_patterns,
    key_sentences: target.key_sentences,
  };

  for (let i = 0; i < targetUnit; i++) {
    const prior = await loadUnitJson(i);
    if (!prior) continue;
    appendUnique(merged.vocabulary, prior.vocabulary, (v) => v.word.toLowerCase());
    appendUnique(merged.numbers!, prior.numbers ?? [], (s) => s.toLowerCase());
    appendUnique(merged.prepositions!, prior.prepositions ?? [], (s) => s.toLowerCase());
    appendUnique(merged.colors!, prior.colors ?? [], (s) => s.toLowerCase());
    appendUnique(merged.verbs!, prior.verbs ?? [], (s) => s.toLowerCase());
    appendUnique(merged.adjectives!, prior.adjectives ?? [], (s) => s.toLowerCase());
  }

  return merged;
}

function appendUnique<T>(target: T[], source: T[], keyFn: (t: T) => string) {
  const seen = new Set(target.map(keyFn));
  for (const item of source) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    target.push(item);
    seen.add(k);
  }
}

function formatCurriculumText(c: UnitCurriculum): string {
  const lines: string[] = [];
  lines.push(`UNIT ${c.unit} — ${c.topic}`);
  lines.push('');
  lines.push('The vocabulary below is CUMULATIVE — it includes words from this unit and all earlier units the student has studied. You may use any of these words in your questions, but the GRAMMAR PATTERNS section below is what this unit teaches and must drive every question.');
  lines.push('');
  lines.push(`NOUNS (use any of these): ${c.vocabulary.map((v) => v.word).join(', ')}`);
  if (c.numbers?.length) {
    lines.push(`NUMBERS (use any of these): ${c.numbers.join(', ')}`);
  }
  if (c.prepositions?.length) {
    lines.push(`PREPOSITIONS (use any of these): ${c.prepositions.join(', ')}`);
  }
  if (c.colors?.length) {
    lines.push(`COLORS (use any of these): ${c.colors.join(', ')}`);
  }
  if (c.verbs?.length) {
    lines.push(`VERBS (use any of these): ${c.verbs.join(', ')}`);
  }
  if (c.adjectives?.length) {
    lines.push(`ADJECTIVES (use any of these): ${c.adjectives.join(', ')}`);
  }
  lines.push('');
  lines.push('GRAMMAR PATTERNS (the questions MUST teach these — this is the unit\'s focus):');
  for (const gp of c.grammar_patterns ?? []) {
    lines.push(`• ${gp.pattern}`);
    if (gp.examples?.length) {
      const ex = gp.examples.slice(0, 3).map((e) => `"${e}"`).join(' / ');
      lines.push(`    e.g. ${ex}`);
    }
  }
  if (c.key_sentences?.length) {
    lines.push('');
    lines.push('STYLE REFERENCE (match the simplicity of these):');
    for (const s of c.key_sentences) {
      lines.push(`• ${s}`);
    }
  }
  return lines.join('\n');
}

// ---------- Prompts ----------

const MCQ_SYSTEM_PROMPT = `You create fill-in-the-blank multiple-choice questions for Grade 1 ESL students (age 6-7).

You will be given the curriculum specification for one unit as a structured text block. Treat it as the authoritative source for which vocabulary, grammar patterns, and sentence styles this student has studied.

STRICT RULES:
1. Every sentence must use ONLY words, numbers, prepositions, or grammar patterns listed in the provided specification. Never introduce content outside it.
2. Each question is a short sentence with exactly ONE blank written as "____" (four underscores).
3. Each question has exactly one correct answer and exactly three wrong distractors.
4. The correct answer must be UNAMBIGUOUSLY correct given the picture that accompanies the question (described below). The picture is what disambiguates between possible answers — for example, "There is ____ pillow on the bed." with a picture showing one pillow → "a"; with two pillows → "two".
5. Distractors must be real words from the same category as the correct answer and must appear in the provided specification (if the blank is a preposition, distractors are other prepositions; if it's a noun, other nouns from this unit's vocabulary; etc.).
6. Mix blank types: some grammar-focused (e.g. "It's ___ bag." → "my"), some vocabulary-focused (e.g. "It's a ___." → "pen"), some preposition-focused if the unit teaches prepositions, some quantity-focused if numbers are taught.
7. Keep sentences very short (3-7 words), matching the style of the unit's key sentences.
8. Vary the sentences — no two prompts should be identical.

For each question also produce an "imagePrompt": a short, concrete description (1 sentence, ~10-20 words) of a clipart-style scene that shows the answer. The image will be generated by an AI image model and shown above the sentence to the student. Describe quantities, positions, and objects literally so the picture cannot be misread. Examples:
- Question "There is a pillow ____ the bed." (answer "on") → imagePrompt: "A single pillow resting on top of a neatly made bed."
- Question "There are ____ rugs on the floor." (answer "two") → imagePrompt: "Two rectangular rugs lying side by side on a wooden floor."

Return the result as JSON matching the provided schema.`;

const TRUE_FALSE_SYSTEM_PROMPT = `You create true/false picture questions for Grade 1 ESL students (age 6-7).

You will be given the curriculum specification for one unit as a structured text block. Treat it as the authoritative source for which vocabulary, grammar patterns, and sentence styles this student has studied.

STRICT RULES:
1. Every statement must use ONLY words, numbers, prepositions, or grammar patterns listed in the provided specification. Never introduce content outside it.
2. Each question is a SHORT, COMPLETE statement (3-7 words) — no blanks, no underscores. The student decides if the statement is TRUE or FALSE based on the picture.
3. "correctAnswer" must be EXACTLY the lowercase string "true" or "false".
4. Mix true and false roughly evenly across the batch.
5. The picture is what makes the answer unambiguous. The statement and the picture together must have only one correct verdict.
6. Vary the sentences — no two prompts should be identical.
7. Match the simplicity of the unit's key sentences.

For each question also produce an "imagePrompt": a short, concrete description (1 sentence, ~10-20 words) of a clipart-style scene the student looks at. Describe quantities, positions, and objects literally so the picture cannot be misread. Examples:
- Statement "There are three dolls on the rug." (answer "true") → imagePrompt: "Three small dolls sitting in a row on a rectangular rug on a wooden floor."
- Statement "There is a pillow under the bed." (answer "false") → imagePrompt: "A single pillow resting on top of a neatly made bed, nothing under the bed."

Return the result as JSON matching the provided schema.`;

const SENTENCE_BUILDER_SYSTEM_PROMPT = `You create sentence-building exercises for Grade 1 ESL students (age 6-7). The student sees a picture and a shuffled bank of words; they tap the words in order to assemble the target sentence.

You will be given the curriculum specification for one unit as a structured text block. Treat it as the authoritative source for which vocabulary, grammar patterns, and sentence styles this student has studied.

STRICT RULES:
1. Every sentence must use ONLY words, numbers, prepositions, or grammar patterns listed in the provided specification. Never introduce content outside it.
2. Each sentence is short (3-7 word-tokens), matching the simplicity of the unit's key sentences.
3. "correctAnswer" is the canonical sentence with proper capitalization and end punctuation (period, question mark).
4. "tokens" is the array of word-tokens in CANONICAL order, WITHOUT end-of-sentence punctuation. Capitalize the first token. Keep contractions intact ("There's" is one token). Group multi-word noun phrases that the curriculum teaches as a unit (like "teddy bear", "pick up") as ONE token. tokens.join(" ") + end-punctuation must equal correctAnswer.
5. Vary sentences across the batch — different sentence shapes, different vocabulary, different grammar patterns.
6. The picture must make the target sentence unambiguous. The picture shows what's true; the student's job is to put the right words in the right order.

For each question also produce an "imagePrompt": a short, concrete description (1 sentence, ~10-20 words) of a clipart-style scene that matches the target sentence literally. Examples:
- correctAnswer "There's a teddy bear on the bed.", tokens ["There's","a","teddy bear","on","the","bed"] → imagePrompt: "A small brown teddy bear sitting on top of a neatly made bed."
- correctAnswer "Are there four books on the shelf?", tokens ["Are","there","four","books","on","the","shelf"] → imagePrompt: "A wooden shelf with four colorful books standing in a row."

Return the result as JSON matching the provided schema.`;

// ---------- JSON schema ----------

const MCQ_QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          correctAnswer: { type: 'string' },
          distractors: {
            type: 'array',
            items: { type: 'string' },
          },
          imagePrompt: { type: 'string' },
        },
        required: ['prompt', 'correctAnswer', 'distractors', 'imagePrompt'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
} as const;

const TRUE_FALSE_QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          correctAnswer: { type: 'string', enum: ['true', 'false'] },
          imagePrompt: { type: 'string' },
        },
        required: ['prompt', 'correctAnswer', 'imagePrompt'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
} as const;

const SENTENCE_BUILDER_QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          correctAnswer: { type: 'string' },
          tokens: {
            type: 'array',
            items: { type: 'string' },
            minItems: 3,
            maxItems: 12,
          },
          imagePrompt: { type: 'string' },
        },
        required: ['correctAnswer', 'tokens', 'imagePrompt'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
} as const;

function validateMcqShape(raw: unknown): GeneratedQuestion[] {
  if (typeof raw !== 'object' || raw === null) throw new Error('Response is not an object');
  const questions = (raw as { questions?: unknown }).questions;
  if (!Array.isArray(questions)) throw new Error('Missing questions array');

  return questions.filter((q): q is GeneratedQuestion => {
    if (typeof q !== 'object' || q === null) return false;
    const obj = q as Record<string, unknown>;
    return (
      typeof obj.prompt === 'string' &&
      obj.prompt.includes('____') &&
      typeof obj.correctAnswer === 'string' &&
      obj.correctAnswer.length > 0 &&
      Array.isArray(obj.distractors) &&
      obj.distractors.length === 3 &&
      obj.distractors.every((d) => typeof d === 'string' && d.length > 0) &&
      typeof obj.imagePrompt === 'string' &&
      obj.imagePrompt.length > 0
    );
  });
}

// Strip end-of-sentence punctuation and lowercase, for comparing reconstructed
// tokens against the canonical correctAnswer.
function normalizeForBuilder(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,!?;:"]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateSentenceBuilderShape(raw: unknown): GeneratedQuestion[] {
  if (typeof raw !== 'object' || raw === null) throw new Error('Response is not an object');
  const questions = (raw as { questions?: unknown }).questions;
  if (!Array.isArray(questions)) throw new Error('Missing questions array');

  return questions
    .filter((q): q is { correctAnswer: string; tokens: string[]; imagePrompt: string } => {
      if (typeof q !== 'object' || q === null) return false;
      const obj = q as Record<string, unknown>;
      if (typeof obj.correctAnswer !== 'string' || obj.correctAnswer.length === 0) return false;
      if (!Array.isArray(obj.tokens) || obj.tokens.length < 3) return false;
      if (!obj.tokens.every((t) => typeof t === 'string' && t.length > 0)) return false;
      if (typeof obj.imagePrompt !== 'string' || obj.imagePrompt.length === 0) return false;
      // tokens.join(' ') must reconstruct the correctAnswer modulo end punctuation.
      const reconstructed = normalizeForBuilder((obj.tokens as string[]).join(' '));
      const target = normalizeForBuilder(obj.correctAnswer);
      return reconstructed === target;
    })
    .map((q) => ({
      // For sentence_builder, prompt mirrors correctAnswer — it's the canonical
      // sentence stored for teacher review. The session API does NOT return prompt
      // to the student player for this type.
      prompt: q.correctAnswer,
      correctAnswer: q.correctAnswer,
      distractors: [],
      imagePrompt: q.imagePrompt,
      payload: { tokens: q.tokens },
    }));
}

function validateTrueFalseShape(raw: unknown): GeneratedQuestion[] {
  if (typeof raw !== 'object' || raw === null) throw new Error('Response is not an object');
  const questions = (raw as { questions?: unknown }).questions;
  if (!Array.isArray(questions)) throw new Error('Missing questions array');

  return questions
    .filter((q): q is { prompt: string; correctAnswer: string; imagePrompt: string } => {
      if (typeof q !== 'object' || q === null) return false;
      const obj = q as Record<string, unknown>;
      const answer = typeof obj.correctAnswer === 'string' ? obj.correctAnswer.toLowerCase() : '';
      return (
        typeof obj.prompt === 'string' &&
        obj.prompt.length > 0 &&
        !obj.prompt.includes('____') &&
        (answer === 'true' || answer === 'false') &&
        typeof obj.imagePrompt === 'string' &&
        obj.imagePrompt.length > 0
      );
    })
    .map((q) => {
      const answer = q.correctAnswer.toLowerCase();
      return {
        prompt: q.prompt,
        correctAnswer: answer,
        distractors: [answer === 'true' ? 'false' : 'true'],
        imagePrompt: q.imagePrompt,
      };
    });
}

// ---------- Main ----------

export async function generateQuestions(params: {
  unit: number;
  count: number;
  questionType?: QuestionType;
}): Promise<GeneratedQuestion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const questionType: QuestionType = params.questionType ?? 'fill_blank_mcq';

  let systemPrompt: string;
  let schema: typeof MCQ_QUESTION_SCHEMA | typeof TRUE_FALSE_QUESTION_SCHEMA | typeof SENTENCE_BUILDER_QUESTION_SCHEMA;
  let validate: (raw: unknown) => GeneratedQuestion[];
  let userInstruction: string;

  switch (questionType) {
    case 'true_false':
      systemPrompt = TRUE_FALSE_SYSTEM_PROMPT;
      schema = TRUE_FALSE_QUESTION_SCHEMA;
      validate = validateTrueFalseShape;
      userInstruction = `Generate ${params.count} true/false picture statements at Grade 1 ESL difficulty based on the Unit ${params.unit} specification above. Mix true and false roughly evenly.`;
      break;
    case 'sentence_builder':
      systemPrompt = SENTENCE_BUILDER_SYSTEM_PROMPT;
      schema = SENTENCE_BUILDER_QUESTION_SCHEMA;
      validate = validateSentenceBuilderShape;
      userInstruction = `Generate ${params.count} sentence-building exercises at Grade 1 ESL difficulty based on the Unit ${params.unit} specification above. Vary the sentence shapes (statements, questions, imperatives if the unit teaches them).`;
      break;
    default:
      systemPrompt = MCQ_SYSTEM_PROMPT;
      schema = MCQ_QUESTION_SCHEMA;
      validate = validateMcqShape;
      userInstruction = `Generate ${params.count} fill-in-the-blank multiple-choice questions at Grade 1 ESL difficulty based on the Unit ${params.unit} specification above.`;
  }

  const client = new Anthropic({ apiKey });

  const curriculum = await loadCumulativeCurriculum(params.unit);
  if (!curriculum) {
    throw new Error(`No curated curriculum for Unit ${params.unit} — add src/lib/curriculum/unit-${params.unit}.json before generating questions.`);
  }
  if (!curriculum.grammar_patterns?.length) {
    throw new Error(`Unit ${params.unit} has no grammar_patterns yet — add them to src/lib/curriculum/unit-${params.unit}.json before generating questions.`);
  }

  const userContent: Anthropic.ContentBlockParam[] = [
    {
      type: 'text',
      text: formatCurriculumText(curriculum),
      cache_control: { type: 'ephemeral' },
    },
  ];

  userContent.push({
    type: 'text',
    text: userInstruction,
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    thinking: { type: 'disabled' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema },
    },
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userContent }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Model did not return valid JSON');
  }

  return validate(parsed);
}
