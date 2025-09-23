import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  HeadObjectCommand 
} from "@aws-sdk/client-s3";

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
    
    // For audio files, return a presigned URL that's valid for 7 days
    if (contentType.startsWith('audio/')) {
      return await this.generatePresignedDownloadUrl(key, 7 * 24 * 3600); // 7 days
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
