"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Volume2, 
  AlertCircle, 
  CheckCircle, 
  Loader2,
  Play,
  Pause
} from "lucide-react";

interface Story {
  id: string;
  title: string;
  content: string;
  wordCount?: number | null;
}

interface TTSGenerationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  story: Story;
  onSuccess?: () => void;
}

interface Voice {
  voice_id: string;
  name: string;
  category?: string;
  description?: string;
  languageCode?: string;
}

export function TTSGenerationDialog({
  open,
  onOpenChange,
  story,
  onSuccess,
}: TTSGenerationDialogProps) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  useEffect(() => {
    if (open) {
      fetchVoices();
    } else {
      // Reset state when dialog closes
      setError(null);
      setSuccess(false);
      setGenerationProgress(0);
      setIsGenerating(false);
      if (previewAudio) {
        previewAudio.pause();
        setPreviewAudio(null);
        setIsPreviewPlaying(false);
      }
    }
  }, [open, story.content, previewAudio]);

  const fetchVoices = async () => {
    setIsLoadingVoices(true);
    setError(null);
    try {
      const response = await fetch('/api/tts/voices');
      if (!response.ok) {
        throw new Error('Failed to fetch voices');
      }
      const data = await response.json();
      setVoices(data.voices || []);
      
      // Auto-select first recommended voice if available
      if (data.recommended && data.recommended.length > 0) {
        setSelectedVoiceId(data.recommended[0].voice_id);
      } else if (data.voices && data.voices.length > 0) {
        setSelectedVoiceId(data.voices[0].voice_id);
      }
    } catch (error) {
      setError('Failed to load voices. Please try again.');
      console.error('Error fetching voices:', error);
    } finally {
      setIsLoadingVoices(false);
    }
  };

  const generatePreviewAudio = async () => {
    if (!selectedVoiceId) return;
    
    try {
      const previewText = story.content.substring(0, 100) + "...";
      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: previewText,
          voiceId: selectedVoiceId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.audioUrl) {
          const audio = new Audio(data.audioUrl);
          audio.addEventListener('ended', () => setIsPreviewPlaying(false));
          audio.addEventListener('pause', () => setIsPreviewPlaying(false));
          audio.addEventListener('play', () => setIsPreviewPlaying(true));
          setPreviewAudio(audio);
          audio.play();
        }
      }
    } catch (error) {
      console.error('Error generating preview:', error);
    }
  };

  const togglePreview = () => {
    if (!previewAudio) {
      generatePreviewAudio();
    } else if (isPreviewPlaying) {
      previewAudio.pause();
    } else {
      previewAudio.play();
    }
  };

  const handleGenerate = async () => {
    if (!selectedVoiceId) {
      setError('Please select a voice');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGenerationProgress(0);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setGenerationProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 10;
        });
      }, 1000);

      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storyId: story.id,
          voiceId: selectedVoiceId,
        }),
      });

      clearInterval(progressInterval);
      setGenerationProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Generation failed');
      }

      const data = await response.json();
      
      if (data.success) {
        setSuccess(true);
        setTimeout(() => {
          onOpenChange(false);
          onSuccess?.();
        }, 2000);
      } else {
        throw new Error(data.error || 'Generation failed');
      }
    } catch (error) {
      console.error('Error generating TTS:', error);
      setError(error instanceof Error ? error.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const selectedVoice = voices.find(voice => voice.voice_id === selectedVoiceId);
  const estimatedCharacters = story.content ? story.content.length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate Text-to-Speech Audio</DialogTitle>
          <DialogDescription>
            Create an audio version of &ldquo;{story.title}&rdquo; for students to listen along
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Audio generated successfully! The story now has TTS audio available.
              </AlertDescription>
            </Alert>
          )}

          {/* Story Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{story.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Characters:</span>
                  <span className="ml-2 font-medium">{estimatedCharacters.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Word Count:</span>
                  <span className="ml-2 font-medium">
                    {story.wordCount ? story.wordCount.toLocaleString() : 'N/A'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Voice Selection */}
          <div className="space-y-3">
            <Label htmlFor="voice-select">Select Voice</Label>
            {isLoadingVoices ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="ml-2">Loading voices...</span>
              </div>
            ) : (
              <div className="space-y-3">
                <Select value={selectedVoiceId} onValueChange={setSelectedVoiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map((voice) => (
                      <SelectItem key={voice.voice_id} value={voice.voice_id}>
                        <div className="flex items-center">
                          <span className="font-medium">{voice.name}</span>
                          <span className="ml-2 text-sm text-muted-foreground">
                            {voice.languageCode ? voice.languageCode : 'Voice'}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedVoice && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <div className="font-medium">{selectedVoice.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {selectedVoice.languageCode}
                        {selectedVoice.description && ` • ${selectedVoice.description}`}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={togglePreview}
                      disabled={isLoadingVoices}
                    >
                      {isPreviewPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      <span className="ml-2">Preview</span>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Generation Progress */}
          {isGenerating && (
            <div className="space-y-3">
              <div className="flex items-center">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span className="text-sm">Generating audio...</span>
              </div>
              <Progress value={generationProgress} className="w-full" />
              <p className="text-xs text-muted-foreground">
                This may take a few moments depending on the story length
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !selectedVoiceId || (quotaInfo && !(quotaInfo.hasQuota ?? true))}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 mr-2" />
                Generate Audio
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
