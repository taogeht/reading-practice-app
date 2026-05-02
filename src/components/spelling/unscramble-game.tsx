"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import confetti from "canvas-confetti";
import { pickNextWordViaSrs } from "./srs-picker";
import {
    Shuffle,
    RotateCcw,
    Trophy,
    Loader2,
    Sparkles,
    Calendar,
    CalendarRange,
    Volume2,
} from "lucide-react";

interface SpellingWord {
    id: string;
    word: string;
    syllables: string[] | null;
    audioUrl: string | null;
    imageUrl: string | null;
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

// Tile colors for the letter tiles - kid-friendly and vibrant
const TILE_COLORS = [
    "bg-rose-400 hover:bg-rose-500 active:bg-rose-600",
    "bg-sky-400 hover:bg-sky-500 active:bg-sky-600",
    "bg-amber-400 hover:bg-amber-500 active:bg-amber-600",
    "bg-emerald-400 hover:bg-emerald-500 active:bg-emerald-600",
    "bg-violet-400 hover:bg-violet-500 active:bg-violet-600",
    "bg-orange-400 hover:bg-orange-500 active:bg-orange-600",
    "bg-pink-400 hover:bg-pink-500 active:bg-pink-600",
    "bg-teal-400 hover:bg-teal-500 active:bg-teal-600",
    "bg-indigo-400 hover:bg-indigo-500 active:bg-indigo-600",
    "bg-lime-400 hover:bg-lime-500 active:bg-lime-600",
];

const MIN_WORD_LENGTH = 3;

/**
 * Returns responsive tile size classes based on word length.
 * Longer words get smaller tiles so they stay on one line.
 */
function getTileSizeClasses(wordLength: number) {
    if (wordLength <= 6) {
        return {
            tile: "w-12 h-14 md:w-14 md:h-16 lg:w-16 lg:h-[4.5rem] xl:w-20 xl:h-24 2xl:w-24 2xl:h-28",
            text: "text-xl md:text-2xl lg:text-3xl xl:text-4xl 2xl:text-5xl",
            gap: "gap-2 lg:gap-3 xl:gap-4",
        };
    }
    if (wordLength <= 8) {
        return {
            tile: "w-10 h-12 md:w-12 md:h-14 lg:w-14 lg:h-16 xl:w-16 xl:h-[4.5rem] 2xl:w-20 2xl:h-24",
            text: "text-lg md:text-xl lg:text-2xl xl:text-3xl 2xl:text-4xl",
            gap: "gap-1.5 lg:gap-2 xl:gap-3",
        };
    }
    // 9+ letters
    return {
        tile: "w-8 h-10 md:w-10 md:h-12 lg:w-12 lg:h-14 xl:w-14 xl:h-16 2xl:w-16 2xl:h-[4.5rem]",
        text: "text-base md:text-lg lg:text-xl xl:text-2xl 2xl:text-3xl",
        gap: "gap-1 lg:gap-1.5 xl:gap-2",
    };
}

/**
 * Shuffles an array using Fisher-Yates and ensures the result
 * differs from the original order (for arrays of length >= 2).
 */
function shuffleLetters(word: string): string[] {
    const letters = word.split("");
    if (letters.length < 2) return letters;

    let shuffled = [...letters];
    // Keep shuffling until we get a different order
    let attempts = 0;
    do {
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        attempts++;
        // Safety valve: after 20 attempts, force a swap if still identical
        if (attempts > 20) {
            [shuffled[0], shuffled[shuffled.length - 1]] = [shuffled[shuffled.length - 1], shuffled[0]];
            break;
        }
    } while (shuffled.join("") === letters.join(""));

    return shuffled;
}

function triggerConfetti() {
    const end = Date.now() + 1.5 * 1000;
    const colors = ["#a864fd", "#29cdff", "#78ff44", "#ff718d", "#fdff6a"];

    (function frame() {
        confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors,
        });
        confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors,
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    })();
}

interface UnscrambleGameProps {
    initialLists?: SpellingList[];
    skipTracking?: boolean;
}

export function UnscrambleGame({ initialLists, skipTracking }: UnscrambleGameProps = {}) {
    const [lists, setLists] = useState<SpellingList[]>([]);
    const [loading, setLoading] = useState(true);

    // Current word state
    const [currentWordObj, setCurrentWordObj] = useState<SpellingWord | null>(null);
    const [currentWord, setCurrentWord] = useState<string>(""); // uppercase target
    const [currentClassId, setCurrentClassId] = useState<string | null>(null);

    // Game tile state
    // Each tile has an original shuffled index, its letter, and a color index
    const [shuffledTiles, setShuffledTiles] = useState<{ letter: string; id: number; colorIdx: number }[]>([]);
    const [answerSlots, setAnswerSlots] = useState<(number | null)[]>([]); // tile ids placed in order
    const [availableTileIds, setAvailableTileIds] = useState<Set<number>>(new Set());

    // Game state
    const [gameState, setGameState] = useState<"playing" | "won" | "checking">("playing");
    const [wrongGuesses, setWrongGuesses] = useState(0);
    const [streak, setStreak] = useState(0);
    const [wordsCompleted, setWordsCompleted] = useState(0);
    const [wordsPlayed, setWordsPlayed] = useState<Set<string>>(new Set());
    const [wordPool, setWordPool] = useState<"current" | "all">("current");
    const [shakeAnswer, setShakeAnswer] = useState(false);

    const roundStartRef = useRef<number>(Date.now());
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (initialLists) {
            setLists(initialLists);
            setLoading(false);
            if (initialLists.length > 0 && initialLists[0].words.length > 0) {
                const eligible = initialLists[0].words.filter((w) => w.word.length >= MIN_WORD_LENGTH);
                if (eligible.length > 0) {
                    const chosen = eligible[Math.floor(Math.random() * eligible.length)];
                    initializeWord(chosen, initialLists[0].class.id);
                }
            }
        } else {
            fetchSpellingLists();
        }
        return () => {
            if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
        };
    }, []);

    const fetchSpellingLists = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/student/spelling-lists");
            if (response.ok) {
                const data: SpellingList[] = await response.json();
                setLists(data);

                if (data.length > 0 && data[0].words.length > 0) {
                    const eligible = data[0].words.filter((w) => w.word.length >= MIN_WORD_LENGTH);
                    if (eligible.length > 0) {
                        const chosen = eligible[Math.floor(Math.random() * eligible.length)];
                        initializeWord(chosen, data[0].class.id);
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching spelling lists:", error);
        } finally {
            setLoading(false);
        }
    };

    const getWordObjectsForPool = useCallback(
        (pool: "current" | "all") => {
            const words: { word: SpellingWord; classId: string }[] = [];
            if (pool === "current" && lists.length > 0) {
                for (const word of lists[0].words) {
                    if (word.word.length >= MIN_WORD_LENGTH) {
                        words.push({ word, classId: lists[0].class.id });
                    }
                }
            } else {
                for (const list of lists) {
                    for (const word of list.words) {
                        if (word.word.length >= MIN_WORD_LENGTH) {
                            words.push({ word, classId: list.class.id });
                        }
                    }
                }
            }
            return words;
        },
        [lists]
    );

    const getAllEligibleWords = useCallback(() => {
        return getWordObjectsForPool(wordPool);
    }, [getWordObjectsForPool, wordPool]);

    const initializeWord = (wordObj: SpellingWord, classId: string) => {
        const upper = wordObj.word.toUpperCase();
        setCurrentWordObj(wordObj);
        setCurrentWord(upper);
        setCurrentClassId(classId);

        // Create shuffled tiles with unique IDs and color assignments
        const shuffled = shuffleLetters(upper);
        const tiles = shuffled.map((letter, i) => ({
            letter,
            id: i,
            colorIdx: i % TILE_COLORS.length,
        }));
        setShuffledTiles(tiles);
        setAnswerSlots(Array(upper.length).fill(null));
        setAvailableTileIds(new Set(tiles.map((t) => t.id)));

        setGameState("playing");
        setShakeAnswer(false);
        roundStartRef.current = Date.now();

        // Setup audio
        if (wordObj.audioUrl) {
            if (audioRef.current) {
                audioRef.current.src = wordObj.audioUrl;
            } else {
                audioRef.current = new Audio(wordObj.audioUrl);
            }
        }
    };

    const pickNewWord = useCallback(
        async (overridePool?: "current" | "all") => {
            const pool = overridePool || wordPool;
            const allWords = getWordObjectsForPool(pool);
            if (allWords.length === 0) return;

            const playedSet = wordsPlayed;
            const excludeIds = allWords.filter((w) => playedSet.has(w.word.id)).map((w) => w.word.id);
            const chosenId = await pickNextWordViaSrs(
                allWords.map((w) => w.word.id),
                excludeIds,
            );
            let chosen = chosenId ? allWords.find((w) => w.word.id === chosenId) : undefined;
            if (!chosen) {
                const unplayed = allWords.filter((w) => !playedSet.has(w.word.id));
                const choices = unplayed.length > 0 ? unplayed : allWords;
                chosen = choices[Math.floor(Math.random() * choices.length)];
            }
            setWordsPlayed((prev) => new Set(prev).add(chosen.word.id));
            initializeWord(chosen.word, chosen.classId);
        },
        [getWordObjectsForPool, wordPool, wordsPlayed]
    );

    const handlePoolChange = (newPool: "current" | "all") => {
        setWordPool(newPool);
        pickNewWord(newPool);
    };

    const playAudio = () => {
        if (audioRef.current && currentWordObj?.audioUrl) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch((e) => console.error("Audio play failed:", e));
        }
    };

    // Fire-and-forget result reporting
    const reportResult = useCallback(
        (won: boolean, wrongCount: number) => {
            if (skipTracking) return;
            if (!currentWordObj || !currentClassId) return;
            const timeSeconds = Math.round((Date.now() - roundStartRef.current) / 1000);
            fetch("/api/student/spelling-game/results", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    spellingWordId: currentWordObj.id,
                    classId: currentClassId,
                    won,
                    wrongGuesses: wrongCount,
                    guessedLetters: currentWord.split(""),
                    timeSeconds,
                    activityType: "unscramble",
                }),
            }).catch(() => {}); // Silently ignore errors
        },
        [currentWordObj, currentClassId, currentWord]
    );

    // Place a tile into the next open answer slot
    const placeTile = (tileId: number) => {
        if (gameState !== "playing") return;

        // Find the next empty slot
        const nextEmptyIdx = answerSlots.indexOf(null);
        if (nextEmptyIdx === -1) return; // All slots full (shouldn't happen)

        const newSlots = [...answerSlots];
        newSlots[nextEmptyIdx] = tileId;
        setAnswerSlots(newSlots);

        const newAvailable = new Set(availableTileIds);
        newAvailable.delete(tileId);
        setAvailableTileIds(newAvailable);

        // Check if all slots are now filled
        const allFilled = newSlots.every((s) => s !== null);
        if (allFilled) {
            checkAnswer(newSlots);
        }
    };

    // Remove a tile from the answer back to available
    const removeTile = (slotIndex: number) => {
        if (gameState !== "playing") return;

        const tileId = answerSlots[slotIndex];
        if (tileId === null) return;

        const newSlots = [...answerSlots];
        newSlots[slotIndex] = null;

        // Compact: shift tiles left to fill gap
        const compacted: (number | null)[] = [];
        for (const s of newSlots) {
            if (s !== null) compacted.push(s);
        }
        while (compacted.length < currentWord.length) compacted.push(null);

        setAnswerSlots(compacted);

        const newAvailable = new Set(availableTileIds);
        newAvailable.add(tileId);
        setAvailableTileIds(newAvailable);
    };

    const checkAnswer = (slots: (number | null)[]) => {
        setGameState("checking");

        const builtWord = slots
            .map((tileId) => {
                if (tileId === null) return "";
                const tile = shuffledTiles.find((t) => t.id === tileId);
                return tile ? tile.letter : "";
            })
            .join("");

        if (builtWord === currentWord) {
            // Correct!
            setTimeout(() => {
                setGameState("won");
                setStreak((prev) => prev + 1);
                setWordsCompleted((prev) => prev + 1);
                triggerConfetti();
                reportResult(true, wrongGuesses);

                // Auto-advance after 2.5 seconds
                autoAdvanceTimerRef.current = setTimeout(() => {
                    pickNewWord();
                }, 2500);
            }, 300);
        } else {
            // Wrong — shake and clear
            const newWrong = wrongGuesses + 1;
            setWrongGuesses(newWrong);
            setShakeAnswer(true);

            setTimeout(() => {
                setShakeAnswer(false);
                // Clear answer slots, return all tiles to available
                setAnswerSlots(Array(currentWord.length).fill(null));
                setAvailableTileIds(new Set(shuffledTiles.map((t) => t.id)));
                setGameState("playing");
            }, 600);
        }
    };

    const getBuiltWord = () => {
        return answerSlots
            .map((tileId) => {
                if (tileId === null) return null;
                return shuffledTiles.find((t) => t.id === tileId) || null;
            });
    };

    if (loading) {
        return (
            <Card className="border-2 border-purple-200 shadow-lg">
                <CardHeader className="bg-gradient-to-r from-purple-100 via-fuchsia-50 to-pink-100 border-b border-purple-100 py-5 lg:py-6 xl:py-8">
                    <CardTitle className="flex items-center gap-3 text-purple-700 text-xl lg:text-2xl xl:text-3xl 2xl:text-4xl">
                        <Shuffle className="w-7 h-7 lg:w-9 lg:h-9 xl:w-12 xl:h-12" />
                        Unscramble
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (lists.length === 0 || getAllEligibleWords().length === 0) {
        return null; // No eligible spelling words, hide the game
    }

    // First load — need to start the game
    if (!currentWord) {
        pickNewWord();
        return null;
    }

    const builtTiles = getBuiltWord();
    const isWon = gameState === "won";
    const tileSize = getTileSizeClasses(currentWord.length);

    return (
        <Card className="border-2 border-purple-200 shadow-lg overflow-hidden relative">
            {/* Header */}
            <CardHeader className="bg-gradient-to-r from-purple-100 via-fuchsia-50 to-pink-100 border-b border-purple-100 py-5 lg:py-6 xl:py-8">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <CardTitle className="flex items-center gap-3 text-purple-700 text-xl lg:text-2xl xl:text-3xl 2xl:text-4xl">
                        <Shuffle className="w-7 h-7 lg:w-9 lg:h-9 xl:w-12 xl:h-12" />
                        Unscramble
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        {streak > 0 && (
                            <Badge className="bg-amber-500 hover:bg-amber-600 text-sm lg:text-base xl:text-lg 2xl:text-xl px-3 py-1 lg:px-4 lg:py-1.5 xl:px-5 xl:py-2">
                                {streak} streak
                            </Badge>
                        )}
                        <Badge
                            variant="outline"
                            className="border-purple-300 text-purple-700 text-sm lg:text-base xl:text-lg 2xl:text-xl px-3 py-1 lg:px-4 lg:py-1.5 xl:px-5 xl:py-2"
                        >
                            {wordsCompleted} completed
                        </Badge>
                    </div>
                </div>
                <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                    <p className="text-sm lg:text-base xl:text-lg 2xl:text-xl text-purple-600">
                        Tap the letters in the right order to spell the word!
                    </p>
                    <div className="flex items-center gap-1 bg-white/60 rounded-lg p-1 border border-purple-200">
                        <button
                            onClick={() => handlePoolChange("current")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 lg:px-4 lg:py-2 xl:px-5 xl:py-2.5 rounded-md text-sm lg:text-base xl:text-lg font-medium transition-all ${
                                wordPool === "current"
                                    ? "bg-purple-500 text-white shadow-sm"
                                    : "text-purple-600 hover:bg-purple-50"
                            }`}
                        >
                            <Calendar className="w-3.5 h-3.5 lg:w-5 lg:h-5 xl:w-6 xl:h-6" />
                            This Week
                        </button>
                        <button
                            onClick={() => handlePoolChange("all")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 lg:px-4 lg:py-2 xl:px-5 xl:py-2.5 rounded-md text-sm lg:text-base xl:text-lg font-medium transition-all ${
                                wordPool === "all"
                                    ? "bg-purple-500 text-white shadow-sm"
                                    : "text-purple-600 hover:bg-purple-50"
                            }`}
                        >
                            <CalendarRange className="w-3.5 h-3.5 lg:w-5 lg:h-5 xl:w-6 xl:h-6" />
                            All Weeks
                        </button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-6 lg:p-8 xl:p-12">
                <div className="flex flex-col items-center gap-6 lg:gap-8 xl:gap-10">
                    {/* Hints: Image and Audio */}
                    <div className="flex flex-col items-center gap-4">
                        {currentWordObj?.imageUrl && (
                            <img
                                src={currentWordObj.imageUrl}
                                alt="Word hint"
                                className="w-32 h-32 lg:w-36 lg:h-36 xl:w-40 xl:h-40 rounded-2xl object-cover border-4 border-purple-100 shadow-lg"
                            />
                        )}
                        {currentWordObj?.audioUrl && (
                            <button
                                onClick={playAudio}
                                className="w-16 h-16 lg:w-20 lg:h-20 xl:w-24 xl:h-24 rounded-full bg-white shadow-lg border-4 border-purple-100 flex items-center justify-center text-purple-600 hover:scale-105 hover:border-purple-300 hover:text-purple-700 transition-all hover:shadow-xl group focus:outline-none focus:ring-4 focus:ring-purple-200"
                                title="Listen to the word"
                            >
                                <Volume2 className="w-8 h-8 lg:w-10 lg:h-10 xl:w-12 xl:h-12 group-hover:scale-110 transition-transform" />
                            </button>
                        )}
                    </div>

                    {/* Success overlay */}
                    {isWon && (
                        <div className="text-center p-4 lg:p-6 xl:p-8 rounded-xl border-2 bg-green-50 border-green-300 w-full max-w-md">
                            <div className="space-y-2 lg:space-y-3">
                                <Trophy className="w-10 h-10 lg:w-14 lg:h-14 xl:w-20 xl:h-20 mx-auto text-yellow-500" />
                                <p className="font-bold text-lg lg:text-2xl xl:text-3xl 2xl:text-4xl text-green-700">
                                    Great job!
                                </p>
                                <p className="text-sm lg:text-base xl:text-xl 2xl:text-2xl text-green-600">
                                    You unscrambled <strong>{currentWord}</strong>!
                                </p>
                            </div>
                            <Button
                                onClick={() => {
                                    if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
                                    pickNewWord();
                                }}
                                className="mt-4 lg:mt-6 bg-purple-500 hover:bg-purple-600 text-white lg:text-lg xl:text-xl lg:px-6 lg:py-3 xl:px-8 xl:py-4"
                            >
                                <RotateCcw className="w-4 h-4 lg:w-5 lg:h-5 xl:w-6 xl:h-6 mr-2" />
                                Next Word
                            </Button>
                        </div>
                    )}

                    {/* Answer Slots */}
                    {!isWon && (
                        <div className="w-full max-w-2xl">
                            <p className="text-xs lg:text-sm xl:text-base 2xl:text-lg font-medium text-gray-500 text-center mb-3">
                                Your answer:
                            </p>
                            <div
                                className={`flex justify-center items-center ${tileSize.gap}`}
                                style={
                                    shakeAnswer
                                        ? { animation: "unscramble-shake 0.5s ease-in-out" }
                                        : undefined
                                }
                            >
                                {builtTiles.map((tile, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => removeTile(idx)}
                                        disabled={gameState !== "playing" || tile === null}
                                        className={`
                                            ${tileSize.tile}
                                            rounded-xl font-bold ${tileSize.text}
                                            transition-all duration-200 border-2 lg:border-3 xl:border-4
                                            flex items-center justify-center
                                            ${
                                                tile !== null
                                                    ? `${TILE_COLORS[tile.colorIdx].split(" ")[0]} text-white border-white/30 shadow-md cursor-pointer hover:scale-105 active:scale-95`
                                                    : "bg-gray-100 border-gray-300 border-dashed text-transparent"
                                            }
                                        `}
                                    >
                                        {tile !== null ? tile.letter : "\u00A0"}
                                    </button>
                                ))}
                            </div>

                            {wrongGuesses > 0 && (
                                <p className="text-center text-sm lg:text-base text-red-500 mt-2 font-medium">
                                    {wrongGuesses} wrong {wrongGuesses === 1 ? "attempt" : "attempts"}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Shuffled Letter Tiles */}
                    {!isWon && (
                        <div className="w-full max-w-2xl">
                            <p className="text-xs lg:text-sm xl:text-base 2xl:text-lg font-medium text-gray-500 text-center mb-3">
                                Tap a letter:
                            </p>
                            <div className={`flex justify-center items-center ${tileSize.gap}`}>
                                {shuffledTiles.map((tile) => {
                                    const isAvailable = availableTileIds.has(tile.id);
                                    return (
                                        <button
                                            key={tile.id}
                                            onClick={() => isAvailable && placeTile(tile.id)}
                                            disabled={!isAvailable || gameState !== "playing"}
                                            className={`
                                                ${tileSize.tile}
                                                rounded-xl font-bold ${tileSize.text}
                                                transition-all duration-200 border-2 lg:border-3 xl:border-4
                                                flex items-center justify-center
                                                ${
                                                    isAvailable
                                                        ? `${TILE_COLORS[tile.colorIdx]} text-white border-white/30 shadow-lg cursor-pointer hover:scale-110 hover:shadow-xl active:scale-95`
                                                        : "bg-gray-200 text-gray-300 border-gray-200 opacity-30 cursor-not-allowed"
                                                }
                                            `}
                                        >
                                            {tile.letter}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Skip word button */}
                {!isWon && (
                    <div className="flex justify-center mt-6 lg:mt-8 pt-4 lg:pt-6 border-t border-gray-100">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => pickNewWord()}
                            className="text-gray-400 hover:text-gray-600 lg:text-base xl:text-lg"
                        >
                            <Sparkles className="w-4 h-4 lg:w-5 lg:h-5 xl:w-6 xl:h-6 mr-1" />
                            Skip word
                        </Button>
                    </div>
                )}
            </CardContent>

            {/* Shake animation keyframes - injected once */}
            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes unscramble-shake {
                    0%, 100% { transform: translateX(0); }
                    10%, 50%, 90% { transform: translateX(-6px); }
                    30%, 70% { transform: translateX(6px); }
                }
            ` }} />
        </Card>
    );
}
