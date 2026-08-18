import type { QuestionTypeMix } from '@/lib/reading/levels';

/** Pure quota arithmetic shared by generation, validation, and tests. */
export function questionCountForMix(mix: QuestionTypeMix): number {
  return mix.mcq_comprehension + mix.vocab_matching + mix.sequence_order;
}
