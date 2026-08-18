// Shared contract for text-generation (LLM) providers. The Claude client and
// any OpenAI-compatible client implement `TextClient`, and the facade in
// `./index` routes to whichever one the admin-selected `text.generationModel`
// setting points at. Keeping the surface identical is what makes providers
// interchangeable at every callsite (passage plan/prose/questions, question
// regeneration, fluency analysis, practice questions, homework helper).
//
// Modelled on src/lib/image/types.ts, which does the same job for image
// generation.

/** One span of prompt text. Split into segments only when part of a prompt is
 *  a stable prefix worth caching — otherwise pass a plain string. */
export interface TextSegment {
  text: string;
  /**
   * Marks this span as a stable prefix. The Claude client turns it into
   * `cache_control: { type: 'ephemeral' }`; providers with no prompt-cache
   * concept ignore it and simply concatenate.
   *
   * This exists because the generation stages cache their system prompt AND
   * the cumulative-vocabulary block — the single largest repeated payload in
   * the pipeline (hundreds of words, identical across every regen attempt).
   * Flattening prompts to one string would silently drop that.
   */
  cacheable?: boolean;
}

/** Either a plain prompt or an ordered list of spans, some cacheable. */
export type TextInput = string | TextSegment[];

export interface TextMessage {
  role: 'user' | 'assistant';
  content: TextInput;
}

export interface TextCompletionRequest {
  system: TextInput;
  /** Conversation turns. Generation stages send a single user message; the
   *  homework helper sends prior history followed by the student's message. */
  messages: TextMessage[];
  maxTokens: number;
  /**
   * JSON Schema the reply must conform to. Every caller ALSO validates with
   * zod afterwards, so a provider that can only approximate schema adherence
   * degrades to "more retries" rather than "wrong data reaches the DB".
   */
  jsonSchema?: Record<string, unknown>;
  /** Reasoning-depth hint. Claude maps it to `output_config.effort`;
   *  providers without the concept ignore it. */
  effort?: 'low' | 'medium' | 'high';
}

export interface TextCompletionResult {
  /** Reply text, already joined and trimmed. Callers JSON.parse this when
   *  they passed a jsonSchema. */
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** The model id that actually served the request — logged and persisted to
   *  generationMeta so a passage records what produced it. */
  model: string;
}

export interface TextClient {
  /** Whether the underlying provider has the credentials it needs. */
  isConfigured(): boolean;
  complete(request: TextCompletionRequest): Promise<TextCompletionResult>;
}

/** The selectable text-generation backends. */
export type TextProvider = 'claude' | 'hetzner-qwen';

/** Normalise either prompt form to a segment list. */
export function toSegments(input: TextInput): TextSegment[] {
  return typeof input === 'string' ? [{ text: input }] : input;
}

/** Flatten to a single string, for providers with no notion of prompt spans. */
export function flattenInput(input: TextInput): string {
  return toSegments(input)
    .map((segment) => segment.text)
    .join('\n\n');
}
