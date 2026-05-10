// Barrel for the reading-passage generation pipeline. Stages 4+ (image
// prompts, TTS) will export from here too as they land.

export { generatePassagePlan } from './plan';
export { generatePagesProse, generatePagesProseWithFeedback } from './prose';
export { generateValidatedProse } from './generate-validated-prose';
export { validatePagesProse } from './validate';
export { generateQuestions } from './questions';
export { validateQuestions } from './validate-questions';
export {
  generatePassageImages,
  validatePassageImages,
  buildImagePrompt,
  DEFAULT_IMAGE_STYLE,
} from './images';
export { generatePassage } from './passage';
export type {
  GeneratePassageInput,
  GeneratePassageResult,
  PassageIssue,
} from './passage';
export { generateSinglePage } from './regen-page';
export { generateSingleQuestion } from './regen-question';
export type {
  GenerateSinglePageInput,
  GenerateSinglePageResult,
} from './regen-page';
export type {
  GenerateSingleQuestionInput,
  GenerateSingleQuestionResult,
  SingleQuestionType,
} from './regen-question';
export { tokenizeStoryText } from './tokenize';
export type { TokenMatch, TokenizeResult } from './tokenize';
export {
  PassagePlanSchema,
  GeneratedPageProseSchema,
  PagesProseOutputSchema,
  type PassagePlan,
  type PassagePagePlan,
  type Character,
  type StructuralPlan,
  type GeneratedPageProse,
  type PagesProseOutput,
  type GeneratePassagePlanInput,
  type GeneratePassagePlanResult,
  type GeneratePagesProseInput,
  type GeneratePagesProseResult,
  type GenerationCallMeta,
  type ValidationIssue,
  type ValidationStats,
  type ValidationResult,
  type ProseFeedback,
  type GenerateValidatedProseInput,
  type GenerateValidatedProseResult,
  type AttemptRecord,
  type GeneratedQuestion,
  type GenerateQuestionsInput,
  type GenerateQuestionsResult,
  type QuestionValidationIssue,
  type QuestionValidationResult,
  type QuestionValidationStats,
  type ImageStyle,
  type GeneratedPageImage,
  type GeneratePassageImagesInput,
  type GeneratePassageImagesResult,
  type ImageValidationIssue,
  type ImageValidationResult,
} from './types';
