"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TTSGenerationDialog } from "./tts-generation-dialog";
import { EditStoryDialog } from "./edit-story-dialog";
import {
  ArrowLeft,
  Clock,
  BookOpen,
  Users,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Download,
  Settings,
  User,
  Trash2,
  Archive,
  ArchiveRestore
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Story {
  id: string;
  title: string;
  content: string;
  readingLevel?: string | null;
  gradeLevels: number[];
  wordCount?: number | null;
  estimatedReadingTimeMinutes?: number | null;
  author?: string | null;
  genre?: string | null;
  ttsAudioUrl?: string | null;
  ttsAudioDurationSeconds?: number | null;
  ttsGeneratedAt?: string | null;
  elevenLabsVoiceId?: string | null;
  active?: boolean;
  createdAt: string;
  updatedAt: string;
  creatorFirstName?: string | null;
  creatorLastName?: string | null;
}

interface StoryDetailViewProps {
  story: Story;
}

export function StoryDetailView({ story }: StoryDetailViewProps) {
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTTSDialog, setShowTTSDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  const handlePlayPause = () => {
    if (!story.ttsAudioUrl) return;

    if (isPlaying) {
      audio?.pause();
      setIsPlaying(false);
    } else {
      if (!audio) {
        const newAudio = new Audio(story.ttsAudioUrl);
        newAudio.addEventListener('ended', () => setIsPlaying(false));
        newAudio.addEventListener('pause', () => setIsPlaying(false));
        newAudio.addEventListener('play', () => setIsPlaying(true));
        newAudio.addEventListener('error', (e) => {
          console.error('Audio playback error:', e);
          setIsPlaying(false);
        });
        setAudio(newAudio);
        newAudio.play().catch(error => {
          console.error('Failed to play audio:', error);
          setIsPlaying(false);
        });
      } else {
        audio.play().catch(error => {
          console.error('Failed to play audio:', error);
          setIsPlaying(false);
        });
      }
      setIsPlaying(true);
    }
  };

  const handleRefreshAudio = async () => {
    try {
      // Find the audio file that matches this story ID
      const testResponse = await fetch('/api/test-r2');
      if (testResponse.ok) {
        const testData = await testResponse.json();
        const matchingAudioFile = testData.audioFiles.find((file: { key: string }) =>
          file.key.includes(story.id)
        );
        
        if (matchingAudioFile) {
          // Use the test-r2 POST endpoint to fix the story
          const fixResponse = await fetch('/api/test-r2', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              storyId: story.id,
              audioKey: matchingAudioFile.key
            })
          });
          
          if (fixResponse.ok) {
            alert('Audio URL fixed! Refreshing page...');
            window.location.reload();
            return;
          } else {
            const error = await fixResponse.json();
            console.error('Fix failed:', error);
          }
        } else {
          alert('No audio file found for this story in R2 bucket.');
          return;
        }
      }
      
      alert('Failed to refresh audio URL. Please try regenerating the audio instead.');
    } catch (error) {
      console.error('Error refreshing audio URL:', error);
      alert('Failed to refresh audio URL. Please try regenerating the audio instead.');
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const creatorName = story.creatorFirstName && story.creatorLastName
    ? `${story.creatorFirstName} ${story.creatorLastName}`
    : 'Unknown';

  const handleDeleteStory = async () => {
    const confirmed = confirm(
      `Are you sure you want to delete "${story.title}"? This action cannot be undone and will remove all associated assignments and recordings.`
    );

    if (!confirmed) return;

    try {
      setIsDeleting(true);
      const response = await fetch(`/api/stories/${story.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete story');
      }

      // Navigate back to story library after successful deletion
      router.push('/teacher/dashboard');
    } catch (error) {
      console.error('Error deleting story:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete story. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleArchiveStory = async () => {
    const isCurrentlyArchived = story.active === false;
    const action = isCurrentlyArchived ? 'unarchive' : 'archive';
    const confirmed = confirm(
      `Are you sure you want to ${action} "${story.title}"?${!isCurrentlyArchived ? ' This will hide it from students and the main story library.' : ' This will make it visible again in the story library.'}`
    );

    if (!confirmed) return;

    try {
      setIsArchiving(true);
      const response = await fetch(`/api/stories/${story.id}/archive`, {
        method: isCurrentlyArchived ? 'DELETE' : 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to ${action} story`);
      }

      // Refresh the page to show updated story status
      window.location.reload();
    } catch (error) {
      console.error(`Error ${action}ing story:`, error);
      alert(error instanceof Error ? error.message : `Failed to ${action} story. Please try again.`);
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Library
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditDialog(true)}
            >
              <Settings className="w-4 h-4 mr-2" />
              Edit Story
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleArchiveStory}
              disabled={isArchiving}
              className={story.active === false ? "text-blue-600 hover:text-blue-700 hover:border-blue-300" : "text-orange-600 hover:text-orange-700 hover:border-orange-300"}
            >
              {story.active === false ? (
                <ArchiveRestore className="w-4 h-4 mr-2" />
              ) : (
                <Archive className="w-4 h-4 mr-2" />
              )}
              {isArchiving ? (story.active === false ? 'Unarchiving...' : 'Archiving...') : (story.active === false ? 'Unarchive Story' : 'Archive Story')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteStory}
              disabled={isDeleting}
              className="text-red-600 hover:text-red-700 hover:border-red-300"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? 'Deleting...' : 'Delete Story'}
            </Button>
            {story.ttsAudioUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={story.ttsAudioUrl} download>
                  <Download className="w-4 h-4 mr-2" />
                  Download Audio
                </a>
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Story Header */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <CardTitle className="text-3xl">{story.title}</CardTitle>
                    <CardDescription className="text-lg">
                      {story.author && `by ${story.author}`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {story.ttsAudioUrl ? (
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        <Volume2 className="w-3 h-3 mr-1" />
                        Has Audio
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <VolumeX className="w-3 h-3 mr-1" />
                        No Audio
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Metadata */}
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {story.readingLevel && (
                    <div className="flex items-center">
                      <BookOpen className="w-4 h-4 mr-1" />
                      {story.readingLevel}
                    </div>
                  )}
                  {story.gradeLevels.length > 0 && (
                    <div className="flex items-center">
                      <Users className="w-4 h-4 mr-1" />
                      Grade{story.gradeLevels.length > 1 ? 's' : ''} {story.gradeLevels.join(', ')}
                    </div>
                  )}
                  {story.estimatedReadingTimeMinutes && (
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 mr-1" />
                      {story.estimatedReadingTimeMinutes} min read
                    </div>
                  )}
                  {story.wordCount && (
                    <div>
                      {story.wordCount.toLocaleString()} words
                    </div>
                  )}
                </div>

                {story.genre && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{story.genre}</Badge>
                  </div>
                )}
              </CardHeader>
            </Card>

            {/* Audio Controls */}
            {story.ttsAudioUrl && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Audio Version</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Button
                        size="lg"
                        onClick={handlePlayPause}
                        className="rounded-full"
                      >
                        {isPlaying ? (
                          <Pause className="w-5 h-5" />
                        ) : (
                          <Play className="w-5 h-5" />
                        )}
                      </Button>
                      <div>
                        <div className="font-medium">Listen to &ldquo;{story.title}&rdquo;</div>
                        <div className="text-sm text-muted-foreground">
                          {story.ttsAudioDurationSeconds 
                            ? `Duration: ${formatDuration(story.ttsAudioDurationSeconds)}`
                            : 'Audio available'
                          }
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" asChild>
                      <a href={story.ttsAudioUrl} download>
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Story Content */}
            <Card>
              <CardHeader>
                <CardTitle>Story Content</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose max-w-none">
                  <div className="whitespace-pre-wrap text-base leading-relaxed">
                    {story.content}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* TTS Generation */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Text-to-Speech Audio</CardTitle>
                <CardDescription>
                  Generate audio for students to listen along while reading
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {story.ttsAudioUrl ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700">Audio Generated</span>
                    </div>
                    
                    {story.ttsGeneratedAt && (
                      <p className="text-xs text-muted-foreground">
                        Generated {formatDistanceToNow(new Date(story.ttsGeneratedAt), { addSuffix: true })}
                      </p>
                    )}

                    <div className="space-y-2">
                      <Button
                        size="sm"
                        onClick={() => setShowTTSDialog(true)}
                        className="w-full"
                      >
                        <Volume2 className="w-4 h-4 mr-2" />
                        Regenerate Audio
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRefreshAudio}
                        className="w-full"
                      >
                        Refresh Audio URL
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Generate new audio with different voice or refresh existing audio URL
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <VolumeX className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-muted-foreground">No audio available</span>
                    </div>
                    
                    <Button
                      onClick={() => setShowTTSDialog(true)}
                      className="w-full"
                    >
                      <Volume2 className="w-4 h-4 mr-2" />
                      Generate Audio
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Students need audio to practice reading along
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Story Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Story Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-medium">Created by</div>
                    <div className="text-sm text-muted-foreground flex items-center">
                      <User className="w-3 h-3 mr-1" />
                      {creatorName}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-sm font-medium">Created</div>
                    <div className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(story.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-sm font-medium">Last Updated</div>
                    <div className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(story.updatedAt), { addSuffix: true })}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="text-sm font-medium">Usage Stats</div>
                  <div className="text-sm text-muted-foreground">
                    <div>0 assignments created</div>
                    <div>0 student readings</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* TTS Generation Dialog */}
      <TTSGenerationDialog
        open={showTTSDialog}
        onOpenChange={setShowTTSDialog}
        story={story}
        onSuccess={() => {
          // Refresh the page to show updated audio
          window.location.reload();
        }}
      />

      {/* Edit Story Dialog */}
      <EditStoryDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        story={story}
        onSuccess={() => {
          // Refresh the page to show updated story
          window.location.reload();
        }}
      />
    </>
  );
}