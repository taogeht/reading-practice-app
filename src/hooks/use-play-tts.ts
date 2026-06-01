'use client';

import { useCallback, useRef, useState } from 'react';
import type { UiStringId } from '@/lib/i18n/ui-strings';

// Read-aloud playback for the V2 dashboard's bilingual labels. Mirrors the
// spelling section's mechanic (a single reused Audio element + a "playing id"
// so only one clip plays at a time), but sources the URL from the student-safe
// /api/student/ui-audio allowlist endpoint and falls back to the browser's
// Web Speech API (en-US) when no cached audio is available — exactly the
// graceful-degrade pattern the phonics deck uses.

export function usePlayTts() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Cache resolved label → URL so we don't refetch on every tap.
  const urlCache = useRef<Map<string, string | null>>(new Map());

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPlayingId(null);
  }, []);

  const fallbackSpeak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = 0.9;
    utter.onend = () => setPlayingId((cur) => null);
    window.speechSynthesis.speak(utter);
  }, []);

  // play(id, fallbackText): toggles. id is the UI_STRINGS key; fallbackText is
  // its English text used for Web Speech when no cached clip exists.
  const play = useCallback(
    async (id: UiStringId, fallbackText: string) => {
      // Tapping the currently-playing label stops it.
      if (playingId === id) {
        stop();
        return;
      }
      stop();
      setPlayingId(id);

      let url = urlCache.current.get(id);
      if (url === undefined) {
        try {
          const res = await fetch(`/api/student/ui-audio?key=${encodeURIComponent(id)}`);
          const data = (await res.json()) as { url?: string | null };
          url = data?.url ?? null;
        } catch {
          url = null;
        }
        urlCache.current.set(id, url);
      }

      if (url) {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => setPlayingId((cur) => (cur === id ? null : cur));
        audio.onerror = () => {
          fallbackSpeak(fallbackText);
        };
        try {
          await audio.play();
        } catch {
          fallbackSpeak(fallbackText);
        }
      } else {
        fallbackSpeak(fallbackText);
      }
    },
    [playingId, stop, fallbackSpeak],
  );

  return { play, stop, playingId };
}
