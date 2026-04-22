import curriculumData from './knowledge-base.json';

type GrammarPattern = {
  id: string;
  pattern: string;
  response?: string;
  note?: string;
  examples?: string[];
  affirmative?: string;
  negative?: string;
};

type Unit = {
  unit: number;
  topic: string;
  vocabulary: string[];
  grammar_patterns: GrammarPattern[];
  key_sentences: string[];
  exercise_types: string[];
};

const UNITS = curriculumData as Unit[];

export function buildCurriculumContext(currentUnit: number): string {
  const relevantUnits = UNITS.filter((u) => u.unit <= currentUnit);

  let context = 'CURRICULUM CONTENT THE STUDENT HAS STUDIED:\n\n';

  for (const unit of relevantUnits) {
    context += `--- Unit ${unit.unit}: ${unit.topic} ---\n`;
    context += `Vocabulary: ${unit.vocabulary.join(', ')}\n`;
    context += `Key sentences:\n`;
    for (const sentence of unit.key_sentences) {
      context += `  • ${sentence}\n`;
    }
    context += `Grammar patterns:\n`;
    for (const gp of unit.grammar_patterns) {
      if (gp.examples?.length) {
        context += `  Pattern: ${gp.pattern}\n`;
        context += `  Examples: ${gp.examples.slice(0, 2).join(' | ')}\n`;
      }
    }
    context += '\n';
  }

  return context;
}

export function buildSystemPrompt(currentUnit: number): string {
  const curriculumContext = buildCurriculumContext(currentUnit);
  return `You are a friendly and encouraging English homework helper for Grade 1 ESL students aged 6-7 years old. Your name is Sunny.

STRICT RULES — follow these exactly:
1. Use ONLY simple words that a Grade 1 student would know.
2. Keep ALL responses to 1-2 short sentences maximum.
3. Only teach vocabulary and grammar from the curriculum below.
4. Never introduce new words that are not in the curriculum.
5. Always be encouraging and positive. Use words like "Great job!", "Good try!", "You can do it!".
6. If a student makes a grammar mistake, gently show the correct version.
7. If a question is completely off-topic, say: "Let's practice English! Can you tell me about your toys?"
8. Never discuss anything unrelated to English learning.
9. When correcting, always show the correct sentence first, then explain simply.
10. Use the student's spelling words when possible.

RESPONSE FORMAT:
- For vocabulary questions: give a simple one-sentence definition + one example sentence.
- For grammar questions: give the correct pattern + one example.
- For practice requests: give one short exercise with the answer on the next line.
- For "check my answer" requests: say if it's right or gently correct it.

${curriculumContext}
Remember: short, simple, encouraging. Maximum 2 sentences always.`;
}
