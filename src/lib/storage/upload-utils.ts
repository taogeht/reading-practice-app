/**
 * Utility functions for handling file uploads to Cloudflare R2
 */

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  success: boolean;
  publicUrl?: string;
  key?: string;
  error?: string;
}

/**
 * Upload a file to R2 using a presigned URL
 */
export async function uploadFileToR2(
  file: File,
  presignedUrl: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const progress: UploadProgress = {
          loaded: event.loaded,
          total: event.total,
          percentage: Math.round((event.loaded / event.total) * 100),
        };
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ success: true });
      } else {
        resolve({ 
          success: false, 
          error: `Upload failed with status ${xhr.status}` 
        });
      }
    });

    xhr.addEventListener('error', () => {
      resolve({ 
        success: false, 
        error: 'Upload failed due to network error' 
      });
    });

    xhr.addEventListener('abort', () => {
      resolve({ 
        success: false, 
        error: 'Upload was aborted' 
      });
    });

    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

/**
 * Get presigned URL from our API
 */
export async function getPresignedUploadUrl(
  filename: string,
  contentType: string,
  type: 'tts' | 'recording'
): Promise<{
  presignedUrl: string;
  key: string;
  publicUrl: string;
}> {
  const response = await fetch('/api/upload/presigned-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename,
      contentType,
      type,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get presigned URL');
  }

  return await response.json();
}

/**
 * Complete file upload workflow
 */
export async function uploadAudioFile(
  file: File,
  type: 'tts' | 'recording',
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  try {
    // Get presigned URL
    const { presignedUrl, key, publicUrl } = await getPresignedUploadUrl(
      file.name,
      file.type,
      type
    );

    // Upload file
    const uploadResult = await uploadFileToR2(file, presignedUrl, onProgress);

    if (uploadResult.success) {
      return {
        success: true,
        publicUrl,
        key,
      };
    }

    return uploadResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Validate audio file before upload
 */
export function validateAudioFile(file: File): {
  valid: boolean;
  error?: string;
} {
  const allowedBaseTypes = [
    'audio/mp3',
    'audio/mpeg',
    'audio/wav',
    'audio/webm',
    'audio/ogg',
    'audio/m4a',
    'audio/mp4'
  ];

  const maxSize = 50 * 1024 * 1024; // 50MB

  // Extract base MIME type (remove codecs if present)
  const baseType = file.type.split(';')[0].trim().toLowerCase();

  if (!allowedBaseTypes.includes(baseType)) {
    return {
      valid: false,
      error: 'File type not supported. Please use MP3, WAV, M4A, or OGG format.',
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'File is too large. Maximum size is 50MB.',
    };
  }

  return { valid: true };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration in seconds to MM:SS format
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}