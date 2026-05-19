// Claude pass: ESL-aware error classification, prosody notes, a short
// teacher_summary, and Traditional Mandarin (zh-TW) translations of the
// teacher-facing fields. Runs after the deterministic metrics so its prompt
// receives them as already-known facts ("pre-computed metrics") rather than
// asking the model to re-derive them.
//
// Output is tight by contract: teacher_summary, every strength, and every
// focus area are ONE sentence each. Translations are paired with their
// English source so we can't get array-length mismatches. The whole call
// degrades gracefully — any failure returns null and the row keeps its
// deterministic fields.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { WhisperWord } from '../whisper-client';
import type { FluencyMetrics } from './compute-metrics';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2000;

const ErrorTypeSchema = z.enum(['substitution', 'omission', 'insertion', 'self_correction']);

const ErrorSchema = z.object({
    type: ErrorTypeSchema,
    target_word: z.string(),
    said_word: z.string().nullable(),
    position: z.number().int(),
    is_esl_pattern: z.boolean(),
    note: z.string().optional(),
});

// Each strength / focus area is { en, zh } — paired so we can't drift array
// lengths between the English text and the Mandarin translation.
const BilingualLineSchema = z.object({
    en: z.string(),
    zh: z.string(),
});

const ProsodySchema = z.object({
    phrasing_notes: z.string(),
    phrasing_notes_zh: z.string(),
    smoothness_notes: z.string(),
    smoothness_notes_zh: z.string(),
    strengths: z.array(BilingualLineSchema),
    focus_areas: z.array(BilingualLineSchema),
});

const ClaudeAnalysisSchema = z.object({
    errors: z.array(ErrorSchema),
    prosody: ProsodySchema,
    teacher_summary: z.string(),
    teacher_summary_zh: z.string(),
});

export interface ClaudeError {
    type: 'substitution' | 'omission' | 'insertion' | 'self_correction';
    targetWord: string;
    saidWord: string | null;
    position: number;
    isEslPattern: boolean;
    note?: string;
}

export interface BilingualLine {
    en: string;
    zh: string;
}

export interface ClaudeProsody {
    phrasingNotes: string;
    phrasingNotesZh: string;
    smoothnessNotes: string;
    smoothnessNotesZh: string;
    strengths: BilingualLine[];
    focusAreas: BilingualLine[];
}

export interface ClaudeAnalysis {
    errors: ClaudeError[];
    prosody: ClaudeProsody;
    teacherSummary: string;
    teacherSummaryZh: string;
}

const SYSTEM_PROMPT = `You are an ESL reading fluency analyst. Your student population is Taiwanese children with Mandarin as their first language.

Key principle: For Chinese L1 ESL learners, prosody and phrasing quality are MORE predictive of reading comprehension than reading speed. Do not penalize slow but well-phrased reading. Self-corrections are POSITIVE — they show active monitoring.

You will receive:
1. The target passage text
2. The Whisper transcription (what the student actually said)
3. Pre-computed metrics (WCPM, pause data)

Your job: classify errors, assess prosody, and produce a SHORT, scannable report. Brevity is essential — teachers read these between students. Provide Traditional Mandarin (zh-TW, NOT Simplified) translations for the teacher-facing prose so Taiwanese teachers and parents can read it natively.

Mark errors as is_esl_pattern: true when they reflect common Chinese L1 transfer patterns — final consonant deletion ("tes" for "test"), /l/ vs /r/ confusion, vowel length errors, missing articles (a/the), plural -s omission.`;

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

Return this exact JSON shape. Length limits are STRICT — write more and the panel becomes unreadable.

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
    "phrasing_notes": "...",          // 1-2 sentences observing how the reader grouped phrases
    "phrasing_notes_zh": "...",       // Traditional Mandarin translation of phrasing_notes
    "smoothness_notes": "...",        // 1-2 sentences on flow / hesitations
    "smoothness_notes_zh": "...",     // Traditional Mandarin translation of smoothness_notes
    "strengths": [
      { "en": "...", "zh": "..." }    // each item: ONE sentence English + Traditional Mandarin
    ],
    "focus_areas": [
      { "en": "...", "zh": "..." }    // each item: ONE sentence English + Traditional Mandarin
    ]
  },
  "teacher_summary": "...",           // EXACTLY ONE sentence, English
  "teacher_summary_zh": "..."         // EXACTLY ONE sentence, Traditional Mandarin (zh-TW)
}

CONSTRAINTS:
- teacher_summary: exactly ONE sentence. teacher_summary_zh: exactly ONE sentence in Traditional Mandarin.
- phrasing_notes / smoothness_notes: 1-2 sentences each. Provide a Traditional Mandarin translation for each (phrasing_notes_zh, smoothness_notes_zh).
- strengths: at least 1 entry, each ONE sentence. Pair every English line with a Traditional Mandarin translation.
- focus_areas: 1-2 entries, each ONE sentence. Pair every English line with a Traditional Mandarin translation.
- Use Traditional characters (繁體中文), NOT Simplified (简体中文). The audience is in Taiwan.
- If a sentence runs long, rewrite it shorter rather than splitting into two.`;
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
                phrasing_notes_zh: { type: 'string' },
                smoothness_notes: { type: 'string' },
                smoothness_notes_zh: { type: 'string' },
                strengths: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { en: { type: 'string' }, zh: { type: 'string' } },
                        required: ['en', 'zh'],
                        additionalProperties: false,
                    },
                },
                focus_areas: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { en: { type: 'string' }, zh: { type: 'string' } },
                        required: ['en', 'zh'],
                        additionalProperties: false,
                    },
                },
            },
            required: [
                'phrasing_notes',
                'phrasing_notes_zh',
                'smoothness_notes',
                'smoothness_notes_zh',
                'strengths',
                'focus_areas',
            ],
            additionalProperties: false,
        },
        teacher_summary: { type: 'string' },
        teacher_summary_zh: { type: 'string' },
    },
    required: ['errors', 'prosody', 'teacher_summary', 'teacher_summary_zh'],
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
                phrasingNotesZh: result.data.prosody.phrasing_notes_zh,
                smoothnessNotes: result.data.prosody.smoothness_notes,
                smoothnessNotesZh: result.data.prosody.smoothness_notes_zh,
                strengths: result.data.prosody.strengths,
                focusAreas: result.data.prosody.focus_areas,
            },
            teacherSummary: result.data.teacher_summary,
            teacherSummaryZh: result.data.teacher_summary_zh,
        };
    } catch (error) {
        console.error('[fluency/claude-analyzer] failed:', error instanceof Error ? error.message : error);
        return null;
    }
}
