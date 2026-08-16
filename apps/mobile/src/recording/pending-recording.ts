import * as SecureStore from 'expo-secure-store';
import { Directory, File, Paths } from 'expo-file-system';

const pendingDirectory = new Directory(Paths.document, 'starling-rise-pending-recordings');
const indexKey = 'starling-rise.pending-recordings';

export type PendingRecording = {
  assignmentId: string;
  operationId: string;
  uri: string;
  durationSeconds: number;
  createdAt: string;
};

function metadataKey(assignmentId: string): string {
  return `starling-rise.pending-recording.${assignmentId}`;
}

function createOperationId(): string {
  const randomPart = () => Math.random().toString(36).slice(2, 14);
  return `rec-${Date.now().toString(36)}-${randomPart()}-${randomPart()}`;
}

async function loadIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(indexKey);
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

async function saveIndex(assignmentIds: string[]): Promise<void> {
  const unique = [...new Set(assignmentIds)];
  if (unique.length === 0) {
    await SecureStore.deleteItemAsync(indexKey);
    return;
  }
  await SecureStore.setItemAsync(indexKey, JSON.stringify(unique), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadPendingRecording(
  assignmentId: string,
): Promise<PendingRecording | null> {
  const raw = await SecureStore.getItemAsync(metadataKey(assignmentId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingRecording>;
    if (
      value.assignmentId !== assignmentId ||
      typeof value.operationId !== 'string' ||
      typeof value.uri !== 'string' ||
      typeof value.durationSeconds !== 'number' ||
      typeof value.createdAt !== 'string'
    ) {
      throw new Error('Invalid pending recording metadata.');
    }
    const file = new File(value.uri);
    if (!file.exists || (file.info().size ?? 0) === 0) {
      throw new Error('Pending recording file is missing.');
    }
    return value as PendingRecording;
  } catch {
    await removePendingRecording(assignmentId);
    return null;
  }
}

export async function savePendingRecording(input: {
  assignmentId: string;
  sourceUri: string;
  durationSeconds: number;
}): Promise<PendingRecording> {
  await removePendingRecording(input.assignmentId);
  pendingDirectory.create({ idempotent: true, intermediates: true });

  const operationId = createOperationId();
  const destination = new File(pendingDirectory, `${operationId}.m4a`);
  await new File(input.sourceUri).copy(destination);
  const pending: PendingRecording = {
    assignmentId: input.assignmentId,
    operationId,
    uri: destination.uri,
    durationSeconds: input.durationSeconds,
    createdAt: new Date().toISOString(),
  };

  await SecureStore.setItemAsync(
    metadataKey(input.assignmentId),
    JSON.stringify(pending),
    { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
  );
  await saveIndex([...(await loadIndex()), input.assignmentId]);
  return pending;
}

export async function removePendingRecording(assignmentId: string): Promise<void> {
  const raw = await SecureStore.getItemAsync(metadataKey(assignmentId));
  if (raw) {
    try {
      const value = JSON.parse(raw) as Partial<PendingRecording>;
      if (typeof value.uri === 'string') {
        const file = new File(value.uri);
        if (file.exists) file.delete();
      }
    } catch {
      // Metadata is being removed below even if it cannot be decoded.
    }
  }
  await SecureStore.deleteItemAsync(metadataKey(assignmentId));
  await saveIndex((await loadIndex()).filter((id) => id !== assignmentId));
}

export async function clearPendingRecordings(): Promise<void> {
  const assignmentIds = await loadIndex();
  await Promise.all(
    assignmentIds.map((assignmentId) =>
      SecureStore.deleteItemAsync(metadataKey(assignmentId)),
    ),
  );
  await SecureStore.deleteItemAsync(indexKey);
  if (pendingDirectory.exists) pendingDirectory.delete();
}
