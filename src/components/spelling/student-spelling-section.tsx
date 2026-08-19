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
    X,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";

interface SpellingWord {
    id: string;
    word: string;
    syllables: string[] | null; // Stored syllables from dictionary API
    audioUrl: string | null;
    imageUrl: string | null;
    mandarinTranslation: string | null;
    orderIndex: number;
}

interface SpellingList {
    id: string;
    title: string;
    weekNumber: number | null;
    /** Set by the teacher to mark this week's test. At most one per class. */
    isCurrent: boolean;
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
function SyllableWord({ word, syllables: storedSyllables, isPlaying, large }: {
    word: string;
    syllables: string[] | null;
    isPlaying: boolean;
    large?: boolean;
}) {
    // Only use syllables if teacher has explicitly set them (more than 1 syllable stored)
    const hasSyllables = storedSyllables && storedSyllables.length > 1;

    if (!hasSyllables) {
        return (
            <span className={`font-bold ${large ? "text-4xl" : "text-xl"} text-gray-800 ${isPlaying ? "scale-105" : ""}`}>
                {word}
            </span>
        );
    }

    return (
        <div className={`flex flex-wrap items-center ${large ? "gap-2 justify-center" : "gap-1"}`}>
            {storedSyllables.map((syllable, index) => {
                const colors = SYLLABLE_COLORS[index % SYLLABLE_COLORS.length];
                return (
                    <span
                        key={index}
                        className={`
              ${large ? "px-4 py-2 text-3xl" : "px-2 py-1 text-lg"} rounded-lg font-bold
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

    // The list the teacher marked as this week's test. Previously this section
    // simply featured lists[0] and labelled it "This Week", which was wrong
    // once a class had a full year imported: those lists are written in one
    // pass, so ordering by createdAt put an arbitrary unit under that badge.
    // Falling back to the first list keeps something on screen when no test
    // has been set, but it is not claimed to be the current one.
    const currentList = lists.find((list) => list.isCurrent) ?? null;
    const featuredList = currentList ?? lists[0] ?? null;
    const otherLists = lists.filter((list) => list.id !== featuredList?.id);
    const [loading, setLoading] = useState(true);
    const [playingWordId, setPlayingWordId] = useState<string | null>(null);
    const [showPreviousLists, setShowPreviousLists] = useState(false);
    const [expandedWord, setExpandedWord] = useState<{ word: SpellingWord; words: SpellingWord[] } | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const openExpandedWord = (word: SpellingWord, words: SpellingWord[]) => {
        setExpandedWord({ word, words });
    };

    const navigateExpandedWord = (direction: -1 | 1) => {
        if (!expandedWord) return;
        const { word, words } = expandedWord;
        const currentIndex = words.findIndex(w => w.id === word.id);
        const newIndex = currentIndex + direction;
        if (newIndex >= 0 && newIndex < words.length) {
            setExpandedWord({ word: words[newIndex], words });
        }
    };

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
        <Card className="border-2 border-blue-200 overflow-hidden shadow-lg">
            <CardHeader className="bg-gradient-to-r from-blue-100 via-indigo-50 to-purple-100 border-b border-blue-100 py-6">
                <CardTitle className="flex items-center gap-3 text-blue-700 text-2xl">
                    <BookA className="w-8 h-8" />
                    🎯 Spelling Words
                </CardTitle>
                <p className="text-sm text-blue-600 mt-1">
                    Tap the play button to hear each word! Colors show the syllables.
                </p>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                {/* The teacher's designated test for this week. */}
                {featuredList && (
                    <div className="space-y-5">
                        <div className="flex items-center gap-3 flex-wrap">
                            {currentList ? (
                                <Badge className="bg-green-500 hover:bg-green-600 text-base px-3 py-1">
                                    ⭐ This Week&apos;s Test
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="border-gray-300 text-gray-600 text-base px-3 py-1">
                                    Practice
                                </Badge>
                            )}
                            <h3 className="font-bold text-2xl text-gray-800">{featuredList.title}</h3>
                            {featuredList.weekNumber && (
                                <Badge variant="outline" className="bg-blue-50 border-blue-300 text-blue-700 text-sm px-3 py-1">
                                    Week {featuredList.weekNumber}
                                </Badge>
                            )}
                        </div>
                        {currentList && (
                            <p className="text-base text-green-700 font-medium">
                                These are the words for this week&apos;s test — practice these first!
                            </p>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {featuredList.words.map((word) => (
                                <div
                                    key={word.id}
                                    className={`
                                        flex items-center gap-4 p-5 rounded-2xl border-2 transition-all cursor-pointer
                                        bg-white hover:bg-blue-50 hover:border-blue-300 hover:shadow-lg hover:-translate-y-0.5
                                        ${playingWordId === word.id
                                            ? "border-blue-500 bg-blue-50 shadow-lg ring-2 ring-blue-200 -translate-y-0.5"
                                            : "border-gray-200"
                                        }
                                    `}
                                    onClick={() => openExpandedWord(word, featuredList.words)}
                                >
                                    {/* Play Button */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); playWord(word); }}
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
                                            <Play className="w-7 h-7 ml-0.5" />
                                        )}
                                    </button>

                                    {/* Word image */}
                                    {word.imageUrl && (
                                        <img
                                            src={word.imageUrl}
                                            alt={`Illustration of ${word.word}`}
                                            className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border-2 border-gray-100"
                                        />
                                    )}

                                    {/* Word with Syllables */}
                                    <div className="flex-1 min-w-0">
                                        <SyllableWord
                                            word={word.word}
                                            syllables={word.syllables}
                                            isPlaying={playingWordId === word.id}
                                        />
                                        {word.mandarinTranslation && (
                                            <p className="text-sm text-gray-500 mt-1">{word.mandarinTranslation}</p>
                                        )}
                                    </div>

                                    {/* Sound indicator when playing */}
                                    {playingWordId === word.id && (
                                        <div className="flex items-center gap-1">
                                            <Volume2 className="w-6 h-6 text-blue-600 animate-pulse" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Every other list the class has. With a full year imported
                    these are mostly units the class has not reached yet, so
                    "Previous" would be misleading. */}
                {otherLists.length > 0 && (
                    <div className="border-t pt-4">
                        <button
                            onClick={() => setShowPreviousLists(!showPreviousLists)}
                            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors w-full justify-between p-2 rounded-lg hover:bg-gray-50"
                        >
                            <div className="flex items-center gap-2">
                                <History className="w-4 h-4" />
                                <span className="text-sm font-medium">
                                    All Word Lists ({otherLists.length})
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
                                {otherLists.map((list) => (
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
                                                        flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer
                                                        bg-white hover:bg-blue-50
                                                        ${playingWordId === word.id
                                                            ? "border-blue-400 bg-blue-50"
                                                            : "border-gray-200"
                                                        }
                                                    `}
                                                    onClick={() => openExpandedWord(word, list.words)}
                                                >
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); playWord(word); }}
                                                        disabled={!word.audioUrl}
                                                        className={`
                                                            w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                                                            ${playingWordId === word.id
                                                                ? "bg-blue-500 text-white"
                                                                : "bg-blue-100 text-blue-600"
                                                            }
                                                            ${!word.audioUrl ? "opacity-50" : ""}
                                                        `}
                                                    >
                                                        {playingWordId === word.id ? (
                                                            <Pause className="w-5 h-5" />
                                                        ) : (
                                                            <Play className="w-5 h-5 ml-0.5" />
                                                        )}
                                                    </button>
                                                    {word.imageUrl && (
                                                        <img
                                                            src={word.imageUrl}
                                                            alt={`Illustration of ${word.word}`}
                                                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                                                        />
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <SyllableWord
                                                            word={word.word}
                                                            syllables={word.syllables}
                                                            isPlaying={playingWordId === word.id}
                                                        />
                                                        {word.mandarinTranslation && (
                                                            <p className="text-sm text-gray-500 mt-0.5">{word.mandarinTranslation}</p>
                                                        )}
                                                    </div>
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

            {/* Expanded Word Modal */}
            {expandedWord && (() => {
                const { word: currentWord, words: wordList } = expandedWord;
                const currentIndex = wordList.findIndex(w => w.id === currentWord.id);
                const hasPrev = currentIndex > 0;
                const hasNext = currentIndex < wordList.length - 1;

                return (
                    <div
                        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                        onClick={() => setExpandedWord(null)}
                    >
                        {/* Left arrow */}
                        <button
                            onClick={(e) => { e.stopPropagation(); navigateExpandedWord(-1); }}
                            disabled={!hasPrev}
                            className={`
                                absolute left-2 sm:left-6 z-10 w-14 h-14 rounded-full flex items-center justify-center
                                transition-all shadow-lg
                                ${hasPrev
                                    ? "bg-white text-gray-700 hover:bg-gray-100 active:scale-95"
                                    : "bg-white/30 text-gray-300 cursor-not-allowed"
                                }
                            `}
                        >
                            <ChevronLeft className="w-8 h-8" />
                        </button>

                        <div
                            className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Close button + word counter */}
                            <div className="flex items-center justify-between p-3 pb-0">
                                <span className="text-sm text-gray-400 font-medium pl-2">
                                    {currentIndex + 1} / {wordList.length}
                                </span>
                                <button
                                    onClick={() => setExpandedWord(null)}
                                    className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                                >
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            <div className="flex flex-col items-center px-8 pb-8 gap-5">
                                {/* Large image */}
                                {currentWord.imageUrl && (
                                    <img
                                        src={currentWord.imageUrl}
                                        alt={`Illustration of ${currentWord.word}`}
                                        className="w-48 h-48 rounded-2xl object-cover border-4 border-gray-100 shadow-lg"
                                    />
                                )}

                                {/* Word with syllables - larger */}
                                <div className="text-center">
                                    <SyllableWord
                                        word={currentWord.word}
                                        syllables={currentWord.syllables}
                                        isPlaying={playingWordId === currentWord.id}
                                        large
                                    />
                                    {currentWord.mandarinTranslation && (
                                        <p className="text-xl text-gray-500 mt-2">{currentWord.mandarinTranslation}</p>
                                    )}
                                </div>

                                {/* Large play button */}
                                {currentWord.audioUrl && (
                                    <button
                                        onClick={() => playWord(currentWord)}
                                        className={`
                                            w-24 h-24 rounded-full flex items-center justify-center
                                            transition-all shadow-lg active:scale-95
                                            ${playingWordId === currentWord.id
                                                ? "bg-blue-600 text-white scale-105"
                                                : "bg-gradient-to-br from-blue-500 to-indigo-500 text-white hover:scale-105"
                                            }
                                        `}
                                    >
                                        {playingWordId === currentWord.id ? (
                                            <Pause className="w-12 h-12" />
                                        ) : (
                                            <Play className="w-12 h-12 ml-1" />
                                        )}
                                    </button>
                                )}

                                {playingWordId === currentWord.id && (
                                    <div className="flex items-center gap-2 text-blue-600">
                                        <Volume2 className="w-5 h-5 animate-pulse" />
                                        <span className="text-sm font-medium">Playing...</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right arrow */}
                        <button
                            onClick={(e) => { e.stopPropagation(); navigateExpandedWord(1); }}
                            disabled={!hasNext}
                            className={`
                                absolute right-2 sm:right-6 z-10 w-14 h-14 rounded-full flex items-center justify-center
                                transition-all shadow-lg
                                ${hasNext
                                    ? "bg-white text-gray-700 hover:bg-gray-100 active:scale-95"
                                    : "bg-white/30 text-gray-300 cursor-not-allowed"
                                }
                            `}
                        >
                            <ChevronRight className="w-8 h-8" />
                        </button>
                    </div>
                );
            })()}
        </Card>
    );
}
