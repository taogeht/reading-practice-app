export interface GenerationWorkItem {
  index: number;
  targetVocabIds: string[];
}

export interface GenerationJobLaunchState {
  status: 'queued' | 'running' | 'completed' | 'failed';
  leaseExpiresAt: Date | null;
  workItems: unknown;
}

export function buildGenerationWorkItems(
  perCallTargetIds: string[][],
): GenerationWorkItem[] {
  return perCallTargetIds.map((targetVocabIds, index) => ({
    index,
    targetVocabIds: [...targetVocabIds],
  }));
}

export function parseGenerationWorkItems(
  value: unknown,
  countRequested: number,
): GenerationWorkItem[] | null {
  if (!Array.isArray(value) || value.length !== countRequested) return null;
  const items: GenerationWorkItem[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || !Number.isInteger(raw.index) || !Array.isArray(raw.targetVocabIds)) {
      return null;
    }
    const targetVocabIds = raw.targetVocabIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    if (targetVocabIds.length !== raw.targetVocabIds.length || targetVocabIds.length === 0) {
      return null;
    }
    items.push({ index: raw.index as number, targetVocabIds });
  }
  items.sort((a, b) => a.index - b.index);
  if (items.some((item, index) => item.index !== index)) return null;
  return items;
}

/** Legacy jobs have no workItems and cannot be resumed safely. */
export function generationJobNeedsLaunch(
  job: GenerationJobLaunchState,
  now = new Date(),
): boolean {
  if (!Array.isArray(job.workItems) || job.workItems.length === 0) return false;
  return (
    job.status === 'queued' ||
    (job.status === 'running' &&
      (!job.leaseExpiresAt || job.leaseExpiresAt.getTime() <= now.getTime()))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
