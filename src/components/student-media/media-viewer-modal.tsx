'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';

interface MediaItem {
  id: string;
  mediaType: 'video' | 'photo' | 'audio';
  title: string;
  description: string | null;
  fileUrl: string;
  playbackUrl: string | null;
  mimeType: string;
  createdAt: string;
  uploadedByFirstName: string;
  uploadedByLastName: string;
}

export function MediaViewerModal({
  media,
  open,
  onOpenChange,
}: {
  media: MediaItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [downloading, setDownloading] = useState(false);

  if (!media) return null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/student-media/download/${media.id}`);
      if (res.ok) {
        const { url } = await res.json();
        const a = document.createElement('a');
        a.href = url;
        a.download = media.title;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      // ignore
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw]">
        <DialogHeader>
          <DialogTitle>{media.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {media.mediaType === 'photo' && (
            <div className="flex justify-center bg-gray-100 rounded-lg overflow-hidden">
              <img
                src={media.fileUrl}
                alt={media.title}
                className="max-h-[60vh] object-contain"
              />
            </div>
          )}

          {media.mediaType === 'video' && media.playbackUrl && (
            <div className="bg-black rounded-lg overflow-hidden">
              <video
                src={media.playbackUrl}
                controls
                className="w-full max-h-[60vh]"
                playsInline
              />
            </div>
          )}

          {media.mediaType === 'audio' && (
            <div className="bg-gray-100 rounded-lg p-6 flex items-center justify-center">
              <audio
                src={media.fileUrl}
                controls
                className="w-full"
              />
            </div>
          )}

          {media.description && (
            <p className="text-sm text-gray-600">{media.description}</p>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Added by {media.uploadedByFirstName} {media.uploadedByLastName} on{' '}
              {new Date(media.createdAt).toLocaleDateString()}
            </p>
            <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-1" />
              )}
              Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
