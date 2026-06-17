// Curated prompt templates shared by every image provider. Both the Gemini
// and GPT Image clients build their `generateImage`/`generateScene` prompts
// from these so a side-by-side quality comparison is apples-to-apples — the
// only variable is the model, not the wording.

/** Spelling-flashcard prompt: a single clear object on plain white. */
export function buildSpellingPrompt(word: string): string {
  return `Create a simple, colorful clipart-style illustration of "${word}". The image should show a single clear object or concept on a plain white background, suitable for a young child's spelling flashcard. No text or letters in the image. Friendly, simple, and easy to recognize.`;
}

/** Practice-question scene prompt: an unambiguous multi-object scene on white. */
export function buildScenePrompt(description: string): string {
  return `Create a simple, colorful clipart-style illustration for a Grade 1 ESL practice question. Scene: ${description.trim()}. Plain white background. No text, letters, or numbers anywhere in the image. Friendly, child-appropriate, and visually unambiguous — counts and positions should be obvious at a glance.`;
}
