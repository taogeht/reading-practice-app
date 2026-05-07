"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RecordingAudioPlayerProps {
  recordingId: string;
  fallbackDurationSeconds?: number | null;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RecordingAudioPlayer({
  recordingId,
  fallbackDurationSeconds,
}: RecordingAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(
    fallbackDurationSeconds && fallbackDurationSeconds > 0 ? fallbackDurationSeconds : 0
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
      }
    };
  }, []);

  const ensureUrl = async (): Promise<string | null> => {
    if (presignedUrl) return presignedUrl;
    try {
      setIsLoadingUrl(true);
      setError(null);
      const res = await fetch(`/api/recordings/${recordingId}/download-url`);
      if (!res.ok) throw new Error("Failed to load audio");
      const { downloadUrl } = await res.json();
      setPresignedUrl(downloadUrl);
      return downloadUrl;
    } catch (err) {
      setError("Unable to load recording");
      return null;
    } finally {
      setIsLoadingUrl(false);
    }
  };

  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      return;
    }

    if (!audio.src) {
      const url = await ensureUrl();
      if (!url) return;
      audio.src = url;
    }

    document.querySelectorAll("audio").forEach((other) => {
      if (other !== audio && !other.paused) other.pause();
    });

    try {
      await audio.play();
    } catch {
      setError("Unable to play recording");
    }
  };

  const handleStop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
  };

  const handleSeek = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.src) {
      const url = await ensureUrl();
      if (!url) return;
      audio.src = url;
    }
    const value = Number(e.target.value);
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const sliderMax = duration > 0 ? duration : 0;
  const sliderDisabled = duration <= 0;

  return (
    <div className="flex flex-col gap-2 w-full">
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={(e) => {
          const d = (e.target as HTMLAudioElement).duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onError={() => {
          setIsPlaying(false);
          setError("Unable to play recording");
        }}
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePlayPause}
          disabled={isLoadingUrl}
        >
          {isLoadingUrl ? (
            <div className="w-4 h-4 mr-1 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4 mr-1" />
          ) : (
            <Play className="w-4 h-4 mr-1" />
          )}
          {isLoadingUrl ? "Loading..." : isPlaying ? "Pause" : "Play"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleStop}
          disabled={!isPlaying && currentTime === 0}
        >
          <Square className="w-4 h-4 mr-1" />
          Stop
        </Button>

        <input
          type="range"
          min={0}
          max={sliderMax}
          step={0.1}
          value={Math.min(currentTime, sliderMax)}
          onChange={handleSeek}
          disabled={sliderDisabled}
          className="flex-1 h-2 accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
          aria-label="Seek"
        />

        <div className="text-xs tabular-nums text-gray-600 min-w-[80px] text-right">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
