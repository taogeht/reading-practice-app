// Shared contract for image-generation providers. Both the Gemini client and
// the GPT Image 1 client implement `ImageClient`, and the facade in `./index`
// routes to whichever one the admin-selected `image.generationModel` setting
// points at. Keeping the surface identical is what makes the two providers
// interchangeable at every callsite (spelling, practice scenes, reading-passage
// panels, avatars/cosmetics).

export interface ImageGenerationResult {
  success: boolean;
  imageBuffer?: Buffer;
  contentType?: string;
  error?: string;
}

export interface GenerateImagePanelOptions {
  prompt: string;
  /**
   * Optional reference image inlined as multi-modal input. Used by the
   * reading-passage pipeline to keep a character consistent across pages —
   * page 1 is generated cold, pages 2..N pass page 1 as a reference.
   * Gemini sends it as inline image bytes; GPT Image routes through the
   * images.edits endpoint.
   */
  referenceImage?: { buffer: Buffer; mimeType: string };
  label?: string;
}

export interface ImageClient {
  /** Whether the underlying provider has the credentials it needs. */
  isConfigured(): boolean;
  /** Curated prompt: single labeled object on white, for spelling flashcards. */
  generateImage(word: string): Promise<ImageGenerationResult>;
  /** Curated prompt: multi-object scene on white, for practice questions. */
  generateScene(description: string): Promise<ImageGenerationResult>;
  /** Fully caller-driven prompt, optionally with a reference image. */
  generateImagePanel(opts: GenerateImagePanelOptions): Promise<ImageGenerationResult>;
}

/** The selectable image-generation backends. */
export type ImageProvider = 'gemini' | 'gpt-image-1-mini';
