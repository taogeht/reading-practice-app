// Provider-agnostic image-generation facade. Every callsite imports
// `imageClient` from here; the facade resolves which backend to use from the
// admin-selected `image.generationModel` system setting on each call and
// delegates. Switching providers is a single setting toggle in /admin/settings
// — no redeploy, no per-callsite change.
//
//   gemini          → Google Gemini 2.5 Flash (default)
//   gpt-image-1-mini → OpenAI GPT Image 1 mini, low quality (cheapest)

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { systemSettings } from '@/lib/db/schema';
import type {
  GenerateImagePanelOptions,
  ImageClient,
  ImageGenerationResult,
  ImageProvider,
} from './types';
import { geminiImageClient } from './gemini-client';
import { gptImageClient } from './gpt-image-client';

export type {
  GenerateImagePanelOptions,
  ImageClient,
  ImageGenerationResult,
  ImageProvider,
} from './types';
export { geminiImageClient, PANEL_IMAGE_MODEL } from './gemini-client';
export { gptImageClient } from './gpt-image-client';

export const IMAGE_GENERATION_MODEL_SETTING_KEY = 'image.generationModel';
const DEFAULT_PROVIDER: ImageProvider = 'gemini';

function normalizeProvider(raw: unknown): ImageProvider | null {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v === 'gpt-image-1-mini' || v === 'gpt' || v === 'openai') return 'gpt-image-1-mini';
  if (v === 'gemini') return 'gemini';
  return null;
}

// Short-lived cache so a single batch (e.g. generating images for a whole
// spelling list) does one settings read and stays consistent, while a toggle
// in the admin UI still takes effect within a few seconds.
const CACHE_TTL_MS = 5_000;
let cached: { provider: ImageProvider; at: number } | null = null;

/** Resolve the active provider: system setting → IMAGE_GEN_MODEL env → default. */
export async function getImageProvider(): Promise<ImageProvider> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.provider;

  let provider: ImageProvider | null = null;
  try {
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, IMAGE_GENERATION_MODEL_SETTING_KEY))
      .limit(1);
    provider = normalizeProvider(row?.value);
  } catch (err) {
    // DB unreachable (e.g. build-time) — fall through to env/default.
    console.warn('[imageClient] could not read image.generationModel setting:', err);
  }

  if (!provider) provider = normalizeProvider(process.env.IMAGE_GEN_MODEL);
  if (!provider) provider = DEFAULT_PROVIDER;

  cached = { provider, at: Date.now() };
  return provider;
}

function clientFor(provider: ImageProvider): ImageClient {
  return provider === 'gpt-image-1-mini' ? gptImageClient : geminiImageClient;
}

async function resolveClient(): Promise<ImageClient> {
  return clientFor(await getImageProvider());
}

/**
 * The facade callers use. Same method surface as a single provider, but every
 * method routes to the currently-selected backend. `isConfigured` is async here
 * (unlike the per-provider sync version) because it must resolve the provider
 * first — await it at callsites.
 */
export const imageClient = {
  async isConfigured(): Promise<boolean> {
    return (await resolveClient()).isConfigured();
  },
  async generateImage(word: string): Promise<ImageGenerationResult> {
    return (await resolveClient()).generateImage(word);
  },
  async generateScene(description: string): Promise<ImageGenerationResult> {
    return (await resolveClient()).generateScene(description);
  },
  async generateImagePanel(opts: GenerateImagePanelOptions): Promise<ImageGenerationResult> {
    return (await resolveClient()).generateImagePanel(opts);
  },
};
