"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    BookA,
    Play,
    Pause,
    Loader2,
    Volume2,
} from "lucide-react";

interface SpellingWord {
    id: string;
    word: string;
    syllables: string[] | null; // Stored syllables from dictionary API
    audioUrl: string | null;
    orderIndex: number;
}

interface SpellingList {
    id: string;
    title: string;
    weekNumber: number | null;
    active: boolean;
    createdAt: string;
    words: SpellingWord[];
    class: {
        id: string;
        name: string;
    };
}

// Vibrant colors for syllables - kid-friendly and high contrast
const SYLLABLE_COLORS = [
    { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-300" },
    { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-300" },
    { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
    { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-300" },
    { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-300" },
    { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
];

/**
 * Simple syllable splitting algorithm for English words.
 * This uses common patterns - not perfect but good for educational purposes.
 */
function splitIntoSyllables(word: string): string[] {
    const lower = word.toLowerCase();

    // Very short words are one syllable
    if (lower.length <= 3) {
        return [word];
    }

    const vowels = "aeiouy";
    const syllables: string[] = [];
    let currentSyllable = "";
    let prevWasVowel = false;

    for (let i = 0; i < word.length; i++) {
        const char = word[i];
        const lowerChar = char.toLowerCase();
        const isVowel = vowels.includes(lowerChar);
        const nextChar = i < word.length - 1 ? word[i + 1].toLowerCase() : "";
        const isNextVowel = vowels.includes(nextChar);

        currentSyllable += char;

        // Check for syllable break conditions
        if (isVowel && !prevWasVowel) {
            // After a vowel, if next char is consonant followed by vowel, break after consonant
            if (i < word.length - 2 && !isNextVowel && vowels.includes(word[i + 2]?.toLowerCase() || "")) {
                // Continue to include the consonant
            } else if (i < word.length - 1 && !isNextVowel) {
                // Current is vowel, next is consonant - might be end of syllable
                // Check if there's more word after
                if (i < word.length - 2) {
                    // Look ahead - if pattern is VC-CV, break between consonants
                    const afterNext = word[i + 2]?.toLowerCase() || "";
                    if (!vowels.includes(nextChar) && !vowels.includes(afterNext)) {
                        // Two consonants - break between them
                        currentSyllable += word[i + 1];
                        syllables.push(currentSyllable);
                        currentSyllable = "";
                        i++; // Skip the consonant we just added
                    }
                }
            }
        }

        // Simple break: if we have a good chunk and hit a vowel transition
        if (currentSyllable.length >= 2 && prevWasVowel && !isVowel && isNextVowel && i < word.length - 1) {
            syllables.push(currentSyllable);
            currentSyllable = "";
        }

        prevWasVowel = isVowel;
    }

    // Add remaining
    if (currentSyllable) {
        syllables.push(currentSyllable);
    }

    // If we ended up with just one syllable, try a simpler approach
    if (syllables.length === 1 && word.length > 4) {
        return simpleSyllableSplit(word);
    }

    return syllables.length > 0 ? syllables : [word];
}

/**
 * Simpler fallback syllable split based on vowel groups
 */
function simpleSyllableSplit(word: string): string[] {
    const vowels = "aeiouy";
    const result: string[] = [];
    let current = "";
    let vowelCount = 0;

    for (let i = 0; i < word.length; i++) {
        const char = word[i];
        const isVowel = vowels.includes(char.toLowerCase());

        current += char;

        if (isVowel) {
            vowelCount++;
        }

        // After we have at least one vowel and hit a consonant before another vowel
        if (vowelCount > 0 && !isVowel && i < word.length - 1) {
            const nextIsVowel = vowels.includes(word[i + 1].toLowerCase());
            if (nextIsVowel && current.length >= 2) {
                result.push(current);
                current = "";
                vowelCount = 0;
            }
        }
    }

    if (current) {
        result.push(current);
    }

    return result.length > 0 ? result : [word];
}

/**
 * Renders a word with color-coded syllables
 * Uses stored syllables if available, falls back to algorithm
 */
function SyllableWord({ word, syllables: storedSyllables, isPlaying }: {
    word: string;
    syllables: string[] | null;
    isPlaying: boolean;
}) {
    // Use stored syllables if available, otherwise use fallback algorithm
    const syllables = (storedSyllables && storedSyllables.length > 0)
        ? storedSyllables
        : splitIntoSyllables(word);

    return (
        <div className="flex flex-wrap items-center gap-1">
            {syllables.map((syllable, index) => {
                const colors = SYLLABLE_COLORS[index % SYLLABLE_COLORS.length];
                return (
                    <span
                        key={index}
                        className={`
              px-2 py-1 rounded-lg font-bold text-lg
              border-2 transition-all
              ${colors.bg} ${colors.text} ${colors.border}
              ${isPlaying ? "scale-110 shadow-md" : ""}
            `}
                    >
                        {syllable}
                    </span>
                );
            })}
        </div>
    );
}

export function StudentSpellingSection() {
    const [lists, setLists] = useState<SpellingList[]>([]);
    const [loading, setLoading] = useState(true);
    const [playingWordId, setPlayingWordId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        fetchSpellingLists();
    }, []);

    const fetchSpellingLists = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/student/spelling-lists");
            if (response.ok) {
                const data = await response.json();
                setLists(data);
            }
        } catch (error) {
            console.error("Error fetching spelling lists:", error);
        } finally {
            setLoading(false);
        }
    };

    const playWord = (word: SpellingWord) => {
        if (!word.audioUrl) return;

        if (audioRef.current) {
            audioRef.current.pause();
        }

        if (playingWordId === word.id) {
            setPlayingWordId(null);
            return;
        }

        const audio = new Audio(word.audioUrl);
        audioRef.current = audio;
        setPlayingWordId(word.id);

        audio.onended = () => setPlayingWordId(null);
        audio.onerror = () => setPlayingWordId(null);
        audio.play();
    };

    if (loading) {
        return (
            <Card className="border-2 border-purple-200">
                <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50">
                    <CardTitle className="flex items-center gap-2 text-purple-700">
                        <BookA className="w-6 h-6" />
                        Spelling Words
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (lists.length === 0) {
        return null;
    }

    return (
        <Card className="border-2 border-purple-200 overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-100">
                <CardTitle className="flex items-center gap-2 text-purple-700">
                    <BookA className="w-6 h-6" />
                    🎯 Spelling Words
                </CardTitle>
                <p className="text-sm text-purple-600 mt-1">
                    Tap the play button to hear each word! Colors show the syllables.
                </p>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
                {lists.map((list) => (
                    <div key={list.id} className="space-y-4">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-xl text-gray-800">{list.title}</h3>
                            {list.weekNumber && (
                                <Badge variant="outline" className="bg-purple-50 border-purple-300 text-purple-700">
                                    Week {list.weekNumber}
                                </Badge>
                            )}
                            <Badge variant="secondary" className="text-xs">
                                {list.class.name}
                            </Badge>
                        </div>

                        <div className="space-y-3">
                            {list.words.map((word) => (
                                <div
                                    key={word.id}
                                    className={`
                    flex items-center gap-4 p-4 rounded-2xl border-2 transition-all
                    ${word.audioUrl
                                            ? "bg-white hover:bg-purple-50 hover:border-purple-300 cursor-pointer hover:shadow-md"
                                            : "bg-gray-50 cursor-not-allowed opacity-60"
                                        }
                    ${playingWordId === word.id
                                            ? "border-purple-500 bg-purple-50 shadow-lg ring-2 ring-purple-200"
                                            : "border-gray-200"
                                        }
                  `}
                                    onClick={() => playWord(word)}
                                >
                                    {/* Play Button */}
                                    <button
                                        disabled={!word.audioUrl}
                                        className={`
                      w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0
                      transition-all shadow-md
                      ${playingWordId === word.id
                                                ? "bg-purple-600 text-white scale-110"
                                                : "bg-gradient-to-br from-purple-500 to-pink-500 text-white hover:scale-105"
                                            }
                      ${!word.audioUrl ? "opacity-50" : ""}
                    `}
                                    >
                                        {playingWordId === word.id ? (
                                            <Pause className="w-7 h-7" />
                                        ) : (
                                            <Play className="w-7 h-7 ml-1" />
                                        )}
                                    </button>

                                    {/* Word with Syllables */}
                                    <div className="flex-1">
                                        <SyllableWord
                                            word={word.word}
                                            syllables={word.syllables}
                                            isPlaying={playingWordId === word.id}
                                        />
                                    </div>

                                    {/* Sound indicator when playing */}
                                    {playingWordId === word.id && (
                                        <div className="flex items-center gap-1">
                                            <Volume2 className="w-5 h-5 text-purple-600 animate-pulse" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
