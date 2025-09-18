"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import { formatFileSize, formatDuration } from "@/lib/storage/upload-utils";
import type { UploadProgress, UploadResult } from "@/lib/storage/upload-utils";

interface AudioRecorderProps {
  onRecordingComplete?: (result: { success: boolean; publicUrl?: string; key?: string; error?: string }) => void;
  maxDurationSeconds?: number;
  showLivePreview?: boolean;
  disabled?: boolean;
  assignmentId?: string;
}

export function AudioRecorder({
  onRecordingComplete,
  maxDurationSeconds = 300, // 5 minutes default
  showLivePreview = true,
  disabled = false,
  assignmentId,
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

      // Try most compatible formats first
      let mimeType = 'audio/webm'; // ultimate fallback
      if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
      } else if (MediaRecorder.isTypeSupported('audio/mpeg')) {
        mimeType = 'audio/mpeg';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType,
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

    // Always use assignment-specific upload path if assignmentId is provided
    if (assignmentId) {
      await uploadAssignmentRecording();
    } else {
      // For generic practice mode, we'll just show success without upload
      setUploadResult({
        success: true,
        publicUrl: audioUrl,
        key: 'practice-recording'
      });

      if (onRecordingComplete) {
        onRecordingComplete({
          success: true,
          publicUrl: audioUrl,
          key: 'practice-recording'
        });
      }
    }
  };

  const uploadAssignmentRecording = async () => {
    if (!audioBlob || !assignmentId) return;

    // Convert blob to File with clean MIME type
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const cleanMimeType = audioBlob.type.split(';')[0].trim();
    const file = new File([audioBlob], `recording-${timestamp}.webm`, {
      type: cleanMimeType
    });

    setIsUploading(true);
    setUploadProgress({ loaded: 0, total: file.size, percentage: 0 });
    setError('');

    try {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('assignmentId', assignmentId);

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (!prev || prev.percentage >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          const newPercentage = Math.min(prev.percentage + 10, 90);
          return {
            loaded: (newPercentage / 100) * file.size,
            total: file.size,
            percentage: newPercentage
          };
        });
      }, 200);

      const response = await fetch('/api/recordings/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress({ loaded: file.size, total: file.size, percentage: 100 });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();

      setUploadResult({
        success: true,
        publicUrl: result.recording?.audioUrl,
        key: result.recording?.id
      });

      if (onRecordingComplete) {
        onRecordingComplete({
          success: true,
          publicUrl: result.recording?.audioUrl,
          key: result.recording?.id
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setError(errorMessage);
      setUploadResult({ success: false, error: errorMessage });

      if (onRecordingComplete) {
        onRecordingComplete({ success: false, error: errorMessage });
      }
    } finally {
      setIsUploading(false);
    }
  };


  const progressPercentage = (recordingTime / maxDurationSeconds) * 100;

  return (
    <div className="w-full space-y-6">
      {/* Main Recording Button */}
      {!isRecording && !audioBlob ? (
        <Button
          size="lg"
          onClick={startRecording}
          disabled={disabled}
          className="w-full h-24 text-2xl bg-green-600 hover:bg-green-700 text-white rounded-2xl shadow-lg transform transition-transform hover:scale-105"
        >
          <Mic className="w-12 h-12 mr-4" />
          Start Recording
        </Button>
      ) : isRecording ? (
        <div className="space-y-4">
          <Button
            size="lg"
            onClick={stopRecording}
            className="w-full h-24 text-2xl bg-red-600 hover:bg-red-700 text-white rounded-2xl shadow-lg animate-pulse"
          >
            <Square className="w-12 h-12 mr-4" />
            Stop Recording
          </Button>

          {/* Recording Progress */}
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
            <div className="flex items-center justify-between text-lg font-medium text-red-800 mb-3">
              <span>🎤 Recording...</span>
              <span className="font-mono">
                {formatDuration(recordingTime)} / {formatDuration(maxDurationSeconds)}
              </span>
            </div>
            <Progress value={progressPercentage} className="h-3 bg-red-100" />
            {recordingTime >= maxDurationSeconds * 0.9 && (
              <p className="text-sm text-red-700 flex items-center gap-2 mt-2">
                <AlertCircle className="w-4 h-4" />
                Recording will stop automatically at {formatDuration(maxDurationSeconds)}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Recording Complete - Show Playback and Upload */
        <div className="space-y-4">
          {/* Playback Controls */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
            <div className="flex items-center justify-between text-lg font-medium text-blue-800 mb-4">
              <span className="flex items-center gap-2">
                <Volume2 className="w-6 h-6" />
                Your Recording
              </span>
              <span className="font-mono">{formatDuration(recordingTime)}</span>
            </div>

            <div className="flex gap-3">
              <Button
                size="lg"
                variant="outline"
                onClick={playRecording}
                className="flex-1 h-16 text-lg"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-6 h-6 mr-2" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-6 h-6 mr-2" />
                    Listen
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={clearRecording}
                disabled={isUploading}
                className="h-16 px-6"
              >
                <Trash2 className="w-6 h-6" />
              </Button>
            </div>

            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="hidden"
            />

            {audioBlob && (
              <p className="text-sm text-blue-700 mt-3 text-center">
                File size: {formatFileSize(audioBlob.size)}
              </p>
            )}
          </div>

          {/* Upload Button */}
          {!uploadResult?.success && (
            <Button
              onClick={uploadRecording}
              disabled={isUploading || disabled}
              size="lg"
              className="w-full h-24 text-2xl bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-lg transform transition-transform hover:scale-105"
            >
              {isUploading ? (
                <>
                  <div className="w-8 h-8 animate-spin rounded-full border-4 border-white border-t-transparent mr-4" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-12 h-12 mr-4" />
                  Submit Recording
                </>
              )}
            </Button>
          )}

          {/* Upload Progress */}
          {uploadProgress && isUploading && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-sm font-medium text-blue-800 mb-2">
                <span>Uploading your recording...</span>
                <span>{uploadProgress.percentage}%</span>
              </div>
              <Progress value={uploadProgress.percentage} className="h-3" />
            </div>
          )}

          {/* Success Message */}
          {uploadResult?.success && (
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 text-center">
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-green-800 mb-2">
                Recording uploaded successfully! 🎉
              </h3>
              <p className="text-green-700 mb-4">
                Great job! Your teacher will review your recording.
              </p>
              <Button
                size="lg"
                variant="outline"
                onClick={clearRecording}
                className="text-lg h-12"
              >
                Record Another
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
          <div className="flex items-center gap-3 text-red-800">
            <AlertCircle className="w-8 h-8" />
            <div>
              <h4 className="font-bold text-lg">Oops! Something went wrong</h4>
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}