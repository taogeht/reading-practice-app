import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  CopyObjectCommand
} from "@aws-sdk/client-s3";

// Reject path-traversal vectors and embedded slashes for any caller-supplied
// value that becomes a path segment in an R2 key. Used by the story-asset key
// helpers; older helpers (spelling/practice/etc.) trust their callers because
// their inputs are constrained DB IDs or admin-curated values.
function assertSafePathSegment(value: string, name: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  if (
    value.includes('/') ||
    value.includes('\\') ||
    value === '.' ||
    value === '..'
  ) {
    throw new Error(`${name} contains invalid path characters: ${JSON.stringify(value)}`);
  }
}

function assertPositiveInt(n: number, name: string): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${name} must be a positive integer, got: ${n}`);
  }
}

class R2Client {
  private client: S3Client;
  private bucketName: string;
  private publicUrl: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucketName = process.env.R2_BUCKET_NAME || '';
    this.publicUrl = process.env.R2_PUBLIC_URL || '';

    if (!accountId || !accessKeyId || !secretAccessKey || !this.bucketName) {
      throw new Error('Missing required R2 environment variables');
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /**
   * Generate a presigned URL for uploading files directly from the client
   */
  async generatePresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Generate a presigned URL for downloading files
   */
  async generatePresignedDownloadUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Upload a file directly from the server
   */
  async uploadFile(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    });

    await this.client.send(command);

    // For audio files, return a proxy URL that never expires
    if (contentType.startsWith('audio/')) {
      return this.getProxyUrl(key);
    }

    // For image files, return a proxy URL
    if (contentType.startsWith('image/')) {
      return `/api/images/${key}`;
    }

    return this.getPublicUrl(key);
  }

  /**
   * Server-side copy of an existing R2 object to a new key (no data flows
   * through our server — R2 copies internally). Used by batch media upload to
   * fan one uploaded file out to a per-student key for each recipient, so every
   * student_media row owns an independent object (matching single-upload
   * semantics). Keys produced by generateMediaKey are already path-sanitized.
   */
  async copyFile(srcKey: string, destKey: string): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: this.bucketName,
      CopySource: `${this.bucketName}/${srcKey}`,
      Key: destKey,
    });
    await this.client.send(command);
  }

  /**
   * Delete a file
   */
  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.client.send(command);
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(keys: string[]): Promise<void> {
    if (!keys || keys.length === 0) return;

    // S3 DeleteObjectsCommand allows max 1000 keys per request
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
      const chunk = keys.slice(i, i + CHUNK_SIZE);
      const command = new DeleteObjectsCommand({
        Bucket: this.bucketName,
        Delete: {
          Objects: chunk.map(key => ({ Key: key })),
          Quiet: false,
        },
      });
      await this.client.send(command);
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the object from R2 for streaming
   */
  async getObject(key: string): Promise<{
    body: ReadableStream | null;
    contentType: string | undefined;
    contentLength: number | undefined;
  } | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.client.send(command);

      return {
        body: response.Body?.transformToWebStream() as ReadableStream | null ?? null,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Fetch an object fully into a Buffer (server-side). Used for inlining images
   * as base64 data URIs into the PDF HTML — the headless renderer has no session,
   * so it can't hit the auth-gated /api/images proxy.
   */
  async getObjectBuffer(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string | undefined } | null> {
    try {
      const command = new GetObjectCommand({ Bucket: this.bucketName, Key: key });
      const response = await this.client.send(command);
      if (!response.Body) return null;
      const bytes = await response.Body.transformToByteArray();
      return { buffer: Buffer.from(bytes), contentType: response.ContentType };
    } catch {
      return null;
    }
  }

  /**
   * Get a permanent proxy URL for an audio file (served via /api/audio/[...key])
   */
  getProxyUrl(key: string): string {
    return `/api/audio/${key}`;
  }

  /**
   * Get the public URL for a file (if bucket has public read access)
   */
  getPublicUrl(key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    return `https://${this.bucketName}.r2.dev/${key}`;
  }

  /**
   * Generate a file key for audio files
   */
  generateAudioKey(type: 'tts' | 'recording', filename: string, userId?: string): string {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);

    if (type === 'tts') {
      return `audio/tts/${timestamp}-${randomId}-${filename}`;
    } else {
      const userPrefix = userId ? `${userId}/` : '';
      return `audio/recordings/${userPrefix}${timestamp}-${randomId}-${filename}`;
    }
  }

  /**
   * Generate a file key for syllabus uploads
   */
  generateSyllabusKey(classId: string, filename: string): string {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    return `docs/syllabus/${classId}/${timestamp}-${randomId}-${filename}`;
  }

  /**
   * Generate a file key for student media uploads (video, photo, audio)
   */
  generateMediaKey(studentId: string, mediaType: 'video' | 'photo' | 'audio', filename: string): string {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `media/${studentId}/${mediaType}/${timestamp}-${randomId}-${sanitized}`;
  }

  /**
   * Generate a file key for spelling word images
   */
  generateImageKey(classId: string, listId: string, wordId: string): string {
    return `spelling-images/${classId}/${listId}/${wordId}.png`;
  }

  /**
   * Generate a file key for practice question images
   */
  generatePracticeImageKey(unit: number, questionId: string): string {
    return `practice-images/unit-${unit}/${questionId}.png`;
  }

  /**
   * Generate a file key for a printable test item image.
   * Layout: test-images/{testId}/{itemId}.png
   */
  generateTestImageKey(testId: string, itemId: string): string {
    return `test-images/${testId}/${itemId}.png`;
  }

  /**
   * Generate a file key for a printable test listening-item audio clip.
   * Versioned (timestamp) so a regenerated clip gets a fresh URL past any cache.
   * Layout: test-audio/{testId}/{itemId}-{version}.mp3
   */
  generateTestAudioKey(testId: string, itemId: string, version: number): string {
    return `test-audio/${testId}/${itemId}-${version}.mp3`;
  }

  /**
   * Generate a file key for a reading-passage page illustration.
   * Layout: story-images/{passageId}/page-{pageNumber}.png
   */
  generateStoryImageKey(passageId: string, pageNumber: number): string {
    assertSafePathSegment(passageId, 'passageId');
    assertPositiveInt(pageNumber, 'pageNumber');
    return `story-images/${passageId}/page-${pageNumber}.png`;
  }

  /**
   * Versioned variant of generateStoryImageKey for per-page regeneration.
   * Layout: story-images/{passageId}/page-{pageNumber}.v{version}.png
   *
   * The image proxy at /api/images/[...key] sets Cache-Control:
   * public, max-age=31536000, immutable. Overwriting a key would leave
   * stale images in client caches for up to a year — versioned keys
   * sidestep that. Old versions are orphaned in R2 and swept by a
   * separate janitor job (not in scope here).
   */
  generateStoryImageKeyVersioned(
    passageId: string,
    pageNumber: number,
    version: number,
  ): string {
    assertSafePathSegment(passageId, 'passageId');
    assertPositiveInt(pageNumber, 'pageNumber');
    assertPositiveInt(version, 'version');
    return `story-images/${passageId}/page-${pageNumber}.v${version}.png`;
  }

  /**
   * Generate a file key for a reading-passage page narration.
   * Layout: story-audio/{passageId}/page-{pageNumber}/{voiceId}.mp3
   *
   * voiceId is part of the path so we can regenerate one voice's audio
   * without invalidating the others, and can cache multiple voices per
   * page side-by-side.
   */
  generateStoryAudioKey(passageId: string, pageNumber: number, voiceId: string): string {
    assertSafePathSegment(passageId, 'passageId');
    assertPositiveInt(pageNumber, 'pageNumber');
    assertSafePathSegment(voiceId, 'voiceId');
    return `story-audio/${passageId}/page-${pageNumber}/${voiceId}.mp3`;
  }

  /**
   * Generate a file key for a reading passage's library-thumbnail cover.
   * The cover may be a copy of page 1's image or a separately generated
   * thumbnail; either way it lives at this stable key.
   * Layout: story-images/{passageId}/cover.png
   */
  generateStoryCoverImageKey(passageId: string): string {
    assertSafePathSegment(passageId, 'passageId');
    return `story-images/${passageId}/cover.png`;
  }

  /**
   * Generate a file key for a vocab_matching pair illustration. One image
   * per (passage, vocabulary word) — drives the V2 word→picture matching
   * format. The key is stable: regenerating the same pair in the same
   * passage overwrites in place.
   * Layout: story-images/{passageId}/vocab-{vocabId}.png
   */
  generateStoryVocabImageKey(passageId: string, vocabId: string): string {
    assertSafePathSegment(passageId, 'passageId');
    assertSafePathSegment(vocabId, 'vocabId');
    return `story-images/${passageId}/vocab-${vocabId}.png`;
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(key: string): Promise<{
    contentType?: string;
    contentLength?: number;
    lastModified?: Date;
    metadata?: Record<string, string>;
  } | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.client.send(command);

      return {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        metadata: response.Metadata,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * List objects in the bucket with optional prefix and pagination
   */
  async listObjects(options: {
    prefix?: string;
    continuationToken?: string;
    maxKeys?: number;
  }): Promise<{
    objects: Array<{
      key: string;
      size: number;
      lastModified?: Date;
    }>;
    nextContinuationToken?: string;
    isTruncated?: boolean;
  }> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: options.prefix,
      ContinuationToken: options.continuationToken,
      MaxKeys: options.maxKeys ?? 50,
    });

    const response = await this.client.send(command);

    const objects = (response.Contents ?? []).map((item) => ({
      key: item.Key ?? '',
      size: Number(item.Size ?? 0),
      lastModified: item.LastModified,
    })).filter((item) => item.key.length > 0);

    return {
      objects,
      nextContinuationToken: response.NextContinuationToken ?? undefined,
      isTruncated: response.IsTruncated ?? false,
    };
  }
}

// Export singleton instance
export const r2Client = new R2Client();

export function generateRecordingKey(
  studentId: string,
  assignmentId: string,
  attemptNumber: number,
  extension: string = 'webm'
): string {
  const timestamp = Date.now();
  return `audio/recordings/${studentId}/${assignmentId}/attempt-${attemptNumber}-${timestamp}.${extension}`;
}

// Per-page recordings on a reading passage. Lives in a separate bucket prefix
// from per-assignment recordings so it's easy to inspect / clean up
// independently. {pageNumber} segment is human-readable; the canonical
// (page_id, attempt) identifier still lives in the DB row.
export function generatePassageRecordingKey(
  studentId: string,
  passageId: string,
  pageNumber: number,
  attemptNumber: number,
  extension: string = 'webm'
): string {
  const timestamp = Date.now();
  return `audio/passage-recordings/${studentId}/${passageId}/page-${pageNumber}/attempt-${attemptNumber}-${timestamp}.${extension}`;
}

export async function uploadRecordingToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  await r2Client.uploadFile(key, body, contentType, {
    'artifact-type': 'student-recording',
  });

  // The R2 bucket is private, so direct public URLs aren't fetchable from the
  // browser (CORB blocks the error page). Audio playback goes through the
  // /api/audio/[...key] proxy.
  return r2Client.getProxyUrl(key);
}

/**
 * Normalize a stored audio URL to the /api/audio/[...key] proxy form.
 * Handles legacy rows that were saved as direct R2 public URLs (r2.dev,
 * R2_PUBLIC_URL, or r2.cloudflarestorage.com) before uploadRecordingToR2
 * was fixed to return the proxy URL.
 *
 * R2_PUBLIC_URL in this project points at the account endpoint with no
 * bucket segment, so for every stored URL the path IS the object key —
 * we don't strip a leading segment.
 */
export function toProxyAudioUrl(stored: string): string {
  if (!stored) return stored;
  if (stored.startsWith('/api/audio/')) return stored;
  try {
    const u = new URL(stored);
    const pathname = u.pathname.replace(/^\/+/, '');
    return `/api/audio/${pathname}`;
  } catch {
    return stored;
  }
}

/**
 * Audio object-key prefixes that are a specific student's PRIVATE content
 * (their own recorded voice). Everything else under audio/ — TTS, spelling,
 * story narration, teacher replies — is shared classroom content readable by
 * any authenticated user. Kept in sync with generateRecordingKey /
 * generatePassageRecordingKey; the studentId is the 3rd path segment
 * (audio/recordings/<studentId>/...).
 */
export const SENSITIVE_AUDIO_PREFIXES = [
  'audio/recordings/',
  'audio/passage-recordings/',
] as const;

/**
 * Normalize any stored media reference back to its raw R2 object key:
 *   - proxy URLs:  /api/audio/<key>, /api/images/<key>, /api/media/<key>
 *   - legacy direct-R2 URLs (r2.dev / R2_PUBLIC_URL / r2.cloudflarestorage.com)
 *   - a bare key already
 * Returns null if it can't be resolved. Strips any ?query string (avatar
 * snapshot URLs carry ?v=<ts>). R2_PUBLIC_URL has no bucket segment, so for a
 * direct URL the pathname IS the key — we don't strip a leading segment.
 */
export function r2KeyFromStoredUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  let key: string | null = null;
  for (const prefix of ['/api/audio/', '/api/images/', '/api/media/']) {
    if (stored.startsWith(prefix)) {
      key = stored.slice(prefix.length);
      break;
    }
  }
  if (key === null) {
    if (stored.includes('://')) {
      try {
        key = new URL(stored).pathname.replace(/^\/+/, '');
      } catch {
        return null;
      }
    } else if (!stored.startsWith('/')) {
      key = stored; // already a bare key
    } else {
      return null; // an app path we don't recognize
    }
  }
  key = key.split('?')[0];
  return key.length ? key : null;
}
