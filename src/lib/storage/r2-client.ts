import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand
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

export async function uploadRecordingToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  await r2Client.uploadFile(key, body, contentType, {
    'artifact-type': 'student-recording',
  });

  return r2Client.getPublicUrl(key);
}
