import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import {
  readingPassages,
  readingQuestions,
  storyPages,
  type PassageGenerationMeta,
} from '@/lib/db/schema';
import { r2Client } from '@/lib/storage/r2-client';
import { textClient } from '@/lib/llm';
import { PANEL_IMAGE_MODEL } from '@/lib/image';
import { logInfo, logError } from '@/lib/logger';
import { generatePassageImages, DEFAULT_IMAGE_STYLE } from './images';
import type { ImageStyle, PassagePlan } from './types';

export interface CustomStoryPageInput {
  pageNumber: number;
  text: string;
  sceneDescription?: string;
}

export interface CustomStoryCharacter {
  name: string;
  description: string;
}

export interface CustomStoryPlanResult {
  title: string;
  summary: string;
  setting: string;
  characters: CustomStoryCharacter[];
  pages: Array<{
    pageNumber: number;
    text: string;
    sceneDescription: string;
  }>;
}

export interface PlanCustomStoryInput {
  pages: string[] | CustomStoryPageInput[];
  title?: string;
  readingLevelId: number;
}

export type CustomPassageProgressEvent =
  | { step: 'planning'; message: string }
  | { step: 'page_image'; pageNumber: number; totalPages: number; message: string }
  | { step: 'uploads'; message: string }
  | { step: 'questions'; message: string }
  | { step: 'saving'; message: string }
  | { step: 'complete'; passageId: string; title: string };

export interface GenerateCustomPassageInput {
  title?: string;
  readingLevelId: number;
  pages: CustomStoryPageInput[];
  characters?: CustomStoryCharacter[];
  setting?: string;
  summary?: string;
  generateQuestions?: boolean;
  style?: ImageStyle;
  onProgress?: (event: CustomPassageProgressEvent) => void;
}

export interface GenerateCustomPassageResult {
  passageId: string;
  title: string;
  status: 'review';
  pageCount: number;
}

const ART_PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Catchy, natural title for the story' },
    summary: { type: 'string', description: '1-2 sentence summary of the story' },
    setting: {
      type: 'string',
      description: 'Concise, visually concrete setting description (e.g. "Sunny backyard garden with wooden fence and green grass")',
    },
    characters: {
      type: 'array',
      description: '1 to 3 main characters. For each, give exact physical appearance details so an image generator renders them identically on every page.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: {
            type: 'string',
            description: 'Specific physical appearance: approximate age, hair style and color, skin tone, signature clothing item and colors (e.g. "a 7-year-old girl with curly black hair in two puffs, wearing a bright yellow raincoat and red rain boots")',
          },
        },
        required: ['name', 'description'],
        additionalProperties: false,
      },
    },
    pageScenes: {
      type: 'array',
      description: 'Art direction for the illustration of each page, in order.',
      items: {
        type: 'object',
        properties: {
          pageNumber: { type: 'integer' },
          sceneDescription: {
            type: 'string',
            description: 'Concrete scene art direction: subjects shown, active posture or action, key props, setting background, explicitly mentioning character outfits for visual consistency.',
          },
        },
        required: ['pageNumber', 'sceneDescription'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'summary', 'setting', 'characters', 'pageScenes'],
  additionalProperties: false,
};

/**
 * Analyzes teacher-supplied story pages and builds a cohesive visual art direction plan
 * with character appearance sheets and per-page scene descriptions.
 */
export async function planCustomStory(input: PlanCustomStoryInput): Promise<CustomStoryPlanResult> {
  const normalizedPages: Array<{ pageNumber: number; text: string }> = input.pages.map((p, idx) => {
    if (typeof p === 'string') {
      return { pageNumber: idx + 1, text: p.trim() };
    }
    return { pageNumber: p.pageNumber || idx + 1, text: p.text.trim() };
  });

  if (normalizedPages.length === 0 || normalizedPages.every((p) => !p.text)) {
    throw new Error('Please provide at least one page with text.');
  }

  const prompt = [
    `You are an expert art director and children's book illustrator planner for ESL learners (Reading Level ${input.readingLevelId}).`,
    `Below is a story supplied page-by-page. Your task is to plan the visual art direction so that an AI image model can generate consistent illustrations across all pages.`,
    input.title?.trim() ? `Story Title: "${input.title.trim()}"` : `No title provided — please invent an appropriate, engaging title.`,
    ``,
    `Story Pages:`,
    ...normalizedPages.map((p) => `[Page ${p.pageNumber}]:\n${p.text}\n`),
    `Requirements:`,
    `1. Identify 1-3 key characters. For EACH character, provide a vivid, concrete description of their age, hair, and signature clothing/colors so the image generator renders them identically in every panel.`,
    `2. Define a unified setting.`,
    `3. For EACH page, write a clear, concrete scene description describing the characters in action, key props, and background.`,
    `Output valid JSON matching the schema.`,
  ].join('\n');

  const response = await textClient.complete({
    system: [
      {
        text: 'You are a children story illustrator art planner. Always output valid JSON strictly following the schema.',
      },
    ],
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 3000,
    effort: 'medium',
    jsonSchema: ART_PLAN_JSON_SCHEMA,
  });

  let parsed: any;
  try {
    parsed = JSON.parse(response.text);
  } catch (err) {
    console.error('[planCustomStory] Model returned non-JSON:', response.text.slice(0, 1000));
    throw new Error('Failed to parse AI story analysis. Please try again.');
  }

  const title = input.title?.trim() || parsed.title || 'Untitled Story';
  const summary = parsed.summary || 'A custom reading story.';
  const setting = parsed.setting || 'A bright, welcoming environment.';
  const characters: CustomStoryCharacter[] = Array.isArray(parsed.characters) && parsed.characters.length > 0
    ? parsed.characters.map((c: any) => ({
        name: String(c.name || 'Character'),
        description: String(c.description || 'A friendly character'),
      }))
    : [{ name: 'Friend', description: 'A smiling 7-year-old child wearing a colorful shirt' }];

  const pageScenesMap = new Map<number, string>();
  if (Array.isArray(parsed.pageScenes)) {
    for (const ps of parsed.pageScenes) {
      if (typeof ps.pageNumber === 'number' && typeof ps.sceneDescription === 'string') {
        pageScenesMap.set(ps.pageNumber, ps.sceneDescription);
      }
    }
  }

  const pages = normalizedPages.map((np) => ({
    pageNumber: np.pageNumber,
    text: np.text,
    sceneDescription:
      pageScenesMap.get(np.pageNumber) ||
      `Illustration showing characters from the story on page ${np.pageNumber}: ${np.text.slice(0, 100)}`,
  }));

  return {
    title,
    summary,
    setting,
    characters,
    pages,
  };
}

const QUESTIONS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    mcqQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          questionText: { type: 'string' },
          options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
          correctIndex: { type: 'integer', minimum: 0, maximum: 3 },
          evidenceQuote: { type: 'string' },
          evidencePageNumber: { type: 'integer' },
        },
        required: ['questionText', 'options', 'correctIndex', 'evidenceQuote', 'evidencePageNumber'],
        additionalProperties: false,
      },
    },
    sequenceQuestion: {
      type: 'object',
      properties: {
        questionText: { type: 'string' },
        events: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 4 },
        correctOrder: { type: 'array', items: { type: 'integer' }, minItems: 3, maxItems: 4 },
      },
      required: ['questionText', 'events', 'correctOrder'],
      additionalProperties: false,
    },
  },
  required: ['mcqQuestions', 'sequenceQuestion'],
  additionalProperties: false,
};

/**
 * Generates 2-3 reading comprehension questions (MCQ + sequence order) for a custom story.
 */
async function generateCustomStoryQuestions(
  pages: Array<{ pageNumber: number; text: string }>,
  readingLevelId: number,
) {
  const prompt = [
    `Create reading comprehension questions for young ESL readers (Reading Level ${readingLevelId}) based on this story:`,
    ...pages.map((p) => `[Page ${p.pageNumber}]: ${p.text}`),
    ``,
    `Requirements:`,
    `1. Provide 2 multiple-choice questions (mcqQuestions). Each has 4 plausible options, a correctIndex (0-3), an exact evidenceQuote from the text, and the evidencePageNumber.`,
    `2. Provide 1 sequence question (sequenceQuestion) asking the student to put 3 or 4 key events from the story in chronological order. "events" is the list of events (in scrambled order), and "correctOrder" is the 0-indexed array representing their correct chronological order (e.g. [2, 0, 1]).`,
  ].join('\n');

  try {
    const response = await textClient.complete({
      system: [{ text: 'You are an ESL reading test designer. Output valid JSON adhering to the schema.' }],
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
      effort: 'low',
      jsonSchema: QUESTIONS_JSON_SCHEMA,
    });
    const parsed = JSON.parse(response.text);
    return parsed;
  } catch (err) {
    console.warn('[generateCustomStoryQuestions] Question generation failed; proceeding without questions:', err);
    return null;
  }
}

/**
 * Main orchestrator to create a complete book from user-supplied story text
 * using the consistent image generation pipeline.
 */
export async function generateCustomPassage(
  input: GenerateCustomPassageInput,
): Promise<GenerateCustomPassageResult> {
  const passageId = randomUUID();
  const startedAt = Date.now();

  logInfo(
    `custom passage generation started`,
    `lib/reading/generate/custom-passage passage_id=${passageId} pages=${input.pages.length}`,
  );

  // 1. Planning / art direction
  input.onProgress?.({
    step: 'planning',
    message: 'Analyzing story characters and planning page illustrations...',
  });

  let planData: CustomStoryPlanResult;
  const needsPlanning =
    !input.characters ||
    input.characters.length === 0 ||
    !input.setting ||
    input.pages.some((p) => !p.sceneDescription);

  if (needsPlanning) {
    planData = await planCustomStory({
      pages: input.pages,
      title: input.title,
      readingLevelId: input.readingLevelId,
    });
  } else {
    planData = {
      title: input.title?.trim() || 'Custom Story',
      summary: input.summary || 'A custom reading story.',
      setting: input.setting || 'A friendly setting.',
      characters: input.characters!,
      pages: input.pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        sceneDescription: p.sceneDescription || `Scene for page ${p.pageNumber}`,
      })),
    };
  }

  // 2. Build PassagePlan and GeneratedPageProse
  const passagePlan: PassagePlan = {
    title: planData.title,
    summary: planData.summary,
    setting: planData.setting,
    characters: planData.characters,
    pages: planData.pages.map((p) => ({
      pageNumber: p.pageNumber,
      beat: p.text.slice(0, 100),
      sceneDescription: p.sceneDescription,
      targetVocabUsed: [],
    })),
    structuralPlan: {
      problem: 'Custom story arc',
      attempt: 'Custom story arc',
      resolution: 'Custom story arc',
    },
  };

  const prosePages = planData.pages.map((p) => ({
    pageNumber: p.pageNumber,
    text: p.text,
  }));

  // 3. Generate page illustrations sequentially with reference image
  input.onProgress?.({
    step: 'page_image',
    pageNumber: 1,
    totalPages: prosePages.length,
    message: 'Generating Page 1 illustration (establishing reference character & style)...',
  });

  const style = input.style || DEFAULT_IMAGE_STYLE;

  const imageResult = await generatePassageImages({
    plan: passagePlan,
    pages: prosePages,
    style,
    onPageGenerated: (pageNumber, totalPages) => {
      if (pageNumber < totalPages) {
        input.onProgress?.({
          step: 'page_image',
          pageNumber: pageNumber + 1,
          totalPages,
          message: `Generating Page ${pageNumber + 1} illustration (maintaining character consistency)...`,
        });
      }
    },
  });

  // 4. Upload images to R2
  input.onProgress?.({
    step: 'uploads',
    message: 'Uploading illustrations to private cloud storage...',
  });

  const imageKeyByPage = new Map<number, string>();
  for (const img of imageResult.pages) {
    const key = r2Client.generateStoryImageKey(passageId, img.pageNumber);
    await r2Client.uploadFile(key, img.buffer, img.mimeType, {
      'passage-id': passageId,
      'page-number': String(img.pageNumber),
    });
    imageKeyByPage.set(img.pageNumber, key);
  }

  // 5. Questions generation (if requested)
  let questionRowsToInsert: Array<{
    passageId: string;
    questionType: 'mcq_comprehension' | 'sequence_order';
    questionText: string;
    orderIndex: number;
    payload: any;
    evidenceQuote: string | null;
    evidencePageNumber: number | null;
  }> = [];

  if (input.generateQuestions !== false) {
    input.onProgress?.({
      step: 'questions',
      message: 'Generating comprehension questions...',
    });

    const questionsData = await generateCustomStoryQuestions(prosePages, input.readingLevelId);
    if (questionsData) {
      let orderIndex = 0;
      if (Array.isArray(questionsData.mcqQuestions)) {
        for (const mcq of questionsData.mcqQuestions) {
          questionRowsToInsert.push({
            passageId,
            questionType: 'mcq_comprehension',
            questionText: mcq.questionText,
            orderIndex: orderIndex++,
            payload: {
              options: mcq.options,
              correctIndex: mcq.correctIndex,
            },
            evidenceQuote: mcq.evidenceQuote || null,
            evidencePageNumber: mcq.evidencePageNumber || null,
          });
        }
      }
      if (questionsData.sequenceQuestion) {
        const sq = questionsData.sequenceQuestion;
        questionRowsToInsert.push({
          passageId,
          questionType: 'sequence_order',
          questionText: sq.questionText,
          orderIndex: orderIndex++,
          payload: {
            events: sq.events,
            correctOrder: sq.correctOrder,
          },
          evidenceQuote: null,
          evidencePageNumber: null,
        });
      }
    }
  }

  // 6. DB transaction
  input.onProgress?.({
    step: 'saving',
    message: 'Saving book to the reading library...',
  });

  const totalDurationMs = Date.now() - startedAt;
  const coverKey = imageKeyByPage.get(1) ?? null;

  await db.transaction(async (tx) => {
    const generationMeta: PassageGenerationMeta = {
      model: `custom-story + ${PANEL_IMAGE_MODEL}`,
      promptVersion: 'reading-passage-custom-v1',
      generatedAt: new Date().toISOString(),
      generationDurationMs: totalDurationMs,
      imageCallCount: imageResult.pages.length,
      qualityReport: {
        proseScore: 1.0,
        questionsScore: questionRowsToInsert.length > 0 ? 1.0 : 0.0,
        imagesValid: true,
        passageReady: true,
      },
      plan: passagePlan,
    };

    // 1. reading_passages row
    await tx.insert(readingPassages).values({
      id: passageId,
      title: planData.title,
      readingLevel: input.readingLevelId,
      targetVocabIds: [],
      pageCount: prosePages.length,
      status: 'review',
      generationMeta,
      summary: planData.summary,
      coverImageKey: coverKey,
      isActive: true,
    });

    // 2. story_pages rows
    const pageRows = prosePages.map((p) => {
      const img = imageResult.pages.find((i) => i.pageNumber === p.pageNumber);
      return {
        passageId,
        pageNumber: p.pageNumber,
        text: p.text,
        imageKey: imageKeyByPage.get(p.pageNumber) ?? null,
        imagePromptUsed: img?.promptUsed ?? null,
        ttsAudioKey: null,
        ttsVoice: null,
      };
    });
    await tx.insert(storyPages).values(pageRows);

    // 3. reading_questions rows
    if (questionRowsToInsert.length > 0) {
      await tx.insert(readingQuestions).values(questionRowsToInsert);
    }
  });

  input.onProgress?.({
    step: 'complete',
    passageId,
    title: planData.title,
  });

  logInfo(
    `custom passage generation completed`,
    `lib/reading/generate/custom-passage passage_id=${passageId} pages=${prosePages.length} questions=${questionRowsToInsert.length} duration_ms=${totalDurationMs}`,
  );

  return {
    passageId,
    title: planData.title,
    status: 'review',
    pageCount: prosePages.length,
  };
}
