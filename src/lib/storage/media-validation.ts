export const MEDIA_LIMITS = {
  video: {
    maxSize: 200 * 1024 * 1024, // 200 MB
    allowedTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
    label: 'MP4, MOV, or WebM',
  },
  photo: {
    maxSize: 20 * 1024 * 1024, // 20 MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    label: 'JPEG, PNG, or WebP',
  },
  audio: {
    maxSize: 50 * 1024 * 1024, // 50 MB
    allowedTypes: ['audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/mp4', 'audio/mp3'],
    label: 'MP3, WAV, or M4A',
  },
} as const;

export type MediaType = keyof typeof MEDIA_LIMITS;

export const ALL_ALLOWED_TYPES = [
  ...MEDIA_LIMITS.video.allowedTypes,
  ...MEDIA_LIMITS.photo.allowedTypes,
  ...MEDIA_LIMITS.audio.allowedTypes,
];

export function detectMediaType(mimeType: string): MediaType | null {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  for (const [type, config] of Object.entries(MEDIA_LIMITS)) {
    if ((config.allowedTypes as readonly string[]).includes(base)) {
      return type as MediaType;
    }
  }
  return null;
}

export function validateMediaFile(file: File, mediaType?: MediaType): { valid: boolean; error?: string; detectedType?: MediaType } {
  const base = file.type.split(';')[0].trim().toLowerCase();
  const detected = detectMediaType(base);

  if (!detected) {
    return { valid: false, error: `File type "${file.type}" is not supported. Allowed types: video (MP4, MOV, WebM), photo (JPEG, PNG, WebP), audio (MP3, WAV, M4A).` };
  }

  if (mediaType && detected !== mediaType) {
    return { valid: false, error: `Expected a ${mediaType} file but got a ${detected} file.` };
  }

  const limits = MEDIA_LIMITS[detected];
  if (file.size > limits.maxSize) {
    const maxMB = limits.maxSize / (1024 * 1024);
    return { valid: false, error: `File is too large. Maximum size for ${detected} is ${maxMB}MB.` };
  }

  return { valid: true, detectedType: detected };
}
