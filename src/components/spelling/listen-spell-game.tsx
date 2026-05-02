'use client';

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, Volume2, ChevronRight, CheckCircle2, XCircle } from "lucide-react";
import confetti from "canvas-confetti";
import { pickNextWordViaSrs } from "./srs-picker";

type SpellingWord = {
    id: string;
    word: string;
    audioUrl?: string | null;
    syllables?: string[];
};

type SpellingList = {
    id: string;
    title: string;
    class: {
        id: string;
        name: string;
    };
    words: SpellingWord[];
};

interface ListenAndSpellGameProps {
    initialLists?: SpellingList[];
    skipTracking?: boolean;
}

export function ListenAndSpellGame({ initialLists, skipTracking }: ListenAndSpellGameProps = {}) {
    const [lists, setLists] = useState<SpellingList[]>([]);
    const [currentWord, setCurrentWord] = useState<SpellingWord | null>(null);
    const [currentClassId, setCurrentClassId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const [inputValue, setInputValue] = useState("");
    const [wrongGuesses, setWrongGuesses] = useState(0);
    const [gameState, setGameState] = useState<"playing" | "won" | "lost">("playing");
    const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

    // Track stats for the current session
    const [streak, setStreak] = useState(0);
    const [wordsPlayed, setWordsPlayed] = useState<Set<string>>(new Set());
    const [wordPool, setWordPool] = useState<"current" | "all">("current");
    const roundStartRef = useRef<number>(Date.now());
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (initialLists) {
            setLists(initialLists);
            setLoading(false);
            if (initialLists.length > 0 && initialLists[0].words.length > 0) {
                pickRandomWord(initialLists, "current");
            }
        } else {
            fetchSpellingLists();
        }
    }, []);

    const fetchSpellingLists = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/student/spelling-lists");
            if (response.ok) {
                const data: SpellingList[] = await response.json();
                setLists(data);

                // Pick a random word from the first list if available
                if (data.length > 0 && data[0].words.length > 0) {
                    pickRandomWord(data, "current");
                }
            }
        } catch (error) {
            console.error("Error fetching spelling lists:", error);
        } finally {
            setLoading(false);
        }
    };

    const getWordObjectsForPool = useCallback((listData: SpellingList[], pool: "current" | "all") => {
        const words: { word: SpellingWord, classId: string }[] = [];
        if (pool === "current" && listData.length > 0) {
            for (const word of listData[0].words) {
                words.push({ word, classId: listData[0].class.id });
            }
        } else {
            for (const list of listData) {
                for (const word of list.words) {
                    words.push({ word, classId: list.class.id });
                }
            }
        }
        return words;
    }, []);

    const pickRandomWord = useCallback(async (listData: SpellingList[], pool: "current" | "all") => {
        const availableWords = getWordObjectsForPool(listData, pool);
        if (availableWords.length === 0) return;

        // Reset played pool if exhausted
        const playedSet = wordsPlayed;
        const allPlayed = availableWords.every((w) => playedSet.has(w.word.id));
        if (allPlayed) {
            setWordsPlayed(new Set());
        }
        const excludeIds = allPlayed ? [] : availableWords.filter((w) => playedSet.has(w.word.id)).map((w) => w.word.id);

        const chosenId = await pickNextWordViaSrs(
            availableWords.map((w) => w.word.id),
            excludeIds,
        );
        let randomSelection = chosenId ? availableWords.find((w) => w.word.id === chosenId) : undefined;
        if (!randomSelection) {
            const eligible = allPlayed ? availableWords : availableWords.filter((w) => !playedSet.has(w.word.id));
            randomSelection = eligible[Math.floor(Math.random() * eligible.length)];
        }

        setCurrentWord(randomSelection.word);
        setCurrentClassId(randomSelection.classId);
        setGameState("playing");
        setWrongGuesses(0);
        setInputValue("");
        setFeedbackMsg(null);
        roundStartRef.current = Date.now();

        // Auto-focus input
        setTimeout(() => {
            if (inputRef.current) inputRef.current.focus();
        }, 100);

        // Setup audio
        if (randomSelection.word.audioUrl) {
            if (audioRef.current) {
                audioRef.current.src = randomSelection.word.audioUrl;
            } else {
                audioRef.current = new Audio(randomSelection.word.audioUrl);
            }

            // Small delay before auto-playing
            setTimeout(() => {
                playAudio();
            }, 500);
        }
    }, [getWordObjectsForPool, wordsPlayed]);

    const playAudio = () => {
        if (audioRef.current && currentWord?.audioUrl) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(e => console.error("Audio play failed:", e));
            // Keep focus on input so they can type immediately
            if (inputRef.current) inputRef.current.focus();
        }
    };

    const reportResult = async (won: boolean, mistakes: number, guessedWords: string[]) => {
        if (skipTracking) return;
        if (!currentWord || !currentClassId) return;

        const timeSeconds = Math.floor((Date.now() - roundStartRef.current) / 1000);

        try {
            await fetch('/api/student/spelling-game/results', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    spellingWordId: currentWord.id,
                    classId: currentClassId,
                    won,
                    wrongGuesses: mistakes,
                    guessedLetters: guessedWords, // Storing what strings they tried instead of letters
                    timeSeconds,
                    activityType: 'listen-spell',
                })
            });
        } catch (error) {
            console.error("Failed to report spelling result:", error);
        }
    };

    const triggerConfetti = () => {
        const end = Date.now() + 1.5 * 1000;
        const colors = ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'];

        (function frame() {
            confetti({
                particleCount: 5,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: colors
            });
            confetti({
                particleCount: 5,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: colors
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        }());
    };

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (gameState !== "playing" || !currentWord || !inputValue.trim()) return;

        const guess = inputValue.trim().toUpperCase();
        const target = currentWord.word.toUpperCase();

        if (guess === target) {
            // Win
            setGameState("won");
            triggerConfetti();
            setStreak(prev => prev + 1);
            setWordsPlayed(prev => new Set(prev).add(currentWord.id));
            setFeedbackMsg("Perfect! Great job!");
            reportResult(true, wrongGuesses, [guess]);
        } else {
            // Miss
            const newMisses = wrongGuesses + 1;
            setWrongGuesses(newMisses);
            setStreak(0);

            if (newMisses === 1) {
                setFeedbackMsg("Not quite! Listen again and sound it out.");
                playAudio();
            } else if (newMisses === 2) {
                const firstLetter = target.charAt(0);
                const blanks = Array(target.length - 1).fill("_").join(" ");
                setFeedbackMsg(`Hint: It starts with "${firstLetter}" (${firstLetter} ${blanks})`);
                playAudio();
            } else {
                // 3 strikes, reveal the word
                setGameState("lost");
                setFeedbackMsg(`The word was: ${target}`);
                setWordsPlayed(prev => new Set(prev).add(currentWord.id));
                reportResult(false, newMisses, [guess]);
            }
            // Clear input on miss unless they lost completely
            if (newMisses < 3) {
                setInputValue("");
                setTimeout(() => {
                    if (inputRef.current) inputRef.current.focus();
                }, 10);
            }
        }
    };

    const nextWord = () => {
        pickRandomWord(lists, wordPool);
    };

    if (loading) {
        return (
            <Card className="w-full">
                <CardContent className="h-64 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </CardContent>
            </Card>
        );
    }

    if (lists.length === 0 || !currentWord) {
        return (
            <Card className="w-full">
                <CardContent className="h-64 flex flex-col items-center justify-center text-gray-500 space-y-4">
                    <Volume2 className="w-12 h-12 text-gray-300" />
                    <p>No spelling words available right now.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full bg-gradient-to-br from-indigo-50 to-blue-50 overflow-hidden border-indigo-100">
            <CardHeader className="bg-white/50 border-b border-indigo-100/50 flex flex-row items-center justify-between py-4">
                <div>
                    <CardTitle className="text-xl text-indigo-950 flex items-center gap-2">
                        <Headphones className="w-5 h-5 text-indigo-500" />
                        Listen & Spell
                    </CardTitle>
                    <CardDescription>
                        Type the word you hear
                    </CardDescription>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-center">
                        <div className="text-xs text-indigo-500 font-medium uppercase tracking-wider">Streak</div>
                        <div className="text-2xl font-bold font-mono text-indigo-700">{streak} 🔥</div>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-8">
                <div className="max-w-md mx-auto flex flex-col items-center space-y-8">

                    {/* Audio Play Button */}
                    <button
                        onClick={playAudio}
                        className="w-32 h-32 rounded-full bg-white shadow-lg border-4 border-indigo-100 flex items-center justify-center text-indigo-600 hover:scale-105 hover:border-indigo-300 hover:text-indigo-700 transition-all hover:shadow-xl group focus:outline-none focus:ring-4 focus:ring-indigo-200"
                        title="Play Word"
                    >
                        <Volume2 className="w-16 h-16 group-hover:scale-110 transition-transform" />
                    </button>

                    {/* Feedback Message */}
                    <div className="h-8 flex items-center justify-center w-full">
                        {feedbackMsg && (
                            <p className={`text-center font-medium ${gameState === "won" ? "text-green-600 text-lg" :
                                    gameState === "lost" ? "text-red-600 text-lg" :
                                        "text-amber-600"
                                }`}>
                                {feedbackMsg}
                            </p>
                        )}
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSubmit} className="w-full flex gap-2">
                        <Input
                            ref={inputRef}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            disabled={gameState !== "playing"}
                            className={`text-center text-3xl h-16 font-bold tracking-widest uppercase ${gameState === "won" ? "bg-green-50 border-green-500 text-green-700" :
                                    gameState === "lost" ? "bg-red-50 border-red-500 text-red-700" :
                                        "bg-white border-2 border-indigo-200 focus-visible:ring-indigo-400 focus-visible:border-indigo-400"
                                }`}
                            placeholder="Type here..."
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck="false"
                        />
                        {gameState === "playing" && (
                            <Button type="submit" size="lg" className="h-16 w-16 bg-indigo-600 hover:bg-indigo-700 shrink-0">
                                <CheckCircle2 className="w-8 h-8" />
                            </Button>
                        )}
                    </form>

                    {/* Next Button */}
                    {gameState !== "playing" && (
                        <Button
                            onClick={nextWord}
                            size="lg"
                            className="w-full h-14 text-lg font-semibold bg-indigo-600 hover:bg-indigo-700"
                        >
                            Next Word
                            <ChevronRight className="w-6 h-6 ml-2" />
                        </Button>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="mt-12 flex items-center justify-between text-sm text-indigo-600/70 border-t border-indigo-100/50 pt-4">
                    <div className="flex gap-2 bg-white/50 p-1 rounded-lg border border-indigo-100">
                        <button
                            onClick={() => { setWordPool("current"); setWordsPlayed(new Set()); pickRandomWord(lists, "current"); }}
                            className={`px-3 py-1.5 rounded-md transition-colors ${wordPool === "current" ? "bg-indigo-100 text-indigo-700 font-medium" : "hover:bg-indigo-50"}`}
                        >
                            This Week's Words
                        </button>
                        <button
                            onClick={() => { setWordPool("all"); setWordsPlayed(new Set()); pickRandomWord(lists, "all"); }}
                            className={`px-3 py-1.5 rounded-md transition-colors ${wordPool === "all" ? "bg-indigo-100 text-indigo-700 font-medium" : "hover:bg-indigo-50"}`}
                        >
                            All Words
                        </button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// Need to import Headphones above since we used it in UI
import { Headphones } from "lucide-react";
