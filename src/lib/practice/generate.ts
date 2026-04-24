import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

export type GeneratedQuestion = {
  prompt: string;
  correctAnswer: string;
  distractors: string[];
};

// Unit silo: only this unit's PDF is used. To switch to cumulative "units 1..N",
// read multiple PDFs and include each as a document block.
async function loadUnitPdfBase64(unit: number): Promise<string> {
  const pdfPath = path.join(process.cwd(), 'public', 'pdfs', `ct_unit${unit}.pdf`);
  const buffer = await readFile(pdfPath);
  return buffer.toString('base64');
}

const SYSTEM_PROMPT = `You create fill-in-the-blank multiple-choice questions for Grade 1 ESL students (age 6-7).

The attached PDF is the unit test for this unit. It is the authoritative source for which vocabulary, grammar patterns, and sentence styles this student has studied. Study it before generating.

STRICT RULES:
1. Every sentence must use ONLY vocabulary and grammar that appears in the attached PDF. Never introduce words from other units or outside the PDF.
2. Each question is a short sentence with exactly ONE blank written as "____" (four underscores).
3. Each question has exactly one correct answer and exactly three wrong distractors.
4. The correct answer must be UNAMBIGUOUSLY correct — no other choice can also be grammatical. If in doubt, blank a different word.
5. Distractors must be real words that appear in this unit's PDF (vocabulary items or function words like "a", "my", "is") — never invented words, never words from other units.
6. Mix grammar-focused blanks (e.g. "It's ___ bag." → "my") with vocabulary-focused blanks (e.g. "It's a ___." → "pen").
7. Keep sentences very short (3-6 words) at Grade 1 reading level, matching the style of the sentences in the PDF.
8. Vary the sentences — no two prompts should be identical.

Return the result as JSON matching the provided schema.`;

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

export async function generateQuestions(params: {
  unit: number;
  count: number;
}): Promise<GeneratedQuestion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  let pdfBase64: string;
  try {
    pdfBase64 = await loadUnitPdfBase64(params.unit);
  } catch {
    throw new Error(`No unit test PDF found for Unit ${params.unit}`);
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    thinking: { type: 'disabled' },
    output_config: {
      effort: 'medium',
      format: {
        type: 'json_schema',
        schema: QUESTION_SCHEMA,
      },
    },
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
            // Cache the PDF so repeat generations for the same unit skip the vision-token cost.
            // Default 5-min TTL; bump to {ttl: "1h"} if teachers batch-generate across sessions.
            cache_control: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: `Generate ${params.count} fill-in-the-blank multiple-choice questions at the same difficulty and style as the attached Unit ${params.unit} test.`,
          },
        ],
      },
    ],
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
