'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Loader2, Video, Image as ImageIcon, Music, Play } from 'lucide-react';
import { MediaViewerModal } from './media-viewer-modal';

interface MediaItem {
  id: string;
  mediaType: 'video' | 'photo' | 'audio';
  title: string;
  description: string | null;
  fileUrl: string;
  fileKey: string;
  playbackUrl: string | null;
  fileSizeBytes: number;
  mimeType: string;
  createdAt: string;
  uploadedByFirstName: string;
  uploadedByLastName: string;
}

export function StudentMediaGallery({ studentId }: { studentId: string }) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);

  useEffect(() => {
    const fetchMedia = async () => {
      try {
        const res = await fetch(`/api/student-media?studentId=${studentId}`);
        if (res.ok) {
          const data = await res.json();
          setMedia(data.media);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchMedia();
  }, [studentId]);

  // Don't render anything if no media exists
  if (!loading && media.length === 0) {
    return null;
  }

  if (loading) {
    return null; // Don't show a loading skeleton — just render nothing until ready
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Video className="w-5 h-5 text-purple-500" />
            My Media
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {media.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onClick={() => setSelectedMedia(item)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <MediaViewerModal
        media={selectedMedia}
        open={!!selectedMedia}
        onOpenChange={(open) => !open && setSelectedMedia(null)}
      />
    </>
  );
}

function MediaCard({ item, onClick }: { item: MediaItem; onClick: () => void }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloading(true);
    try {
      const res = await fetch(`/api/student-media/download/${item.id}`);
      if (res.ok) {
        const { url } = await res.json();
        const a = document.createElement('a');
        a.href = url;
        a.download = item.title;
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
    <div
      className="group relative border rounded-xl overflow-hidden bg-white hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      {/* Preview area */}
      <div className="aspect-square relative flex items-center justify-center bg-gray-50">
        {item.mediaType === 'photo' && (
          <img
            src={item.fileUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
        {item.mediaType === 'video' && (
          <div className="w-full h-full bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center">
            <div className="w-14 h-14 bg-white/80 rounded-full flex items-center justify-center shadow-md">
              <Play className="w-7 h-7 text-purple-600 ml-1" />
            </div>
          </div>
        )}
        {item.mediaType === 'audio' && (
          <div className="w-full h-full bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
            <Music className="w-10 h-10 text-green-600" />
          </div>
        )}

        {/* Download button overlay */}
        <Button
          size="sm"
          variant="secondary"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      {/* Title */}
      <div className="p-2">
        <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
        <p className="text-xs text-gray-400">
          {new Date(item.createdAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
