// Hetzner Experiments Platform Inference API backend for the TextClient
// contract. OpenAI-compatible chat completions over raw fetch — no `openai`
// SDK, matching whisper-client.ts and image/gpt-image-client.ts.
//
// Reached through the facade in ./index — don't import this directly from
// feature code.
//
// Three things this backend has to handle that the Claude one doesn't:
//
//   1. Rate limits. The published ceiling is 10 requests / 60s per key. One
//      passage costs ~5 calls (plan + up to 3 prose regens + questions), so
//      anything batchy will 429 without pacing. We self-throttle to a minimum
//      spacing and honour Retry-After.
//   2. Structured output is undocumented. We attempt native `response_format`
//      and, if the endpoint rejects it, fall back to instructing the schema in
//      the prompt — remembered process-wide so we only pay the probe once.
//      Safe either way: every caller re-validates with zod.
//   3. Qwen3 thinking mode is ON by default, and this deployment returns the
//      reasoning in its own `reasoning` field rather than as inline <think>
//      tags. Left alone it consumes the whole token budget and comes back with
//      content: null and finish_reason: "length" — verified against the live
//      API. We disable it per-request via chat_template_kwargs.

import {
  type TextClient,
  type TextCompletionRequest,
  type TextCompletionResult,
  flattenInput,
} from './types';

const ENDPOINT = 'https://inference.hetzner.com/api/v1/chat/completions';

/** Overridable so a new model from /v1/models can be tried without a deploy.
 *  The docs' own table is inconsistent about the `Qwen/` prefix, and they say
 *  the /v1/models response is definitive — set this from that response. */
const DEFAULT_MODEL = 'Qwen/Qwen3.6-35B-A3B-FP8';

const ATTEMPT_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [2_000, 8_000];

// 10 requests / 60s => 6s apart. Kept slightly above that to absorb clock skew
// and any concurrent caller in the same process.
const MIN_REQUEST_SPACING_MS = 6_500;

export class HetznerInferenceError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'HetznerInferenceError';
  }
}

/** Serialises every request through one promise chain so concurrent callers
 *  queue instead of bursting past the per-key rate limit. */
let gate: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function throttle<T>(run: () => Promise<T>): Promise<T> {
  const result = gate.then(async () => {
    const wait = MIN_REQUEST_SPACING_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return run();
  });
  // Keep the chain alive regardless of this call's outcome.
  gate = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** null = not yet probed. Set on first schema-bearing request. */
let supportsResponseFormat: boolean | null = null;

/** Defence in depth. This deployment returns reasoning in its own field, so
 *  with enable_thinking off there is normally nothing to strip — but a model
 *  that inlines the tags would otherwise break every structured call. */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function schemaInstruction(schema: Record<string, unknown>): string {
  return [
    'Reply with JSON only — no prose, no markdown fences, no explanation.',
    'The JSON must conform exactly to this JSON Schema:',
    JSON.stringify(schema),
  ].join('\n');
}

interface ChatCompletionResponse {
  model?: string;
  choices?: {
    finish_reason?: string;
    /** `content` is null when the model produced only reasoning. */
    message?: { content?: string | null; reasoning?: string | null };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function postOnce(body: unknown, apiKey: string): Promise<Response> {
  return fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
  });
}

class HetznerTextClient implements TextClient {
  isConfigured(): boolean {
    return Boolean(process.env.HETZNER_INFERENCE_TOKEN);
  }

  async complete(request: TextCompletionRequest): Promise<TextCompletionResult> {
    const apiKey = process.env.HETZNER_INFERENCE_TOKEN;
    if (!apiKey) throw new HetznerInferenceError('HETZNER_INFERENCE_TOKEN is not set');
    const model = process.env.HETZNER_INFERENCE_MODEL || DEFAULT_MODEL;

    // Prompt spans collapse to plain strings: there is no prompt-cache concept
    // here, so `cacheable` is simply ignored.
    const buildMessages = (injectSchema: boolean) => {
      const system = [
        flattenInput(request.system),
        injectSchema && request.jsonSchema ? schemaInstruction(request.jsonSchema) : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      return [
        { role: 'system' as const, content: system },
        ...request.messages.map((message) => ({
          role: message.role,
          content: flattenInput(message.content),
        })),
      ];
    };

    const send = async (useResponseFormat: boolean): Promise<Response> => {
      const body: Record<string, unknown> = {
        model,
        max_tokens: request.maxTokens,
        messages: buildMessages(!useResponseFormat),
        // Mandatory. Qwen3 reasons by default and would spend the entire
        // budget doing it, returning no content at all.
        chat_template_kwargs: { enable_thinking: false },
      };
      if (useResponseFormat && request.jsonSchema) {
        body.response_format = {
          type: 'json_schema',
          json_schema: { name: 'response', schema: request.jsonSchema, strict: true },
        };
      }
      return throttle(() => postOnce(body, apiKey));
    };

    let res: Response | null = null;
    let lastError: HetznerInferenceError | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Only try native schema enforcement while we still believe it works.
      const tryNative = Boolean(request.jsonSchema) && supportsResponseFormat !== false;

      try {
        res = await send(tryNative);
      } catch (err) {
        lastError = new HetznerInferenceError(
          `Hetzner request failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        res = null;
      }

      if (res) {
        if (res.ok) {
          // A schema request that succeeded natively confirms support.
          if (tryNative) supportsResponseFormat = true;
          break;
        }

        const errBody = await res.text().catch(() => '');

        // The endpoint doesn't advertise response_format support. If that's
        // what it objected to, record it and immediately retry the same
        // attempt with the schema moved into the prompt.
        if (tryNative && res.status === 400 && /response_format|json_schema/i.test(errBody)) {
          console.warn(
            '[llm/hetzner] response_format rejected — falling back to prompt-instructed JSON for the rest of this process.',
          );
          supportsResponseFormat = false;
          res = null;
          attempt -= 1; // this probe shouldn't consume a retry
          continue;
        }

        lastError = new HetznerInferenceError(
          `Hetzner request failed with ${res.status}: ${errBody.slice(0, 500)}`,
          res.status,
        );

        // 429 carries a Retry-After we should respect rather than guess at.
        if (res.status === 429) {
          const retryAfterSec = Number(res.headers.get('retry-after'));
          const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? retryAfterSec * 1_000
            : BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]!;
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            res = null;
            continue;
          }
        }

        // 4xx other than 429 won't improve on retry.
        if (res.status < 500 && res.status !== 429) throw lastError;
        res = null;
      }

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) =>
          setTimeout(resolve, BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]!),
        );
      }
    }

    if (!res) throw lastError ?? new HetznerInferenceError('Hetzner request failed');

    const payload = (await res.json()) as ChatCompletionResponse;
    const choice = payload.choices?.[0];
    const raw = choice?.message?.content;

    if (typeof raw !== 'string' || raw.length === 0) {
      // Distinguish the two ways this happens, because the fixes differ: a
      // truncated reply needs more max_tokens, whereas reasoning-only output
      // means the thinking flag above didn't take effect.
      if (choice?.finish_reason === 'length') {
        throw new HetznerInferenceError(
          `Hetzner reply hit max_tokens (${request.maxTokens}) before producing content`,
        );
      }
      if (choice?.message?.reasoning) {
        throw new HetznerInferenceError(
          'Hetzner returned reasoning but no content — enable_thinking was not honoured',
        );
      }
      throw new HetznerInferenceError('Hetzner response contained no message content');
    }

    // A complete reply that stopped on length is truncated JSON; failing here
    // beats a confusing JSON.parse error at the callsite.
    if (choice?.finish_reason === 'length') {
      throw new HetznerInferenceError(
        `Hetzner reply truncated at max_tokens (${request.maxTokens})`,
      );
    }

    return {
      text: stripThinking(raw),
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
      model: payload.model ?? model,
    };
  }
}

export const hetznerTextClient: TextClient = new HetznerTextClient();
