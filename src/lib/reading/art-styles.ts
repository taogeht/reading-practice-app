// Curated art styles for Raz-Kids-style reading stories.
// Each style defines a prompt suffix tuned for Google Gemini 3.1 Flash Image.
// The "no text / no words / no letters" instruction is enforced on all styles
// to prevent garbled English text from appearing in student illustrations.

import type { ImageStyle } from './generate/types';

export const READING_ART_STYLE_IDS = [
  'watercolor',
  'cartoon',
  'crayon',
  'claymation',
  'vintage',
  'comic',
] as const;

export type ReadingArtStyleId = (typeof READING_ART_STYLE_IDS)[number];

export interface ReadingArtStyle {
  id: ReadingArtStyleId;
  label: string;
  tagline: string;
  description: string;
  bestFor: string;
  badgeEmoji: string;
  promptSuffix: string;
  aspectRatio: '1:1';
}

export const READING_ART_STYLES: Record<ReadingArtStyleId, ReadingArtStyle> = {
  watercolor: {
    id: 'watercolor',
    label: 'Soft Watercolor',
    tagline: 'Classic picture book',
    description: 'Delicate washes, gentle paper texture, and warm pastel tones.',
    bestFor: 'Cozy everyday stories, bedtime tales, and nature adventures',
    badgeEmoji: '🎨',
    promptSuffix:
      ', soft watercolor illustration style, warm pastel colors, ' +
      'delicate pencil and watercolor wash, gentle paper texture, simple shapes, ' +
      'friendly faces, white background, no text in image, no words, no letters, ' +
      "children's book illustration, age 6-10",
    aspectRatio: '1:1',
  },
  cartoon: {
    id: 'cartoon',
    label: 'Modern Vibrant Cartoon',
    tagline: 'Toca Boca & Bluey inspired',
    description: 'Clean bold outlines, saturated cheerful colors, and flat cel-shading.',
    bestFor: 'Humorous mishaps, energetic playground games, and school life',
    badgeEmoji: '✨',
    promptSuffix:
      ', modern 2D cartoon storybook illustration, bold clean outlines, ' +
      'bright cheerful saturated colors, flat cel shading, playful rounded shapes, ' +
      'cute expressive animated faces, Toca Life and Bluey inspired, ' +
      "children's book art, no text in image, no words, no letters",
    aspectRatio: '1:1',
  },
  crayon: {
    id: 'crayon',
    label: 'Crayon & Colored Pencil',
    tagline: 'Textured & imaginative',
    description: 'Hand-drawn wax crayon and pencil strokes with rich paper grain.',
    bestFor: 'Early phonics, imaginative daydreaming, and creative animal stories',
    badgeEmoji: '🖍️',
    promptSuffix:
      ', whimsical storybook illustration, hand-drawn colored pencil and wax crayon textures, ' +
      'rich textured paper grain, charming stylized childlike drawings, warm playful colors, ' +
      "endearing character design, children's book illustration, age 6-10, " +
      'no text in image, no words, no letters',
    aspectRatio: '1:1',
  },
  claymation: {
    id: 'claymation',
    label: '3D Claymation',
    tagline: 'Tactile plasticine figures',
    description: 'Sculpted clay figures with soft studio lighting and depth of field.',
    bestFor: 'Action, building, science exploration, and fantasy creatures',
    badgeEmoji: '🧸',
    promptSuffix:
      ', cute 3D claymation stop-motion style, handcrafted plasticine clay texture, ' +
      'tactile sculpted figures, soft warm studio lighting, gentle depth of field, ' +
      'rounded friendly characters, Aardman and Pixar short inspired, vibrant playful colors, ' +
      'no text in image, no words, no letters',
    aspectRatio: '1:1',
  },
  vintage: {
    id: 'vintage',
    label: 'Retro Golden Book',
    tagline: '1960s mid-century gouache',
    description: 'Classic gouache paint textures and bold graphic mid-century shapes.',
    bestFor: 'Folktales, community helpers (bakers, firefighters), and historical themes',
    badgeEmoji: '📖',
    promptSuffix:
      ', retro classic 1960s Little Golden Book illustration style, vintage gouache paint texture, ' +
      'bold mid-century graphic shapes, limited warm vintage color palette, ' +
      "nostalgic children's book art, friendly expressive faces, " +
      'no text in image, no words, no letters',
    aspectRatio: '1:1',
  },
  comic: {
    id: 'comic',
    label: 'Comic & Graphic Novel',
    tagline: 'Crisp ink & pop colors',
    description: 'Clean ink lineart, dynamic composition, and expressive animated eyes.',
    bestFor: 'Adventures, superhero stories, mystery, and older learners (Grades 3–5)',
    badgeEmoji: '💥',
    promptSuffix:
      ', kid-friendly graphic novel illustration style, crisp clean ink lineart, ' +
      'dynamic composition, bright pop colors, expressive animated cartoon eyes, ' +
      'Dog Man and comic book art for kids, no speech bubbles, no sound effects, ' +
      'no text, no words, no letters',
    aspectRatio: '1:1',
  },
};

export const ALL_READING_ART_STYLES: ReadingArtStyle[] = READING_ART_STYLE_IDS.map(
  (id) => READING_ART_STYLES[id],
);

export const DEFAULT_READING_ART_STYLE_ID: ReadingArtStyleId = 'watercolor';

export function getReadingArtStyle(id?: string | null): ReadingArtStyle {
  if (id && id in READING_ART_STYLES) {
    return READING_ART_STYLES[id as ReadingArtStyleId];
  }
  return READING_ART_STYLES[DEFAULT_READING_ART_STYLE_ID];
}

export function toImageStyle(style: ReadingArtStyle): ImageStyle {
  return {
    promptSuffix: style.promptSuffix,
    aspectRatio: style.aspectRatio,
  };
}
