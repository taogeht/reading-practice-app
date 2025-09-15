"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Play, Pause, Volume2, Clock, BookOpen, User } from "lucide-react";
import { useState, useRef, useEffect } from "react";

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
  createdAt: string;
  creatorFirstName?: string | null;
  creatorLastName?: string | null;
}

interface StoryCardProps {
  story: Story;
  onSelect?: (story: Story) => void;
  showFullContent?: boolean;
  isSelectable?: boolean;
  showAudioControls?: boolean;
  variant?: 'default' | 'compact' | 'detailed';
}

export function StoryCard({
  story,
  onSelect,
  showFullContent = false,
  isSelectable = true,
  showAudioControls = true,
  variant = 'default',
}: StoryCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const hasAudio = !!story.ttsAudioUrl;
  const contentPreview = showFullContent 
    ? story.content 
    : story.content.length > 150 
      ? `${story.content.substring(0, 150)}...` 
      : story.content;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handleLoadStart = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, []);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !hasAudio) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCardClick = () => {
    if (isSelectable && onSelect) {
      onSelect(story);
    }
  };

  if (variant === 'compact') {
    return (
      <Card className={`${isSelectable ? 'cursor-pointer hover:bg-muted/50' : ''} transition-colors`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1" onClick={handleCardClick}>
              <h3 className="font-semibold truncate">{story.title}</h3>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                {story.readingLevel && (
                  <Badge variant="secondary" className="text-xs">
                    {story.readingLevel}
                  </Badge>
                )}
                {story.wordCount && (
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    {story.wordCount} words
                  </span>
                )}
              </div>
            </div>
            {showAudioControls && hasAudio && (
              <Button
                size="sm"
                variant="ghost"
                onClick={togglePlay}
                disabled={isLoading}
                className="ml-2"
              >
                {isLoading ? (
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>
          {hasAudio && <audio ref={audioRef} src={story.ttsAudioUrl!} preload="metadata" />}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${isSelectable ? 'cursor-pointer hover:shadow-md' : ''} transition-shadow`}>
      <CardHeader onClick={handleCardClick}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{story.title}</CardTitle>
            <CardDescription className="mt-1">
              {story.author && `by ${story.author}`}
              {story.creatorFirstName && story.creatorLastName && (
                <span className="text-xs text-muted-foreground ml-2">
                  Added by {story.creatorFirstName} {story.creatorLastName}
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {hasAudio ? (
              <Badge variant="default" className="bg-green-100 text-green-800">
                <Volume2 className="w-3 h-3 mr-1" />
                Audio Ready
              </Badge>
            ) : (
              <Badge variant="secondary">
                No Audio
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-2">
          {story.readingLevel && (
            <Badge variant="outline">{story.readingLevel}</Badge>
          )}
          {story.genre && (
            <Badge variant="outline">{story.genre}</Badge>
          )}
          {story.gradeLevels.length > 0 && (
            <Badge variant="outline">
              Grade {story.gradeLevels.join(', ')}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground leading-relaxed">
            {showFullContent ? (
              <div className="space-y-3">
                {story.content.split(/\n\n|\. (?=[A-Z])/).map((paragraph, index) => (
                  <p key={index} className="leading-loose text-base">
                    {paragraph.trim()}{paragraph.endsWith('.') ? '' : '.'}
                  </p>
                ))}
              </div>
            ) : (
              <p>{contentPreview}</p>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {story.wordCount && (
              <div className="flex items-center gap-1">
                <BookOpen className="w-3 h-3" />
                {story.wordCount} words
              </div>
            )}
            {story.estimatedReadingTimeMinutes && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {story.estimatedReadingTimeMinutes} min read
              </div>
            )}
            {story.ttsAudioDurationSeconds && (
              <div className="flex items-center gap-1">
                <Volume2 className="w-3 h-3" />
                {formatTime(story.ttsAudioDurationSeconds)}
              </div>
            )}
          </div>

          {showAudioControls && hasAudio && (
            <div className="border-t pt-3">
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={togglePlay}
                  disabled={isLoading}
                  variant="outline"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  ) : isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  <span className="ml-2">
                    {isLoading ? 'Loading...' : isPlaying ? 'Pause' : 'Listen'}
                  </span>
                </Button>

                {duration > 0 && (
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                    <Progress 
                      value={duration > 0 ? (currentTime / duration) * 100 : 0} 
                      className="h-2"
                    />
                  </div>
                )}
              </div>
              <audio ref={audioRef} src={story.ttsAudioUrl!} preload="metadata" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}