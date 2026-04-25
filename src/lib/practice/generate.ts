import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

export type GeneratedQuestion = {
  prompt: string;
  correctAnswer: string;
  distractors: string[];
};

type UnitCurriculum = {
  unit: number;
  topic: string;
  vocabulary: Array<{ word: string; image?: string }>;
  numbers?: string[];
  prepositions?: string[];
  colors?: string[];
  grammar_patterns: Array<{ pattern: string; examples?: string[] }>;
  key_sentences?: string[];
};

// ---------- JSON path (preferred) ----------

async function loadUnitJson(unit: number): Promise<UnitCurriculum | null> {
  const jsonPath = path.join(process.cwd(), 'src', 'lib', 'curriculum', `unit-${unit}.json`);
  try {
    const contents = await readFile(jsonPath, 'utf-8');
    return JSON.parse(contents) as UnitCurriculum;
  } catch {
    return null;
  }
}

function formatCurriculumText(c: UnitCurriculum): string {
  const lines: string[] = [];
  lines.push(`UNIT ${c.unit} — ${c.topic}`);
  lines.push('');
  lines.push(`VOCABULARY (use these nouns only): ${c.vocabulary.map((v) => v.word).join(', ')}`);
  if (c.numbers?.length) {
    lines.push(`NUMBERS (use these only): ${c.numbers.join(', ')}`);
  }
  if (c.prepositions?.length) {
    lines.push(`PREPOSITIONS (use these only): ${c.prepositions.join(', ')}`);
  }
  if (c.colors?.length) {
    lines.push(`COLORS (use these only): ${c.colors.join(', ')}`);
  }
  lines.push('');
  lines.push('GRAMMAR PATTERNS (use these sentence shapes):');
  for (const gp of c.grammar_patterns) {
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

// ---------- PDF path (fallback) ----------

async function loadUnitPdfBase64(unit: number): Promise<string> {
  const pdfPath = path.join(process.cwd(), 'public', 'pdfs', `ct_unit${unit}.pdf`);
  const buffer = await readFile(pdfPath);
  return buffer.toString('base64');
}

// ---------- Prompts ----------

const SYSTEM_PROMPT = `You create fill-in-the-blank multiple-choice questions for Grade 1 ESL students (age 6-7).

You will be given the curriculum specification for one unit, either as a structured text block or as the unit's test PDF. Treat it as the authoritative source for which vocabulary, grammar patterns, and sentence styles this student has studied.

STRICT RULES:
1. Every sentence must use ONLY words, numbers, prepositions, or grammar patterns listed in the provided specification. Never introduce content outside it.
2. Each question is a short sentence with exactly ONE blank written as "____" (four underscores).
3. Each question has exactly one correct answer and exactly three wrong distractors.
4. The correct answer must be UNAMBIGUOUSLY correct — no other choice can also be grammatical. If in doubt, blank a different word.
5. Distractors must be real words from the same category as the correct answer and must appear in the provided specification (if the blank is a preposition, distractors are other prepositions; if it's a noun, other nouns from this unit's vocabulary; etc.).
6. Mix blank types: some grammar-focused (e.g. "It's ___ bag." → "my"), some vocabulary-focused (e.g. "It's a ___." → "pen"), some preposition-focused if the unit teaches prepositions.
7. Keep sentences very short (3-7 words), matching the style of the unit's key sentences.
8. Vary the sentences — no two prompts should be identical.

Return the result as JSON matching the provided schema.`;

// ---------- JSON schema ----------

const QUESTION_SCHEMA = {
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
        },
        required: ['prompt', 'correctAnswer', 'distractors'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
} as const;

function validateShape(raw: unknown): GeneratedQuestion[] {
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
      obj.distractors.every((d) => typeof d === 'string' && d.length > 0)
    );
  });
}

// ---------- Main ----------

export async function generateQuestions(params: {
  unit: number;
  count: number;
}): Promise<GeneratedQuestion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const client = new Anthropic({ apiKey });

  // Prefer curated JSON; fall back to PDF.
  const curriculum = await loadUnitJson(params.unit);
  const userContent: Anthropic.ContentBlockParam[] = [];

  if (curriculum) {
    userContent.push({
      type: 'text',
      text: formatCurriculumText(curriculum),
      cache_control: { type: 'ephemeral' },
    });
  } else {
    let pdfBase64: string;
    try {
      pdfBase64 = await loadUnitPdfBase64(params.unit);
    } catch {
      throw new Error(`No curriculum data for Unit ${params.unit} (no JSON at src/lib/curriculum/unit-${params.unit}.json and no PDF at public/pdfs/ct_unit${params.unit}.pdf)`);
    }
    userContent.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
      cache_control: { type: 'ephemeral' },
    });
  }

  userContent.push({
    type: 'text',
    text: `Generate ${params.count} fill-in-the-blank multiple-choice questions at Grade 1 ESL difficulty based on the Unit ${params.unit} specification above.`,
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    thinking: { type: 'disabled' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: QUESTION_SCHEMA },
    },
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
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

  return validateShape(parsed);
}
