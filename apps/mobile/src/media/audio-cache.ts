import { Directory, File, Paths } from 'expo-file-system';
import { mobileApi } from '@/api/client';

const mediaDirectory = new Directory(Paths.cache, 'starling-rise-media');
const downloads = new Map<string, Promise<string>>();

function safeCacheName(cacheKey: string): string {
  const sanitized = cacheKey.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100);
  return sanitized || 'story-audio';
}

function sourceHash(source: string): string {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function audioExtension(source: string): string {
  const pathname = (() => {
    try {
      return new URL(source, 'https://starling-rise.invalid').pathname;
    } catch {
      return '';
    }
  })();
  const extension = pathname.split('.').pop()?.toLowerCase();
  return extension && ['aac', 'm4a', 'mp3', 'mp4', 'ogg', 'wav'].includes(extension)
    ? extension
    : 'mp3';
}

async function cacheAudio(cacheKey: string, source: string): Promise<string> {
  mediaDirectory.create({ idempotent: true, intermediates: true });
  const file = new File(
    mediaDirectory,
    `${safeCacheName(cacheKey)}-${sourceHash(source)}.${audioExtension(source)}`,
  );
  if (file.exists && (file.info().size ?? 0) > 0) return file.uri;

  try {
    const { bytes } = await mobileApi.downloadAudio(source);
    file.create({ intermediates: true, overwrite: true });
    file.write(bytes);
    return file.uri;
  } catch (error) {
    if (file.exists) file.delete();
    throw error;
  }
}

export function getCachedAudio(cacheKey: string, source: string): Promise<string> {
  const downloadKey = `${cacheKey}:${source}`;
  const existing = downloads.get(downloadKey);
  if (existing) return existing;

  const download = cacheAudio(cacheKey, source).finally(() => {
    downloads.delete(downloadKey);
  });
  downloads.set(downloadKey, download);
  return download;
}

export function clearMediaCache(): void {
  downloads.clear();
  if (mediaDirectory.exists) mediaDirectory.delete();
}
