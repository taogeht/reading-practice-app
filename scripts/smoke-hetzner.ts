// Live smoke test for the Hetzner text provider. Cheap, no DB writes: one
// plain-chat call and one schema-constrained call through the same facade the
// generation pipeline uses.
//
// Usage:
//   npm run smoke:hetzner
//
// Needs HETZNER_INFERENCE_TOKEN in .env.local. Run this before trusting the
// provider with a full evaluation run — it verifies the client's request
// shape (thinking disabled, response_format honoured) against the live API.

import './_bootstrap-env';
import { hetznerTextClient } from '../src/lib/llm/hetzner-client';

const STORY_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: { pageNumber: { type: 'integer' }, text: { type: 'string' } },
        required: ['pageNumber', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'pages'],
  additionalProperties: false,
} as const;

async function main(): Promise<void> {
  if (!hetznerTextClient.isConfigured()) {
    throw new Error('HETZNER_INFERENCE_TOKEN is not set in .env.local');
  }

  console.log('1. plain chat (no schema)…');
  const chat = await hetznerTextClient.complete({
    system: 'You are a friendly helper for young ESL students. Answer in one short sentence.',
    messages: [{ role: 'user', content: 'What is a kite?' }],
    maxTokens: 120,
  });
  console.log(`   model=${chat.model} in=${chat.inputTokens} out=${chat.outputTokens}`);
  console.log(`   reply: ${chat.text}`);
  if (/<think>/i.test(chat.text)) throw new Error('reasoning leaked into content');

  console.log('\n2. schema-constrained (the path six call sites depend on)…');
  const structured = await hetznerTextClient.complete({
    system: [
      { text: 'You write simple stories for young ESL readers.', cacheable: true },
    ],
    messages: [{ role: 'user', content: 'Write a 2-page story about a red kite.' }],
    maxTokens: 1500,
    jsonSchema: STORY_SCHEMA as unknown as Record<string, unknown>,
  });
  console.log(`   model=${structured.model} in=${structured.inputTokens} out=${structured.outputTokens}`);

  const parsed = JSON.parse(structured.text) as { title?: string; pages?: unknown[] };
  console.log(`   parsed OK — title="${parsed.title}" pages=${parsed.pages?.length}`);
  if (!parsed.title || !Array.isArray(parsed.pages) || parsed.pages.length === 0) {
    throw new Error('reply parsed but did not match the requested shape');
  }

  console.log('\nBoth calls succeeded. Provider is usable by the generation pipeline.');
  process.exit(0);
}

main().catch((error) => {
  console.error('\nSMOKE TEST FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
