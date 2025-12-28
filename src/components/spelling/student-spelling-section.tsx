"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BookA className="w-5 h-5 text-purple-600" />
                        Spelling Words
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (lists.length === 0) {
        return null; // Don't show the section if there are no spelling lists
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <BookA className="w-5 h-5 text-purple-600" />
                    Spelling Words
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {lists.map((list) => (
                    <div key={list.id} className="space-y-3">
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-lg">{list.title}</h3>
                            {list.weekNumber && (
                                <Badge variant="outline">Week {list.weekNumber}</Badge>
                            )}
                            <Badge variant="secondary" className="text-xs">
                                {list.class.name}
                            </Badge>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {list.words.map((word) => (
                                <button
                                    key={word.id}
                                    onClick={() => playWord(word)}
                                    disabled={!word.audioUrl}
                                    className={`
                    flex items-center gap-3 p-4 rounded-xl border-2 transition-all
                    ${word.audioUrl
                                            ? "bg-white hover:bg-purple-50 hover:border-purple-300 cursor-pointer"
                                            : "bg-gray-50 cursor-not-allowed opacity-60"
                                        }
                    ${playingWordId === word.id
                                            ? "border-purple-500 bg-purple-50"
                                            : "border-gray-200"
                                        }
                  `}
                                >
                                    <div
                                        className={`
                      w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                      ${playingWordId === word.id
                                                ? "bg-purple-500 text-white"
                                                : "bg-purple-100 text-purple-600"
                                            }
                    `}
                                    >
                                        {playingWordId === word.id ? (
                                            <Pause className="w-5 h-5" />
                                        ) : (
                                            <Play className="w-5 h-5 ml-0.5" />
                                        )}
                                    </div>
                                    <span className="font-medium text-gray-900 truncate">
                                        {word.word}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
