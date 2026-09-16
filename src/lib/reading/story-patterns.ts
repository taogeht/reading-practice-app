// Catalog of story patterns for reading passage generation.
// Replaces the single hardcoded 3-act conflict arc with 6 distinct
// pedagogical patterns suited for different learning goals and grade levels.

import type { StoryPattern } from './generate/types';

export interface StoryPatternDefinition {
  id: StoryPattern;
  label: string;
  emoji: string;
  tagline: string;
  description: string;
  bestFor: string;
  exampleSentence: string;
  /** Directives injected into the Stage 1 Planner prompt */
  plannerDirectives: string;
  /** Directives injected into the Stage 2 Prose Writer prompt */
  proseDirectives: string;
  /** Question generation strategy for Stage 4 */
  questionStrategy: string;
}

export const STORY_PATTERN_DEFINITIONS: Record<StoryPattern, StoryPatternDefinition> = {
  pattern: {
    id: 'pattern',
    label: 'Repetitive Pattern',
    emoji: '🔁',
    tagline: 'Predictable sentence frames',
    description:
      'A predictable sentence frame repeats on every page with one changing target word (e.g. "I can jump", "It is a ball").',
    bestFor: 'Kindergarten, early Grade 1, emergent phonics, and building early reading confidence.',
    exampleSentence: '"I can jump. I can run. I can swim. I can play!"',
    plannerDirectives: `PATTERN ARCHETYPE: REPETITIVE PATTERN BOOK
- Choose or follow ONE single predictable sentence frame across the entire story (e.g., "I can [action]", "It is a [object]", "I see a [noun]", "Look at the [noun]", "I have a [noun]").
- On each page, the beat must introduce exactly one concrete item or action using this frame.
- Do NOT plan a 3-act problem or conflict arc. There is NO disaster, mistake, or dilemma.
- Opening: Establish the frame and the speaker or main character.
- Development: Progress through each target item/action, with clear visual variety in the scene descriptions.
- Ending: Conclude with a joyful celebration or cumulative statement using the same frame (e.g., "I can play with my friends!" or "I love my toys!").`,
    proseDirectives: `PROSE STYLE FOR REPETITIVE PATTERN BOOK:
- Write exactly 1 ultra-simple sentence per page (or at most 2 very short sentences) following the planned sentence frame.
- Keep the repeated frame identical on each page, swapping only the focus word.
- Sentence length must be very short (3-5 words). No complex clauses or narrative tangents.`,
    questionStrategy: `QUESTION STRATEGY FOR PATTERN BOOK:
- Focus on word and object/action identification, pattern recognition, and target vocabulary matching.
- MCQs should ask simple questions (e.g. "What can the girl do?", "What is in the box?") with simple 1-2 word answer options.`,
  },

  discovery: {
    id: 'discovery',
    label: 'Exploration & Wonder',
    emoji: '🔍',
    tagline: 'Exploring without conflict',
    description:
      'Characters take a stroll or journey through a setting, discovering wonderful things page by page without any forced problem or drama.',
    bestFor: 'Nature, science walks, zoo trips, park adventures, and gentle bedtime reading.',
    exampleSentence: '"Leo walks into the garden. He sees a yellow butterfly. It lands on a tall flower."',
    plannerDirectives: `PATTERN ARCHETYPE: EXPLORATION & DISCOVERY
- The story follows a peaceful, curious stroll, walk, or visit through a setting (garden, park, beach, forest, museum, zoo, farm).
- NO FORCED PROBLEM OR CONFLICT. No lost items, no crying, no broken toys, no danger, no bad weather.
- Opening: The character(s) set out on their walk or visit with excitement.
- Development: Each page presents a new sensory discovery, friendly animal, or interesting detail.
- Ending: A warm, cozy conclusion reflecting on what was discovered or returning home happily.`,
    proseDirectives: `PROSE STYLE FOR EXPLORATION & DISCOVERY:
- Use sensory, descriptive language (looks, sees, hears, finds, smells).
- Emphasize curiosity, calm joy, and wonder.
- Clear, pleasant sentence rhythms without tense dramatic interruptions.`,
    questionStrategy: `QUESTION STRATEGY FOR EXPLORATION & DISCOVERY:
- Ask questions about what was discovered, where characters went, colors, and sensory details.`,
  },

  cumulative: {
    id: 'cumulative',
    label: 'Cumulative Tale',
    emoji: '🪜',
    tagline: 'Chain story building page by page',
    description:
      'Elements or friends join in sequence, repeating and building a growing chorus on each page until a group climax.',
    bestFor: 'Classroom read-alouds, choral reading, group repetition, and memory retention.',
    exampleSentence: '"The cat saw a big box. The dog jumped in. The rabbit hopped in too!"',
    plannerDirectives: `PATTERN ARCHETYPE: CUMULATIVE CHAIN TALE
- Structure builds cumulatively (like "The Mitten" or "Going on a Bear Hunt").
- Page 1 starts with a single character or item.
- Each successive page introduces a new friend, item, or action that joins the group, repeating or expanding the refrain.
- Opening: One character begins an activity or finds something interesting.
- Development: Page by page, additional characters or items join in.
- Ending: All characters celebrate, complete the task, or enjoy the final outcome together.`,
    proseDirectives: `PROSE STYLE FOR CUMULATIVE CHAIN TALE:
- Maintain rhythmic refrain and echo previous characters/items where natural.
- Keep momentum lively and joyful.`,
    questionStrategy: `QUESTION STRATEGY FOR CUMULATIVE CHAIN TALE:
- Ask about who joined first, who joined next, and the total group composition.`,
  },

  process: {
    id: 'process',
    label: 'Step-by-Step',
    emoji: '🛠️',
    tagline: 'How-to & sequential making',
    description:
      'Chronological sequence showing how something is made, built, cooked, or planted, step by step.',
    bestFor: 'Cooking recipes, building projects, planting seeds, daily routines, and science processes.',
    exampleSentence: '"First, we mix the flour. Next, we stir the eggs. Then, we put it in the oven."',
    plannerDirectives: `PATTERN ARCHETYPE: STEP-BY-STEP PROCESS / HOW-TO
- Follow a clear chronological progression (e.g. baking cookies, building a kite, planting a seed, painting a picture).
- Sequence markers: First, Next, Then, Now, At last.
- Opening: Introduce what is going to be made, created, or done.
- Development: Each page is one clear, concrete step in the process with its corresponding action.
- Ending: The finished creation is revealed, tested, or enjoyed with pride!`,
    proseDirectives: `PROSE STYLE FOR STEP-BY-STEP PROCESS:
- Use clear action verbs and sequence transition words (First, Next, Then, Now, Finally).
- Concrete instructions and vivid descriptions of materials and changes.`,
    questionStrategy: `QUESTION STRATEGY FOR STEP-BY-STEP PROCESS:
- Sequence ordering questions or step identification (e.g. "What do they do first?", "What goes in after the milk?").`,
  },

  adventure: {
    id: 'adventure',
    label: 'Classic Adventure',
    emoji: '🎭',
    tagline: 'Problem & clever solution',
    description:
      'The traditional narrative arc: setup, a mild challenge or mystery, a creative attempt, and a happy resolution.',
    bestFor: 'Older learners, action stories, mysteries, and narrative comprehension.',
    exampleSentence: '"Timmy cannot find his red cap. He looks under the bed. There it is, on the puppy!"',
    plannerDirectives: `PATTERN ARCHETYPE: CLASSIC MINI-ADVENTURE
- 3-act narrative progression: Setup → Mild challenge/mystery → Creative attempt → Positive resolution.
- Opening: Introduce character and ordinary situation.
- Development: A mild challenge or puzzle arises; character takes active steps to solve it.
- Ending: Problem is resolved happily and positively.`,
    proseDirectives: `PROSE STYLE FOR CLASSIC MINI-ADVENTURE:
- Dynamic pacing with clear cause-and-effect transitions.
- Maintain positive, encouraging tone with satisfying resolution.`,
    questionStrategy: `QUESTION STRATEGY FOR CLASSIC ADVENTURE:
- Event comprehension, character motives, cause-and-effect, and resolution.`,
  },

  nonfiction: {
    id: 'nonfiction',
    label: 'Fact Explorer',
    emoji: '🦁',
    tagline: 'Informational & real-world facts',
    description:
      'Fascinating real-world facts about animals, vehicles, science, nature, or community helpers.',
    bestFor: 'STEM themes, animal lovers, non-fiction reading practice, and vocabulary building.',
    exampleSentence: '"Frogs can jump very far. They have strong back legs. Frogs love to catch bugs."',
    plannerDirectives: `PATTERN ARCHETYPE: FACT EXPLORER (NON-FICTION)
- Informational, fact-based overview of a subject (e.g., frogs, vehicles, fire trucks, trees, planets).
- NO FICTIONAL CONFLICT OR DRAMA.
- Opening: Introduce the topic clearly (e.g. "Lions are big wild cats.").
- Development: Each page highlights one fascinating, concrete fact or feature with an illustrative example.
- Ending: Conclude with an inspiring summary of why the subject is special or amazing.`,
    proseDirectives: `PROSE STYLE FOR FACT EXPLORER:
- Declarative, clear, educational sentences in present simple tense.
- Use concrete vocabulary and comparisons a child can understand.`,
    questionStrategy: `QUESTION STRATEGY FOR FACT EXPLORER:
- Fact identification, true/false, and feature comparisons.`,
  },
};

export const ALL_STORY_PATTERNS: StoryPatternDefinition[] = [
  STORY_PATTERN_DEFINITIONS.pattern,
  STORY_PATTERN_DEFINITIONS.discovery,
  STORY_PATTERN_DEFINITIONS.cumulative,
  STORY_PATTERN_DEFINITIONS.process,
  STORY_PATTERN_DEFINITIONS.adventure,
  STORY_PATTERN_DEFINITIONS.nonfiction,
];

export const DEFAULT_STORY_PATTERN: StoryPattern = 'adventure';

export function getStoryPattern(id?: string | null): StoryPatternDefinition {
  if (id && id in STORY_PATTERN_DEFINITIONS) {
    return STORY_PATTERN_DEFINITIONS[id as StoryPattern];
  }
  return STORY_PATTERN_DEFINITIONS[DEFAULT_STORY_PATTERN];
}

/**
 * Determine the default pattern based on reading level when none is specified:
 * - Level 0 (Starter / Kindergarten): defaults to 'pattern'
 * - Levels 1-5: defaults to 'adventure'
 */
export function resolveStoryPattern(
  levelId: number,
  requested?: StoryPattern | null,
): StoryPattern {
  if (requested && requested in STORY_PATTERN_DEFINITIONS) {
    return requested;
  }
  return levelId === 0 ? 'pattern' : 'adventure';
}
