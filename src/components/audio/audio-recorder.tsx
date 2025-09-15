"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Mic, 
  Square, 
  Play, 
  Pause, 
  Upload, 
  Trash2, 
  CheckCircle,
  AlertCircle,
  Volume2
} from "lucide-react";
import { uploadAudioFile, validateAudioFile, formatFileSize, formatDuration } from "@/lib/storage/upload-utils";
import type { UploadProgress, UploadResult } from "@/lib/storage/upload-utils";

interface AudioRecorderProps {
  onRecordingComplete?: (result: { success: boolean; publicUrl?: string; key?: string; error?: string }) => void;
  maxDurationSeconds?: number;
  showLivePreview?: boolean;
  disabled?: boolean;
}

export function AudioRecorder({
  onRecordingComplete,
  maxDurationSeconds = 300, // 5 minutes default
  showLivePreview = true,
  disabled = false,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string>('');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      stopRecording();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } 
      });
      
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' 
          : 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { 
          type: mediaRecorder.mimeType 
        });
        setAudioBlob(blob);
        
        // Create audio URL for playback
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          if (newTime >= maxDurationSeconds) {
            stopRecording();
          }
          return newTime;
        });
      }, 1000);

    } catch (error) {
      console.error('Error starting recording:', error);
      setError('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const playRecording = async () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error playing recording:', error);
      setError('Could not play recording');
    }
  };

  const clearRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl('');
    setRecordingTime(0);
    setUploadProgress(null);
    setUploadResult(null);
    setError('');
    setIsPlaying(false);
  };

  const uploadRecording = async () => {
    if (!audioBlob) return;

    // Convert blob to File with clean MIME type
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const cleanMimeType = audioBlob.type.split(';')[0].trim();
    const file = new File([audioBlob], `recording-${timestamp}.webm`, {
      type: cleanMimeType
    });

    // Validate file
    const validation = validateAudioFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    setIsUploading(true);
    setUploadProgress({ loaded: 0, total: file.size, percentage: 0 });
    setError('');

    try {
      const result = await uploadAudioFile(
        file,
        'recording',
        (progress) => setUploadProgress(progress)
      );

      setUploadResult(result);

      if (result.success) {
        onRecordingComplete?.(result);
      } else {
        setError(result.error || 'Upload failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setError(errorMessage);
      setUploadResult({ success: false, error: errorMessage });
    } finally {
      setIsUploading(false);
    }
  };

  const getRecordingStatus = () => {
    if (uploadResult?.success) return 'uploaded';
    if (audioBlob) return 'recorded';
    if (isRecording) return 'recording';
    return 'idle';
  };

  const status = getRecordingStatus();
  const progressPercentage = (recordingTime / maxDurationSeconds) * 100;

  return (
    <Card className={`w-full max-w-md ${disabled ? 'opacity-50' : ''}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="w-5 h-5" />
          Audio Recorder
          {status === 'recording' && (
            <Badge variant="destructive" className="animate-pulse">
              Recording
            </Badge>
          )}
          {status === 'recorded' && (
            <Badge variant="secondary">
              Ready to Upload
            </Badge>
          )}
          {status === 'uploaded' && (
            <Badge variant="default" className="bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3 mr-1" />
              Uploaded
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Recording Controls */}
        <div className="flex items-center justify-center">
          {!isRecording && !audioBlob ? (
            <Button
              size="lg"
              onClick={startRecording}
              disabled={disabled}
              className="w-full"
            >
              <Mic className="w-4 h-4 mr-2" />
              Start Recording
            </Button>
          ) : isRecording ? (
            <Button
              size="lg"
              variant="destructive"
              onClick={stopRecording}
              className="w-full"
            >
              <Square className="w-4 h-4 mr-2" />
              Stop Recording
            </Button>
          ) : (
            <div className="flex gap-2 w-full">
              <Button
                size="sm"
                variant="outline"
                onClick={playRecording}
                className="flex-1"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 mr-1" />
                ) : (
                  <Play className="w-4 h-4 mr-1" />
                )}
                {isPlaying ? 'Pause' : 'Play'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={clearRecording}
                disabled={isUploading}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Recording Progress */}
        {isRecording && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Recording time</span>
              <span className="font-mono">
                {formatDuration(recordingTime)} / {formatDuration(maxDurationSeconds)}
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
            {recordingTime >= maxDurationSeconds * 0.9 && (
              <p className="text-xs text-orange-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Recording will stop automatically at {formatDuration(maxDurationSeconds)}
              </p>
            )}
          </div>
        )}

        {/* Audio Playback */}
        {audioUrl && (
          <div className="border rounded-lg p-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
              <span className="flex items-center gap-1">
                <Volume2 className="w-3 h-3" />
                Recording Preview
              </span>
              <span>{formatDuration(recordingTime)}</span>
            </div>
            <audio 
              ref={audioRef}
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="w-full h-8"
              controls={showLivePreview}
            />
            {audioBlob && (
              <p className="text-xs text-muted-foreground mt-2">
                File size: {formatFileSize(audioBlob.size)}
              </p>
            )}
          </div>
        )}

        {/* Upload Section */}
        {audioBlob && !uploadResult?.success && (
          <div className="space-y-3">
            <Button
              onClick={uploadRecording}
              disabled={isUploading || disabled}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Recording
                </>
              )}
            </Button>

            {uploadProgress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span>Upload progress</span>
                  <span>{uploadProgress.percentage}%</span>
                </div>
                <Progress value={uploadProgress.percentage} className="h-2" />
              </div>
            )}
          </div>
        )}

        {/* Success Message */}
        {uploadResult?.success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-green-800 text-sm">
              <CheckCircle className="w-4 h-4" />
              Recording uploaded successfully!
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={clearRecording}
              className="mt-2 w-full"
            >
              Record Another
            </Button>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-800 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}