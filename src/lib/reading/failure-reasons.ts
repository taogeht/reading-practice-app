// Translate raw validator-issue + pipeline-error signatures into a
// short teacher-readable sentence + a separate technical-details
// string. The orchestrator's PassageIssue union is the authoritative
// list of failure modes; this map covers every error-severity issue
// we currently emit, plus the synthetic `pipeline_error` that wraps
// stage-level exceptions.
//
// Keep the user-facing copy second-person and actionable: "Try X" or
// "Try again." Avoid validator vocabulary ("structural error",
// "regen") — teachers haven't built a mental model around those.

import type {
  PassageIssue,
} from './generate';

export type FailureStage =
  | 'plan'
  | 'prose'
  | 'questions'
  | 'images'
  | 'uploads'
  | 'persistence'
  | 'unknown';

export interface TranslatedFailure {
  /** The single sentence shown in the teacher UI by default. */
  teacherMessage: string;
  /** Raw issue-type list + the pipeline error message, joined with
   *  ' / '. Shown behind a "Show technical details" toggle. */
  technicalDetails: string;
  /** Which stage failed — drives a small badge on the detail card. */
  failureStage: FailureStage;
}

// ---- Issue-type → teacher copy ----------------------------------------
//
// Strings keyed on the literal issue-type discriminator. Used for
// prose and question validator issues with severity='error'. Image
// validator issues fall through to a generic "try again" message
// since the surface causes (Gemini empties, quota) all share the
// same teacher-side remedy.

const PROSE_ISSUE_COPY: Record<string, string> = {
  unknown_word:
    "The story used too many unfamiliar words. Try a more concrete setting, or switch to permissive vocabulary mode.",
  sentence_too_long:
    "Several sentences were too long for this reading level. Try raising the sentence-length cap, or generate again.",
  target_word_missing:
    "The story didn't use all of your target words. Try with fewer specific words, or let the system pick them.",
  page_too_short:
    "Some pages came out too short. Try generating again, or lower the words-per-page average.",
  page_too_long:
    "Some pages came out too long. Try generating again, or raise the words-per-page average.",
  forbidden_construction:
    "The story used grammar that wasn't allowed at this level. Try generating again, or loosen the grammar toggles.",
};

const QUESTION_ISSUE_COPY: Record<string, string> = {
  evidence_not_found:
    "The questions couldn't find supporting quotes in the story. This sometimes happens — try generating again.",
  vocab_id_invalid:
    "A vocabulary question referenced a word that didn't match the story's target list. Try again.",
  pair_image_key_invalid:
    "An image failed to generate. Try again, or report this if it keeps happening.",
  wrong_question_count:
    "The wrong number of questions came back. This is a system issue — try again.",
  wrong_type_distribution:
    "The questions weren't generated in the right mix. This is a system issue — try again.",
  legacy_vocab_matching_format:
    "An older vocab question shape was returned. Try again.",
};

/** Walk the orchestrator's issue list and produce a single
 *  user-facing message. Priority: the dominant error-tier issue
 *  group across stages; ties broken by stage order (plan → prose →
 *  questions → images) since earlier-stage failures are usually the
 *  root cause. */
export function translateFailureReason(
  issues: PassageIssue[],
): TranslatedFailure {
  // Bucket error-severity issues by (stage, type).
  const errorIssues = issues.filter((i) => i.severity === 'error');
  const pipelineError = errorIssues.find((i) => i.stage === 'pipeline');
  const proseError = errorIssues.find((i) => i.stage === 'prose');
  const questionsError = errorIssues.find((i) => i.stage === 'questions');
  const imagesError = errorIssues.find((i) => i.stage === 'images');

  // The unique error-issue types across all stages — used in the
  // technical-details string. Pipeline_error doesn't have a `type`
  // we keep here; the `message` is shown separately below.
  const typeSet = new Set<string>();
  for (const i of errorIssues) {
    if (i.stage !== 'pipeline' && 'type' in i) typeSet.add(i.type);
  }
  const pipelineMsg =
    pipelineError && 'message' in pipelineError ? pipelineError.message : '';
  const technicalDetails = [
    pipelineMsg ? `pipeline: ${pipelineMsg}` : '',
    typeSet.size > 0 ? `issues: ${Array.from(typeSet).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' / ');

  // Stage priority: prose → questions → images → pipeline. Prose
  // wins because a broken plan/prose cascades into every later
  // stage, so its message is the most actionable.
  if (proseError && 'type' in proseError) {
    return {
      teacherMessage:
        PROSE_ISSUE_COPY[proseError.type] ??
        'The story didn\'t meet the level\'s prose rules. Try generating again.',
      technicalDetails,
      failureStage: 'prose',
    };
  }
  if (questionsError && 'type' in questionsError) {
    return {
      teacherMessage:
        QUESTION_ISSUE_COPY[questionsError.type] ??
        'The questions didn\'t come out right. Try generating again.',
      technicalDetails,
      failureStage: 'questions',
    };
  }
  if (imagesError) {
    return {
      teacherMessage:
        'An image step failed. Try again — image generation occasionally hiccups.',
      technicalDetails,
      failureStage: 'images',
    };
  }
  if (pipelineMsg) {
    // Try to recover the stage from the error message, which the
    // orchestrator emits as "Stage N (label) failed: ..." or
    // "R2 upload failed: ...".
    const stage = inferStageFromPipelineMsg(pipelineMsg);
    return {
      teacherMessage: messageForPipelineStage(stage, pipelineMsg),
      technicalDetails,
      failureStage: stage,
    };
  }
  return {
    teacherMessage:
      "Generation didn't complete successfully. Try again, and contact support if the problem keeps happening.",
    technicalDetails: technicalDetails || 'no issues reported',
    failureStage: 'unknown',
  };
}

function inferStageFromPipelineMsg(msg: string): FailureStage {
  if (/Stage 1 \(plan\)/i.test(msg)) return 'plan';
  if (/Stage 2|Stage 3|\bprose\b/i.test(msg)) return 'prose';
  if (/Stage 4|questions/i.test(msg)) return 'questions';
  if (/Stage 5|images/i.test(msg)) return 'images';
  if (/R2 upload/i.test(msg)) return 'uploads';
  if (/DB write/i.test(msg)) return 'persistence';
  return 'unknown';
}

function messageForPipelineStage(stage: FailureStage, raw: string): string {
  switch (stage) {
    case 'plan':
      return "The story plan didn't come together. Try again, or change the setting/theme hint.";
    case 'prose':
      return "The story prose didn't meet the level's rules. Try again, or loosen the sentence-length cap.";
    case 'questions':
      return 'The questions failed to generate. Try again.';
    case 'images':
      return 'An image step failed. Image generation occasionally hiccups — try again.';
    case 'uploads':
      return 'A storage upload failed. Try again.';
    case 'persistence':
      return 'The story couldn\'t be saved. Try again, and contact support if it keeps happening.';
    default:
      // Fall back to the raw message for visibility; teachers can
      // still re-run.
      return `Generation failed: ${raw.slice(0, 160)}`;
  }
}
