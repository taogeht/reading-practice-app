"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Trash2, RotateCw, Loader2, CheckCircle2 } from "lucide-react";

interface Props {
  recordingId: string;
  initialAudioUrl: string | null;
  initialDurationSeconds: number | null;
  // Called whenever the persisted state changes so the parent can refresh its
  // copy of the recording row (audio URL, duration, etc.).
  onChange?: (state: {
    audioUrl: string | null;
    durationSeconds: number | null;
  }) => void;
  disabled?: boolean;
  maxDurationSeconds?: number;
}

type Phase = 'idle' | 'recording' | 'previewing' | 'uploading' | 'saved';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) return 'audio/ogg;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  if (MediaRecorder.isTypeSupported('audio/mpeg')) return 'audio/mpeg';
  return 'audio/webm';
}

export function TeacherReplyRecorder({
  recordingId,
  initialAudioUrl,
  initialDurationSeconds,
  onChange,
  disabled = false,
  maxDurationSeconds = 60,
}: Props) {
  const [phase, setPhase] = useState<Phase>(initialAudioUrl ? 'saved' : 'idle');
  const [savedUrl, setSavedUrl] = useState<string | null>(initialAudioUrl);
  const [savedDuration, setSavedDuration] = useState<number | null>(initialDurationSeconds);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const startRecording = async () => {
    setError(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewBlob(null);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const elapsed = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setPreviewBlob(blob);
        setPreviewUrl(url);
        setPreviewDuration(elapsed);
        setPhase('previewing');
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      recorder.start();
      startedAtRef.current = Date.now();
      setPhase('recording');
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => {
          const next = t + 1;
          if (next >= maxDurationSeconds) {
            stopRecording();
          }
          return Math.min(next, maxDurationSeconds);
        });
      }, 1000);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Microphone access denied or unavailable.',
      );
      setPhase('idle');
    }
  };

  const discardPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setPreviewDuration(0);
    setPhase(savedUrl ? 'saved' : 'idle');
  };

  const uploadPreview = async () => {
    if (!previewBlob) return;
    setPhase('uploading');
    setError(null);
    try {
      const filename = `teacher-reply.${(previewBlob.type.split('/')[1] || 'webm').replace(/;.*$/, '')}`;
      const file = new File([previewBlob], filename, { type: previewBlob.type });
      const form = new FormData();
      form.append('audio', file);
      form.append('durationSeconds', String(previewDuration));
      const res = await fetch(`/api/recordings/${recordingId}/teacher-reply`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      setSavedUrl(data.audioUrl);
      setSavedDuration(data.durationSeconds ?? previewDuration);
      onChange?.({
        audioUrl: data.audioUrl,
        durationSeconds: data.durationSeconds ?? previewDuration,
      });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewBlob(null);
      setPhase('saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      setPhase('previewing');
    }
  };

  const removeSaved = async () => {
    if (!confirm('Remove your voice reply?')) return;
    setPhase('uploading');
    try {
      const res = await fetch(`/api/recordings/${recordingId}/teacher-reply`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Remove failed');
      }
      setSavedUrl(null);
      setSavedDuration(null);
      onChange?.({ audioUrl: null, durationSeconds: null });
      setPhase('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
      setPhase('saved');
    }
  };

  return (
    <div className="border border-purple-200 bg-purple-50/40 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-purple-900">
          <Mic className="w-4 h-4" />
          Voice reply <span className="text-xs font-normal text-purple-700">(optional)</span>
        </div>
        {phase === 'saved' && (
          <span className="flex items-center gap-1 text-xs text-green-700">
            <CheckCircle2 className="w-3 h-3" />
            Attached
          </span>
        )}
      </div>

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>
      )}

      {phase === 'idle' && (
        <Button size="sm" variant="outline" onClick={startRecording} disabled={disabled}>
          <Mic className="w-4 h-4 mr-2" />
          Record reply
        </Button>
      )}

      {phase === 'recording' && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Recording… {formatDuration(recordingTime)} / {formatDuration(maxDurationSeconds)}
          </div>
          <Button size="sm" variant="destructive" onClick={stopRecording}>
            <Square className="w-4 h-4 mr-2" />
            Stop
          </Button>
        </div>
      )}

      {phase === 'previewing' && previewUrl && (
        <div className="space-y-2">
          <audio src={previewUrl} controls className="w-full h-9" />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={uploadPreview}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Use this reply
            </Button>
            <Button size="sm" variant="outline" onClick={discardPreview}>
              <Trash2 className="w-4 h-4 mr-2" />
              Discard
            </Button>
            <span className="text-xs text-gray-500">
              {formatDuration(previewDuration)}
            </span>
          </div>
        </div>
      )}

      {phase === 'uploading' && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Saving…
        </div>
      )}

      {phase === 'saved' && savedUrl && (
        <div className="space-y-2">
          <audio src={savedUrl} controls className="w-full h-9" />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={startRecording} disabled={disabled}>
              <RotateCw className="w-4 h-4 mr-2" />
              Re-record
            </Button>
            <Button size="sm" variant="ghost" onClick={removeSaved} className="text-red-600 hover:text-red-700">
              <Trash2 className="w-4 h-4 mr-2" />
              Remove
            </Button>
            {savedDuration !== null && (
              <span className="text-xs text-gray-500">{formatDuration(savedDuration)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
