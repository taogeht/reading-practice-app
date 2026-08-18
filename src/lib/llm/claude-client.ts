// Anthropic backend for the TextClient contract. This is the behaviour the
// whole pipeline ran on before the facade existed, moved behind `complete()`
// unchanged: thinking disabled, effort on output_config, json_schema format,
// and cache_control on every span the caller marked cacheable.
//
// Reached through the facade in ./index — don't import this directly from
// feature code.

import Anthropic from '@anthropic-ai/sdk';
import {
  type TextClient,
  type TextCompletionRequest,
  type TextCompletionResult,
  type TextInput,
  toSegments,
} from './types';

export const CLAUDE_MODEL = 'claude-sonnet-5';

/** Map prompt spans to Anthropic content blocks, attaching cache_control to
 *  the ones the caller marked cacheable. */
function toContentBlocks(input: TextInput): Anthropic.TextBlockParam[] {
  return toSegments(input).map((segment) =>
    segment.cacheable
      ? { type: 'text', text: segment.text, cache_control: { type: 'ephemeral' } }
      : { type: 'text', text: segment.text },
  );
}

class ClaudeTextClient implements TextClient {
  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async complete(request: TextCompletionRequest): Promise<TextCompletionResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: request.maxTokens,
      // Kept explicitly off: Sonnet 5 runs adaptive thinking when `thinking`
      // is omitted, and thinking tokens count against max_tokens.
      thinking: { type: 'disabled' },
      output_config: {
        effort: request.effort ?? 'medium',
        ...(request.jsonSchema
          ? { format: { type: 'json_schema' as const, schema: request.jsonSchema } }
          : {}),
      },
      system: toContentBlocks(request.system),
      messages: request.messages.map((message) => ({
        role: message.role,
        content: toContentBlocks(message.content),
      })),
    });

    return {
      text: response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim(),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: CLAUDE_MODEL,
    };
  }
}

export const claudeTextClient: TextClient = new ClaudeTextClient();
