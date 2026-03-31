'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Upload,
  Video,
  Image as ImageIcon,
  Music,
  Trash2,
  Loader2,
  FileUp,
  X,
} from 'lucide-react';
import { formatFileSize } from '@/lib/storage/upload-utils';

interface MediaItem {
  id: string;
  mediaType: 'video' | 'photo' | 'audio';
  title: string;
  description: string | null;
  fileUrl: string;
  fileSizeBytes: number;
  mimeType: string;
  createdAt: string;
  uploadedByFirstName: string;
  uploadedByLastName: string;
}

const MEDIA_TYPE_ICONS = {
  video: Video,
  photo: ImageIcon,
  audio: Music,
};

const MEDIA_TYPE_COLORS = {
  video: 'bg-purple-100 text-purple-700',
  photo: 'bg-blue-100 text-blue-700',
  audio: 'bg-green-100 text-green-700',
};

const ACCEPTED_TYPES = [
  'video/mp4', 'video/quicktime', 'video/webm',
  'image/jpeg', 'image/png', 'image/webp',
  'audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/mp4', 'audio/mp3',
].join(',');

export function TeacherMediaSection({ studentId }: { studentId: string }) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Upload form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMedia = useCallback(async () => {
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
  }, [studentId]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      // Default title to filename without extension
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
      }
      setUploadError(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !title.trim()) return;

    setUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    try {
      // Step 1: Get presigned upload URL from server
      const prepareRes = await fetch('/api/student-media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          title: title.trim(),
          description: description.trim() || null,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        }),
      });

      if (!prepareRes.ok) {
        const data = await prepareRes.json();
        throw new Error(data.error || 'Failed to prepare upload');
      }

      const { presignedUrl, media } = await prepareRes.json();

      // Step 2: Upload file directly to R2 via presigned URL
      const xhr = new XMLHttpRequest();

      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload to storage failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.open('PUT', presignedUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      // Reset form and refresh list
      setFile(null);
      setTitle('');
      setDescription('');
      setShowUploadForm(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchMedia();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/student-media/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setMedia((prev) => prev.filter((m) => m.id !== deleteId));
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileUp className="w-5 h-5 text-blue-600" />
              Student Media
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setShowUploadForm(!showUploadForm)}
              variant={showUploadForm ? 'outline' : 'default'}
            >
              {showUploadForm ? (
                <>
                  <X className="w-4 h-4 mr-1" /> Cancel
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-1" /> Upload
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showUploadForm && (
            <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="media-file">File</Label>
                <Input
                  ref={fileInputRef}
                  id="media-file"
                  type="file"
                  accept={ACCEPTED_TYPES}
                  onChange={handleFileSelect}
                  disabled={uploading}
                />
                {file && (
                  <p className="text-xs text-gray-500">
                    {file.name} ({formatFileSize(file.size)})
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="media-title">Title</Label>
                <Input
                  id="media-title"
                  placeholder="e.g., In-Class Reading - March 30"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={uploading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="media-desc">Note (optional)</Label>
                <Textarea
                  id="media-desc"
                  placeholder="Add a note about this media..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={uploading}
                  rows={2}
                />
              </div>
              {uploadError && (
                <p className="text-sm text-red-600">{uploadError}</p>
              )}
              {uploading && (
                <div className="space-y-1">
                  <Progress value={uploadProgress} className="h-2" />
                  <p className="text-xs text-gray-500 text-center">{uploadProgress}%</p>
                </div>
              )}
              <Button
                onClick={handleUpload}
                disabled={!file || !title.trim() || uploading}
                size="sm"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {uploading ? 'Uploading...' : 'Upload Media'}
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading media...
            </div>
          ) : media.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">
              No media uploaded yet. Click "Upload" to add videos, photos, or audio to this student's account.
            </p>
          ) : (
            <div className="space-y-2">
              {media.map((item) => {
                const Icon = MEDIA_TYPE_ICONS[item.mediaType];
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between border rounded-lg p-3 bg-white"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-lg ${MEDIA_TYPE_COLORS[item.mediaType]}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Badge variant="outline" className="text-xs px-1.5 py-0">
                            {item.mediaType}
                          </Badge>
                          <span>{formatFileSize(item.fileSizeBytes)}</span>
                          <span>
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteId(item.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => !deleting && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Media</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this media? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
