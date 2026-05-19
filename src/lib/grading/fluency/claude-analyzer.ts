// Claude pass: ESL-aware error classification, prosody notes, and a short
// teacher_summary. Runs after the deterministic metrics so its prompt can
// receive them as already-known facts ("pre-computed metrics") rather than
// asking the model to re-derive them.
//
// Graceful degrade: any failure (missing API key, schema mismatch, network
// error) returns null. The caller continues with the deterministic data;
// the row just won't carry Claude-derived fields.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { WhisperWord } from '../whisper-client';
import type { FluencyMetrics } from './compute-metrics';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2000;

// Zod schemas validate the full shape — output_config JSON schema can't
// express constraints like enum-only string fields reliably, so we let the
// model emit any string and reject at parse time.
const ErrorTypeSchema = z.enum(['substitution', 'omission', 'insertion', 'self_correction']);

const ErrorSchema = z.object({
    type: ErrorTypeSchema,
    target_word: z.string(),
    said_word: z.string().nullable(),
    position: z.number().int(),
    is_esl_pattern: z.boolean(),
    note: z.string().optional(),
});

const ProsodySchema = z.object({
    phrasing_notes: z.string(),
    smoothness_notes: z.string(),
    strengths: z.array(z.string()),
    focus_areas: z.array(z.string()),
});

const ClaudeAnalysisSchema = z.object({
    errors: z.array(ErrorSchema),
    prosody: ProsodySchema,
    teacher_summary: z.string(),
});

export interface ClaudeError {
    type: 'substitution' | 'omission' | 'insertion' | 'self_correction';
    targetWord: string;
    saidWord: string | null;
    position: number;
    isEslPattern: boolean;
    note?: string;
}

export interface ClaudeProsody {
    phrasingNotes: string;
    smoothnessNotes: string;
    strengths: string[];
    focusAreas: string[];
}

export interface ClaudeAnalysis {
    errors: ClaudeError[];
    prosody: ClaudeProsody;
    teacherSummary: string;
}

const SYSTEM_PROMPT = `You are an ESL reading fluency analyst. Your student population is Taiwanese children with Mandarin as their first language.

Key principle: For Chinese L1 ESL learners, prosody and phrasing quality are MORE predictive of reading comprehension than reading speed. Do not penalize slow but well-phrased reading. Self-corrections are POSITIVE — they show active monitoring.

You will receive:
1. The target passage text
2. The Whisper transcription (what the student actually said)
3. Pre-computed metrics (WCPM, pause data)

Your job is to classify errors and assess prosody quality. Return ONLY valid JSON matching the schema. Mark errors as is_esl_pattern: true when they reflect common Chinese L1 transfer patterns — final consonant deletion ("tes" for "test"), /l/ vs /r/ confusion, vowel length errors, missing articles (a/the), plural -s omission.`;

function buildUserPrompt(args: {
    passageText: string;
    transcript: string;
    metrics: FluencyMetrics;
}): string {
    const { passageText, transcript, metrics } = args;
    return `TARGET PASSAGE:
${passageText}

STUDENT TRANSCRIPTION:
${transcript}

PRE-COMPUTED METRICS:
- Duration: ${metrics.durationSeconds.toFixed(1)}s
- WCPM: ${metrics.wcpm.toFixed(1)}
- Accuracy: ${metrics.accuracyPct.toFixed(1)}%
- Long pauses: ${metrics.longPauseCount}
- Intrusion pauses (mid-phrase): ${metrics.intrusionPauseCount}
- Pauses at punctuation: ${metrics.pauseAtPunctuationPct.toFixed(1)}%

Classify each deviation from the target passage and assess prosody.

Return this exact JSON shape:
{
  "errors": [
    {
      "type": "substitution" | "omission" | "insertion" | "self_correction",
      "target_word": "...",
      "said_word": "..." | null,
      "position": <word index in passage>,
      "is_esl_pattern": true | false,
      "note": "brief note if relevant"
    }
  ],
  "prosody": {
    "phrasing_notes": "...",
    "smoothness_notes": "...",
    "strengths": ["..."],
    "focus_areas": ["..."]
  },
  "teacher_summary": "..."
}

Constraints: strengths array always has at least 1 entry. focus_areas has 1-2 entries. teacher_summary is 2-3 sentences in plain English.`;
}

// Minimal JSON schema (no minItems/maxItems — output_config rejects those per
// memory: project_anthropic_structured_outputs). Validation happens with zod.
const ANALYSIS_JSON_SCHEMA = {
    type: 'object',
    properties: {
        errors: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    type: { type: 'string' },
                    target_word: { type: 'string' },
                    said_word: { type: ['string', 'null'] },
                    position: { type: 'integer' },
                    is_esl_pattern: { type: 'boolean' },
                    note: { type: 'string' },
                },
                required: ['type', 'target_word', 'said_word', 'position', 'is_esl_pattern'],
                additionalProperties: false,
            },
        },
        prosody: {
            type: 'object',
            properties: {
                phrasing_notes: { type: 'string' },
                smoothness_notes: { type: 'string' },
                strengths: { type: 'array', items: { type: 'string' } },
                focus_areas: { type: 'array', items: { type: 'string' } },
            },
            required: ['phrasing_notes', 'smoothness_notes', 'strengths', 'focus_areas'],
            additionalProperties: false,
        },
        teacher_summary: { type: 'string' },
    },
    required: ['errors', 'prosody', 'teacher_summary'],
    additionalProperties: false,
} as const;

export interface AnalyzeWithClaudeArgs {
    passageText: string;
    transcript: string;
    metrics: FluencyMetrics;
    whisperWords: WhisperWord[];
}

export async function analyzeWithClaude(args: AnalyzeWithClaudeArgs): Promise<ClaudeAnalysis | null> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.warn('[fluency/claude-analyzer] ANTHROPIC_API_KEY not set — skipping Claude pass');
        return null;
    }

    try {
        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            temperature: 0.2,
            thinking: { type: 'disabled' },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            output_config: {
                effort: 'medium',
                format: { type: 'json_schema', schema: ANALYSIS_JSON_SCHEMA },
            } as any,
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [
                {
                    role: 'user',
                    content: [{ type: 'text', text: buildUserPrompt(args) }],
                },
            ],
        });

        const text = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('')
            .trim();

        const parsed = JSON.parse(text);
        const result = ClaudeAnalysisSchema.safeParse(parsed);
        if (!result.success) {
            console.warn(
                '[fluency/claude-analyzer] schema mismatch:',
                result.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
            );
            return null;
        }

        return {
            errors: result.data.errors.map((e) => ({
                type: e.type,
                targetWord: e.target_word,
                saidWord: e.said_word,
                position: e.position,
                isEslPattern: e.is_esl_pattern,
                note: e.note,
            })),
            prosody: {
                phrasingNotes: result.data.prosody.phrasing_notes,
                smoothnessNotes: result.data.prosody.smoothness_notes,
                strengths: result.data.prosody.strengths,
                focusAreas: result.data.prosody.focus_areas,
            },
            teacherSummary: result.data.teacher_summary,
        };
    } catch (error) {
        console.error('[fluency/claude-analyzer] failed:', error instanceof Error ? error.message : error);
        return null;
    }
}
