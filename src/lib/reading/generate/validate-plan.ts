import type { PassagePlan } from './types';

export interface PassagePlanRequirements {
  pageCount: { min: number; max: number };
  requiredTargetVocabIds: string[];
}

/**
 * Enforce the request-level invariants that the provider JSON schema cannot
 * express. A structurally valid plan is still unusable when it drops a target
 * word, emits the wrong number of pages, or repeats/skips page numbers.
 */
export function assertPassagePlanMatchesRequest(
  plan: PassagePlan,
  requirements: PassagePlanRequirements,
): void {
  const issues: string[] = [];
  const pageCount = plan.pages.length;

  if (
    pageCount < requirements.pageCount.min ||
    pageCount > requirements.pageCount.max
  ) {
    const expected =
      requirements.pageCount.min === requirements.pageCount.max
        ? String(requirements.pageCount.min)
        : `${requirements.pageCount.min}-${requirements.pageCount.max}`;
    issues.push(`expected ${expected} pages, received ${pageCount}`);
  }

  const actualPageNumbers = plan.pages.map((page) => page.pageNumber);
  const expectedPageNumbers = Array.from(
    { length: pageCount },
    (_, index) => index + 1,
  );
  if (
    actualPageNumbers.length !== expectedPageNumbers.length ||
    actualPageNumbers.some((pageNumber, index) => pageNumber !== expectedPageNumbers[index])
  ) {
    issues.push(
      `page numbers must be sequential from 1; received [${actualPageNumbers.join(', ')}]`,
    );
  }

  const characterNames = plan.characters.map((character) =>
    character.name.trim().toLowerCase(),
  );
  if (new Set(characterNames).size !== characterNames.length) {
    issues.push('character names must be unique');
  }

  const plannedTargetIds = new Set(
    plan.pages.flatMap((page) => page.targetVocabUsed),
  );
  const missingTargetIds = Array.from(
    new Set(requirements.requiredTargetVocabIds),
  ).filter((id) => !plannedTargetIds.has(id));
  if (missingTargetIds.length > 0) {
    issues.push(
      `plan omitted ${missingTargetIds.length} requested target vocabulary word${missingTargetIds.length === 1 ? '' : 's'}: ${missingTargetIds.join(', ')}`,
    );
  }

  const requestedTargetIds = new Set(requirements.requiredTargetVocabIds);
  const unexpectedTargetIds = Array.from(plannedTargetIds).filter(
    (id) => !requestedTargetIds.has(id),
  );
  if (unexpectedTargetIds.length > 0) {
    issues.push(
      `plan referenced ${unexpectedTargetIds.length} unrequested target vocabulary word${unexpectedTargetIds.length === 1 ? '' : 's'}: ${unexpectedTargetIds.join(', ')}`,
    );
  }

  if (issues.length > 0) {
    throw new Error(`PassagePlan request validation failed: ${issues.join('; ')}`);
  }
}
