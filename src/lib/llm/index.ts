// Provider-agnostic text-generation facade. Every callsite imports
// `textClient` from here; the facade resolves which backend to use from the
// admin-selected `text.generationModel` system setting on each call and
// delegates. Switching providers is a single setting toggle in /admin/settings
// — no redeploy, no per-callsite change.
//
//   claude       → Anthropic Claude Sonnet 5 (default)
//   hetzner-qwen → Hetzner Inference API, Qwen (free, experimental)
//
// Structured as a mirror of src/lib/image/index.ts, which does the same job
// for image generation.

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { systemSettings } from '@/lib/db/schema';
import type {
  TextClient,
  TextCompletionRequest,
  TextCompletionResult,
  TextProvider,
} from './types';
import { claudeTextClient } from './claude-client';
import { hetznerTextClient } from './hetzner-client';

export type {
  TextClient,
  TextCompletionRequest,
  TextCompletionResult,
  TextInput,
  TextMessage,
  TextProvider,
  TextSegment,
} from './types';
export { claudeTextClient } from './claude-client';
export { hetznerTextClient } from './hetzner-client';

export const TEXT_GENERATION_MODEL_SETTING_KEY = 'text.generationModel';
const DEFAULT_PROVIDER: TextProvider = 'claude';

function normalizeProvider(raw: unknown): TextProvider | null {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v === 'hetzner-qwen' || v === 'hetzner' || v === 'qwen') return 'hetzner-qwen';
  if (v === 'claude' || v === 'anthropic') return 'claude';
  return null;
}

/**
 * Process-wide pin, for one-shot scripts that must control the provider
 * regardless of what the DB says — the evaluation harness sets this from
 * `--provider` so a comparison run isn't at the mercy of an admin toggle.
 * Not for request-path use.
 */
let override: TextProvider | null = null;

export function setTextProviderOverride(provider: TextProvider | null): void {
  override = provider;
  cached = null;
}

// Short-lived cache so a single batch (e.g. one passage's plan → prose →
// questions) does one settings read and stays consistent, while a toggle in
// the admin UI still takes effect within a few seconds.
const CACHE_TTL_MS = 5_000;
let cached: { provider: TextProvider; at: number } | null = null;

/** Resolve the active provider: override → system setting → LLM_PROVIDER env
 *  → default. */
export async function getTextProvider(): Promise<TextProvider> {
  if (override) return override;
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.provider;

  let provider: TextProvider | null = null;
  try {
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, TEXT_GENERATION_MODEL_SETTING_KEY))
      .limit(1);
    provider = normalizeProvider(row?.value);
  } catch (err) {
    // DB unreachable (e.g. build-time) — fall through to env/default.
    console.warn('[textClient] could not read text.generationModel setting:', err);
  }

  if (!provider) provider = normalizeProvider(process.env.LLM_PROVIDER);
  if (!provider) provider = DEFAULT_PROVIDER;

  cached = { provider, at: Date.now() };
  return provider;
}

function clientFor(provider: TextProvider): TextClient {
  return provider === 'hetzner-qwen' ? hetznerTextClient : claudeTextClient;
}

async function resolveClient(): Promise<TextClient> {
  return clientFor(await getTextProvider());
}

/**
 * The facade callers use. Same method surface as a single provider, but every
 * method routes to the currently-selected backend. `isConfigured` is async
 * here (unlike the per-provider sync version) because it must resolve the
 * provider first — await it at callsites.
 */
export const textClient = {
  async isConfigured(): Promise<boolean> {
    return (await resolveClient()).isConfigured();
  },
  async complete(request: TextCompletionRequest): Promise<TextCompletionResult> {
    return (await resolveClient()).complete(request);
  },
};
