"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Volume2, RefreshCw, Sparkles } from "lucide-react";

interface PhonicsWord {
  word: string;
  emoji?: string;
  image?: string;
}
interface PhonicsFamily {
  family: string;
  words: PhonicsWord[];
}
interface PhonicsBlock {
  sound: string;
  description?: string;
  word_families: PhonicsFamily[];
  chant?: string[];
}

// Plays the given word via the browser's built-in speech synthesis. We use
// the en-US voice when available so chants/word lists sound consistent. No
// audio files to host or generate — works offline once the voice is loaded.
function speakWord(word: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  // Cancel any in-flight speech first so rapid taps don't queue up.
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(word);
  utter.lang = 'en-US';
  utter.rate = 0.85;
  // Prefer a female en-US voice — sounds more like the target audience's
  // teacher in most browsers' default voice list.
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => v.lang === 'en-US' && /female|samantha|google/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith('en'));
  if (preferred) utter.voice = preferred;
  window.speechSynthesis.speak(utter);
}

// Renders the rhyming part of a word in a contrasting color so kids see the
// pattern. "pig" → "p" + "ig" highlighted.
function highlightRhyme(word: string, family: string): React.ReactNode {
  const ending = family.replace(/^-/, '').toLowerCase();
  const lower = word.toLowerCase();
  const idx = lower.lastIndexOf(ending);
  if (idx === -1 || idx === 0) return <span>{word}</span>;
  return (
    <span>
      <span>{word.slice(0, idx)}</span>
      <span className="text-amber-600">{word.slice(idx)}</span>
    </span>
  );
}

interface FlipCardProps {
  word: PhonicsWord;
  family: string;
}

function FlipCard({ word, family }: FlipCardProps) {
  const [flipped, setFlipped] = useState(false);

  const handleClick = () => {
    const next = !flipped;
    setFlipped(next);
    if (next) speakWord(word.word);
  };

  const replay = (e: React.MouseEvent) => {
    e.stopPropagation();
    speakWord(word.word);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group relative w-full aspect-square rounded-2xl border-2 transition-all duration-300 ease-out shadow-sm hover:shadow-md ${
        flipped
          ? 'border-amber-300 bg-amber-50 [transform:rotateY(0deg)]'
          : 'border-indigo-200 bg-white'
      }`}
      style={{ perspective: '1000px' }}
      aria-label={`Phonics card for ${word.word}`}
    >
      <div
        className="absolute inset-0 flex items-center justify-center transition-opacity duration-200"
        style={{ opacity: flipped ? 0 : 1, pointerEvents: flipped ? 'none' : 'auto' }}
      >
        <div className="text-4xl sm:text-5xl font-bold text-gray-900">
          {highlightRhyme(word.word, family)}
        </div>
      </div>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 transition-opacity duration-200"
        style={{ opacity: flipped ? 1 : 0, pointerEvents: flipped ? 'auto' : 'none' }}
      >
        {word.emoji ? (
          <div className="text-5xl sm:text-6xl" aria-hidden>
            {word.emoji}
          </div>
        ) : (
          <div className="text-3xl font-bold text-amber-800">
            {highlightRhyme(word.word, family)}
          </div>
        )}
        <div className="flex items-center gap-1 text-xs text-amber-700">
          <button
            type="button"
            onClick={replay}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/70 hover:bg-white transition-colors border border-amber-200"
            aria-label="Hear again"
          >
            <Volume2 className="w-3 h-3" />
            <span>Hear again</span>
          </button>
        </div>
        <div className="text-sm font-semibold text-amber-900">{word.word}</div>
      </div>
    </button>
  );
}

interface AvailableUnit {
  unit: number;
  sound: string;
  topic: string;
}

export function PhonicsDeck() {
  const [phonics, setPhonics] = useState<PhonicsBlock | null>(null);
  const [unit, setUnit] = useState<number | null>(null);
  const [availableUnits, setAvailableUnits] = useState<AvailableUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Voices on some browsers (especially Chrome) load asynchronously after
  // the first speechSynthesis access. We trigger a getVoices() once on mount
  // to warm the cache so the first tap doesn't fall back silently.
  const voicesPrimed = useRef(false);

  useEffect(() => {
    if (
      !voicesPrimed.current &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window
    ) {
      window.speechSynthesis.getVoices();
      voicesPrimed.current = true;
    }
  }, []);

  // Loader for both initial mount and switching units. The API returns the
  // available unit list every time so the picker stays in sync if a teacher
  // adds new content.
  const load = async (targetUnit?: number) => {
    setLoading(true);
    setError(null);
    try {
      const url =
        typeof targetUnit === 'number'
          ? `/api/student/phonics?unit=${targetUnit}`
          : '/api/student/phonics';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load');
      setPhonics(data.phonics);
      setUnit(data.unit);
      setAvailableUnits(data.availableUnits ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalWords = useMemo(
    () =>
      phonics?.word_families.reduce((sum, f) => sum + f.words.length, 0) ?? 0,
    [phonics],
  );

  if (loading) {
    return (
      <div className="py-12 text-center text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
        {error}
      </div>
    );
  }

  // Pill row letting the student switch between any unit that has phonics
  // content. Hidden when there's only one (or none) so it doesn't clutter
  // the screen.
  const unitPicker = availableUnits.length > 1 && (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
        Pick a unit:
      </span>
      {availableUnits.map((u) => {
        const active = u.unit === unit;
        return (
          <button
            key={u.unit}
            type="button"
            onClick={() => void load(u.unit)}
            disabled={loading}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
              active
                ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-50'
            }`}
          >
            Unit {u.unit}
            <span className={`ml-1.5 text-[10px] ${active ? 'text-amber-50/90' : 'text-amber-600'}`}>
              {u.sound}
            </span>
          </button>
        );
      })}
    </div>
  );

  if (!phonics) {
    return (
      <div className="space-y-4">
        {unitPicker}
        <Card>
          <CardContent className="py-10 text-center text-gray-500">
            <Sparkles className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="text-sm">Phonics for Unit {unit ?? '?'} aren&apos;t set up yet.</p>
            {availableUnits.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                Try one of the other units above —{' '}
                {availableUnits.map((u, i) => (
                  <span key={u.unit}>
                    Unit {u.unit}
                    {i < availableUnits.length - 1 ? ', ' : ''}
                  </span>
                ))}{' '}
                {availableUnits.length === 1 ? 'has' : 'have'} phonics ready.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {unitPicker}
      <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h2 className="text-xl font-bold text-amber-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-600" />
            Phonics — {phonics.sound}
          </h2>
          <Badge variant="outline" className="bg-white border-amber-300 text-amber-800">
            Unit {unit} · {totalWords} word{totalWords === 1 ? '' : 's'}
          </Badge>
        </div>
        {phonics.description && (
          <p className="text-sm text-amber-800/80">{phonics.description}</p>
        )}
        <p className="text-xs text-amber-700/80 mt-2">
          Tap a card to hear the word and see the picture.
        </p>
      </div>

      {phonics.word_families.map((family) => (
        <div key={family.family} className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-gray-800">
              The <span className="text-amber-600 font-mono">{family.family}</span> family
            </h3>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => family.words.forEach((w, i) => setTimeout(() => speakWord(w.word), i * 700))}
              className="h-7 text-xs gap-1 text-amber-700 hover:text-amber-900"
              title="Hear all words in this family"
            >
              <RefreshCw className="w-3 h-3" />
              Hear all
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {family.words.map((w) => (
              <FlipCard key={w.word} word={w} family={family.family} />
            ))}
          </div>
        </div>
      ))}

      {phonics.chant && phonics.chant.length > 0 && (
        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-purple-900 flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                Chant time!
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  phonics.chant!.forEach((line, i) =>
                    setTimeout(() => speakWord(line), i * 1400),
                  )
                }
                className="h-7 text-xs"
              >
                <Volume2 className="w-3 h-3 mr-1" />
                Read it
              </Button>
            </div>
            <ul className="space-y-1 text-sm text-purple-900 italic">
              {phonics.chant.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
