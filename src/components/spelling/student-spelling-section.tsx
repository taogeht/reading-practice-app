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
    ChevronDown,
    ChevronUp,
    History,
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
 * Renders a word with color-coded syllables
 * Only shows syllable colors if teacher has set them explicitly
 */
function SyllableWord({ word, syllables: storedSyllables, isPlaying }: {
    word: string;
    syllables: string[] | null;
    isPlaying: boolean;
}) {
    // Only use syllables if teacher has explicitly set them (more than 1 syllable stored)
    const hasSyllables = storedSyllables && storedSyllables.length > 1;

    if (!hasSyllables) {
        // Show plain word without syllable coloring
        return (
            <span className={`font-bold text-xl text-gray-800 ${isPlaying ? "scale-105" : ""}`}>
                {word}
            </span>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-1">
            {storedSyllables.map((syllable, index) => {
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
    const [showPreviousLists, setShowPreviousLists] = useState(false);
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
            <Card className="border-2 border-blue-200">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
                    <CardTitle className="flex items-center gap-2 text-blue-700">
                        <BookA className="w-6 h-6" />
                        Spelling Words
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (lists.length === 0) {
        return null;
    }

    return (
        <Card className="border-2 border-blue-200 overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
                <CardTitle className="flex items-center gap-2 text-blue-700">
                    <BookA className="w-6 h-6" />
                    🎯 Spelling Words
                </CardTitle>
                <p className="text-sm text-blue-600 mt-1">
                    Tap the play button to hear each word! Colors show the syllables.
                </p>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                {/* Current List (first/most recent) */}
                {lists.length > 0 && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge className="bg-green-500 hover:bg-green-600">This Week</Badge>
                            <h3 className="font-bold text-xl text-gray-800">{lists[0].title}</h3>
                            {lists[0].weekNumber && (
                                <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-700">
                                    Week {lists[0].weekNumber}
                                </Badge>
                            )}
                        </div>

                        <div className="space-y-3">
                            {lists[0].words.map((word) => (
                                <div
                                    key={word.id}
                                    className={`
                                        flex items-center gap-4 p-4 rounded-2xl border-2 transition-all
                                        ${word.audioUrl
                                            ? "bg-white hover:bg-blue-50 hover:border-blue-300 cursor-pointer hover:shadow-md"
                                            : "bg-gray-50 cursor-not-allowed opacity-60"
                                        }
                                        ${playingWordId === word.id
                                            ? "border-blue-500 bg-blue-50 shadow-lg ring-2 ring-blue-200"
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
                                                ? "bg-blue-600 text-white scale-110"
                                                : "bg-gradient-to-br from-blue-500 to-indigo-500 text-white hover:scale-105"
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
                                            <Volume2 className="w-5 h-5 text-blue-600 animate-pulse" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Previous Lists (collapsible) */}
                {lists.length > 1 && (
                    <div className="border-t pt-4">
                        <button
                            onClick={() => setShowPreviousLists(!showPreviousLists)}
                            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors w-full justify-between p-2 rounded-lg hover:bg-gray-50"
                        >
                            <div className="flex items-center gap-2">
                                <History className="w-4 h-4" />
                                <span className="text-sm font-medium">
                                    Previous Lists ({lists.length - 1})
                                </span>
                            </div>
                            {showPreviousLists ? (
                                <ChevronUp className="w-4 h-4" />
                            ) : (
                                <ChevronDown className="w-4 h-4" />
                            )}
                        </button>

                        {showPreviousLists && (
                            <div className="mt-4 space-y-6">
                                {lists.slice(1).map((list) => (
                                    <div key={list.id} className="space-y-4 p-4 bg-gray-50 rounded-xl">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h4 className="font-semibold text-lg text-gray-700">{list.title}</h4>
                                            {list.weekNumber && (
                                                <Badge variant="outline" className="text-xs">
                                                    Week {list.weekNumber}
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            {list.words.map((word) => (
                                                <div
                                                    key={word.id}
                                                    className={`
                                                        flex items-center gap-3 p-3 rounded-xl border transition-all
                                                        ${word.audioUrl
                                                            ? "bg-white hover:bg-blue-50 cursor-pointer"
                                                            : "bg-gray-100 cursor-not-allowed opacity-60"
                                                        }
                                                        ${playingWordId === word.id
                                                            ? "border-blue-400 bg-blue-50"
                                                            : "border-gray-200"
                                                        }
                                                    `}
                                                    onClick={() => playWord(word)}
                                                >
                                                    <button
                                                        disabled={!word.audioUrl}
                                                        className={`
                                                            w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                                                            ${playingWordId === word.id
                                                                ? "bg-blue-500 text-white"
                                                                : "bg-blue-100 text-blue-600"
                                                            }
                                                        `}
                                                    >
                                                        {playingWordId === word.id ? (
                                                            <Pause className="w-5 h-5" />
                                                        ) : (
                                                            <Play className="w-5 h-5 ml-0.5" />
                                                        )}
                                                    </button>
                                                    <SyllableWord
                                                        word={word.word}
                                                        syllables={word.syllables}
                                                        isPlaying={playingWordId === word.id}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
