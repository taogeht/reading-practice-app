"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SnowmanSVG } from "./snowman-svg";
import {
    Snowflake,
    RotateCcw,
    Trophy,
    Frown,
    Loader2,
    Sparkles,
    Calendar,
    CalendarRange,
} from "lucide-react";

interface SpellingWord {
    id: string;
    word: string;
    syllables: string[] | null;
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

const VOWELS = new Set(["A", "E", "I", "O", "U"]);
const CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ".split("");
const MAX_WRONG = 10;

export function SnowmanGame() {
    const [lists, setLists] = useState<SpellingList[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentWord, setCurrentWord] = useState<string>("");
    const [currentWordId, setCurrentWordId] = useState<string | null>(null);
    const [currentClassId, setCurrentClassId] = useState<string | null>(null);
    const [guessedLetters, setGuessedLetters] = useState<Set<string>>(new Set());
    const [wrongGuesses, setWrongGuesses] = useState(0);
    const [gameState, setGameState] = useState<"playing" | "won" | "lost">("playing");
    const [wordsPlayed, setWordsPlayed] = useState<Set<string>>(new Set());
    const [streak, setStreak] = useState(0);
    const [showConfetti, setShowConfetti] = useState(false);
    const [wordPool, setWordPool] = useState<"current" | "all">("current");
    const roundStartRef = useRef<number>(Date.now());

    useEffect(() => {
        fetchSpellingLists();
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
                    const words = data[0].words;
                    const randomWord = words[Math.floor(Math.random() * words.length)];
                    setCurrentWord(randomWord.word.toUpperCase());
                    setCurrentWordId(randomWord.id);
                    setCurrentClassId(data[0].class.id);
                    roundStartRef.current = Date.now();
                }
            }
        } catch (error) {
            console.error("Error fetching spelling lists:", error);
        } finally {
            setLoading(false);
        }
    };

    const getWordObjectsForPool = useCallback((pool: "current" | "all") => {
        const words: SpellingWord[] = [];
        if (pool === "current" && lists.length > 0) {
            for (const word of lists[0].words) {
                words.push(word);
            }
        } else {
            for (const list of lists) {
                for (const word of list.words) {
                    words.push(word);
                }
            }
        }
        return words;
    }, [lists]);

    const getWordsForPool = useCallback((pool: "current" | "all") => {
        return getWordObjectsForPool(pool).map(w => w.word.toUpperCase());
    }, [getWordObjectsForPool]);

    const getAllWords = useCallback(() => {
        return getWordsForPool(wordPool);
    }, [getWordsForPool, wordPool]);

    const pickNewWord = useCallback((overridePool?: "current" | "all") => {
        const pool = overridePool || wordPool;
        const allWordObjects = getWordObjectsForPool(pool);
        if (allWordObjects.length === 0) return;

        // Try to pick a word we haven't played yet
        const unplayed = allWordObjects.filter((w) => !wordsPlayed.has(w.word.toUpperCase()));
        const wordChoices = unplayed.length > 0 ? unplayed : allWordObjects;

        const chosen = wordChoices[Math.floor(Math.random() * wordChoices.length)];
        const newWord = chosen.word.toUpperCase();
        setCurrentWord(newWord);
        setCurrentWordId(chosen.id);
        // Find which class this word belongs to
        for (const list of lists) {
            if (list.words.some(w => w.id === chosen.id)) {
                setCurrentClassId(list.class.id);
                break;
            }
        }
        setGuessedLetters(new Set());
        setWrongGuesses(0);
        setGameState("playing");
        setWordsPlayed((prev) => new Set(prev).add(newWord));
        setShowConfetti(false);
        roundStartRef.current = Date.now();
    }, [getWordObjectsForPool, wordPool, wordsPlayed, lists]);

    const handlePoolChange = (newPool: "current" | "all") => {
        setWordPool(newPool);
        // Pick a new word from the new pool immediately
        pickNewWord(newPool);
    };

    // Fire-and-forget result reporting
    const reportResult = useCallback((won: boolean, wrongCount: number, letters: string[]) => {
        if (!currentWordId || !currentClassId) return;
        const timeSeconds = Math.round((Date.now() - roundStartRef.current) / 1000);
        fetch('/api/student/spelling-game/results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                spellingWordId: currentWordId,
                classId: currentClassId,
                won,
                wrongGuesses: wrongCount,
                guessedLetters: letters,
                timeSeconds,
            }),
        }).catch(() => { }); // Silently ignore errors
    }, [currentWordId, currentClassId]);

    const handleGuess = (letter: string) => {
        if (gameState !== "playing" || guessedLetters.has(letter)) return;

        const newGuessed = new Set(guessedLetters);
        newGuessed.add(letter);
        setGuessedLetters(newGuessed);

        if (!currentWord.includes(letter)) {
            // Wrong guess
            const newWrong = wrongGuesses + 1;
            setWrongGuesses(newWrong);
            if (newWrong >= MAX_WRONG) {
                setGameState("lost");
                setStreak(0);
                reportResult(false, newWrong, Array.from(newGuessed));
            }
        } else {
            // Check if all consonants in the word are now guessed (vowels are auto-revealed)
            const wordLetters = currentWord.split("");
            const allRevealed = wordLetters.every(
                (l) => VOWELS.has(l) || newGuessed.has(l) || !/[A-Z]/.test(l)
            );
            if (allRevealed) {
                setGameState("won");
                setStreak((prev) => prev + 1);
                setShowConfetti(true);
                setTimeout(() => setShowConfetti(false), 3000);
                reportResult(true, wrongGuesses, Array.from(newGuessed));
            }
        }
    };

    const getDisplayWord = () => {
        return currentWord.split("").map((letter) => {
            if (!/[A-Z]/.test(letter)) return letter; // non-alpha characters shown as-is
            if (VOWELS.has(letter)) return letter; // vowels always shown
            if (guessedLetters.has(letter)) return letter; // correctly guessed consonant
            if (gameState === "lost") return letter; // reveal on loss
            return "_";
        });
    };

    if (loading) {
        return (
            <Card className="border-2 border-sky-200 shadow-lg">
                <CardHeader className="bg-gradient-to-r from-sky-100 via-blue-50 to-cyan-100 border-b border-sky-100 py-5 lg:py-6 xl:py-8">
                    <CardTitle className="flex items-center gap-3 text-sky-700 text-xl lg:text-2xl xl:text-3xl 2xl:text-4xl">
                        <Snowflake className="w-7 h-7 lg:w-9 lg:h-9 xl:w-12 xl:h-12" />
                        ⛄ Snowman Spelling
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (lists.length === 0 || getAllWords().length === 0) {
        return null; // No spelling words, hide the game
    }

    // First load — need to start the game
    if (!currentWord) {
        pickNewWord();
        return null;
    }

    const displayWord = getDisplayWord();
    const isWon = gameState === "won";
    const isLost = gameState === "lost";
    const isGameOver = isWon || isLost;

    return (
        <Card className="border-2 border-sky-200 shadow-lg overflow-hidden relative">
            {/* Confetti effect */}
            {showConfetti && (
                <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                    {[...Array(20)].map((_, i) => (
                        <div
                            key={i}
                            className="absolute animate-bounce"
                            style={{
                                left: `${Math.random() * 100}%`,
                                top: `${Math.random() * 60}%`,
                                animationDelay: `${Math.random() * 0.5}s`,
                                animationDuration: `${0.8 + Math.random() * 1.2}s`,
                                fontSize: `${14 + Math.random() * 10}px`,
                            }}
                        >
                            {["⭐", "🎉", "✨", "❄️", "🌟"][Math.floor(Math.random() * 5)]}
                        </div>
                    ))}
                </div>
            )}

            <CardHeader className="bg-gradient-to-r from-sky-100 via-blue-50 to-cyan-100 border-b border-sky-100 py-5 lg:py-6 xl:py-8">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <CardTitle className="flex items-center gap-3 text-sky-700 text-xl lg:text-2xl xl:text-3xl 2xl:text-4xl">
                        <Snowflake className="w-7 h-7 lg:w-9 lg:h-9 xl:w-12 xl:h-12" />
                        ⛄ Snowman Spelling
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        {streak > 0 && (
                            <Badge className="bg-amber-500 hover:bg-amber-600 text-sm lg:text-base xl:text-lg 2xl:text-xl px-3 py-1 lg:px-4 lg:py-1.5 xl:px-5 xl:py-2">
                                🔥 {streak} streak
                            </Badge>
                        )}
                        <Badge variant="outline" className="border-sky-300 text-sky-700 text-sm lg:text-base xl:text-lg 2xl:text-xl px-3 py-1 lg:px-4 lg:py-1.5 xl:px-5 xl:py-2">
                            {MAX_WRONG - wrongGuesses} guesses left
                        </Badge>
                    </div>
                </div>
                <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                    <p className="text-sm lg:text-base xl:text-lg 2xl:text-xl text-sky-600">
                        Guess the consonants to spell the word! Vowels are given for free.
                    </p>
                    <div className="flex items-center gap-1 bg-white/60 rounded-lg p-1 border border-sky-200">
                        <button
                            onClick={() => handlePoolChange("current")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 lg:px-4 lg:py-2 xl:px-5 xl:py-2.5 rounded-md text-sm lg:text-base xl:text-lg font-medium transition-all ${wordPool === "current"
                                ? "bg-sky-500 text-white shadow-sm"
                                : "text-sky-600 hover:bg-sky-50"
                                }`}
                        >
                            <Calendar className="w-3.5 h-3.5 lg:w-5 lg:h-5 xl:w-6 xl:h-6" />
                            This Week
                        </button>
                        <button
                            onClick={() => handlePoolChange("all")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 lg:px-4 lg:py-2 xl:px-5 xl:py-2.5 rounded-md text-sm lg:text-base xl:text-lg font-medium transition-all ${wordPool === "all"
                                ? "bg-sky-500 text-white shadow-sm"
                                : "text-sky-600 hover:bg-sky-50"
                                }`}
                        >
                            <CalendarRange className="w-3.5 h-3.5 lg:w-5 lg:h-5 xl:w-6 xl:h-6" />
                            All Weeks
                        </button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-6 lg:p-8 xl:p-12">
                <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 lg:gap-8 xl:gap-12 items-center">
                    {/* Snowman */}
                    <div className="flex justify-center">
                        <div className="relative w-40 h-56 md:w-44 md:h-60 lg:w-72 lg:h-96 xl:w-96 xl:h-[28rem] 2xl:w-[28rem] 2xl:h-[32rem]">
                            <SnowmanSVG wrongGuesses={wrongGuesses} className="w-full h-full" />
                        </div>
                    </div>

                    {/* Game area */}
                    <div className="space-y-6 lg:space-y-8 xl:space-y-10">
                        {/* Word display */}
                        <div className="text-center">
                            <div className="flex justify-center items-center gap-1.5 lg:gap-2.5 xl:gap-3 flex-nowrap mb-2 overflow-x-auto">
                                {displayWord.map((letter, i) => (
                                    <span
                                        key={i}
                                        className={`
                                            inline-flex items-center justify-center flex-shrink-0
                                            w-9 h-11 md:w-10 md:h-12 lg:w-14 lg:h-16 xl:w-20 xl:h-24 2xl:w-24 2xl:h-28
                                            text-xl md:text-2xl lg:text-3xl xl:text-5xl 2xl:text-6xl font-bold
                                            rounded-lg transition-all duration-300
                                            ${letter === "_"
                                                ? "border-b-4 lg:border-b-[6px] xl:border-b-8 border-sky-400 text-transparent"
                                                : VOWELS.has(letter)
                                                    ? "bg-amber-100 text-amber-700 border-2 lg:border-3 xl:border-4 border-amber-300"
                                                    : "bg-sky-100 text-sky-800 border-2 lg:border-3 xl:border-4 border-sky-300 scale-105"
                                            }
                                            ${isLost && letter !== "_" && !guessedLetters.has(letter) && !VOWELS.has(letter)
                                                ? "bg-red-100 text-red-600 border-red-300"
                                                : ""
                                            }
                                        `}
                                    >
                                        {letter === "_" ? "\u00A0" : letter}
                                    </span>
                                ))}
                            </div>
                            <p className="text-xs lg:text-sm xl:text-base 2xl:text-lg text-gray-400 mt-2">
                                <span className="inline-block w-3 h-3 lg:w-4 lg:h-4 xl:w-5 xl:h-5 bg-amber-100 border border-amber-300 rounded mr-1"></span>
                                vowels (free)
                                <span className="inline-block w-3 h-3 lg:w-4 lg:h-4 xl:w-5 xl:h-5 bg-sky-100 border border-sky-300 rounded mr-1 ml-3"></span>
                                consonants (guess these!)
                            </p>
                        </div>

                        {/* Win/Lose message */}
                        {isGameOver && (
                            <div
                                className={`text-center p-4 lg:p-6 xl:p-8 rounded-xl border-2 ${isWon
                                    ? "bg-green-50 border-green-300"
                                    : "bg-red-50 border-red-300"
                                    }`}
                            >
                                {isWon ? (
                                    <div className="space-y-2 lg:space-y-3">
                                        <Trophy className="w-10 h-10 lg:w-14 lg:h-14 xl:w-20 xl:h-20 mx-auto text-yellow-500" />
                                        <p className="font-bold text-lg lg:text-2xl xl:text-3xl 2xl:text-4xl text-green-700">Great job! 🎉</p>
                                        <p className="text-sm lg:text-base xl:text-xl 2xl:text-2xl text-green-600">
                                            You saved the snowman!
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 lg:space-y-3">
                                        <Frown className="w-10 h-10 lg:w-14 lg:h-14 xl:w-20 xl:h-20 mx-auto text-red-400" />
                                        <p className="font-bold text-lg lg:text-2xl xl:text-3xl 2xl:text-4xl text-red-700">Oh no! The snowman melted!</p>
                                        <p className="text-sm lg:text-base xl:text-xl 2xl:text-2xl text-red-600">
                                            The word was: <strong>{currentWord}</strong>
                                        </p>
                                    </div>
                                )}
                                <Button
                                    onClick={() => pickNewWord()}
                                    className="mt-4 lg:mt-6 bg-sky-500 hover:bg-sky-600 text-white lg:text-lg xl:text-xl lg:px-6 lg:py-3 xl:px-8 xl:py-4"
                                >
                                    <RotateCcw className="w-4 h-4 lg:w-5 lg:h-5 xl:w-6 xl:h-6 mr-2" />
                                    Play Again
                                </Button>
                            </div>
                        )}

                        {/* Consonant keyboard */}
                        {!isGameOver && (
                            <div className="space-y-2 lg:space-y-3">
                                <p className="text-xs lg:text-sm xl:text-base 2xl:text-lg font-medium text-gray-500 text-center">Choose a consonant:</p>
                                <div className="flex flex-wrap justify-center gap-2 lg:gap-3 xl:gap-4">
                                    {CONSONANTS.map((letter) => {
                                        const isGuessed = guessedLetters.has(letter);
                                        const isInWord = currentWord.includes(letter);
                                        return (
                                            <button
                                                key={letter}
                                                onClick={() => handleGuess(letter)}
                                                disabled={isGuessed}
                                                className={`
                                                    w-10 h-10 md:w-11 md:h-11 lg:w-14 lg:h-14 xl:w-20 xl:h-20 2xl:w-24 2xl:h-24
                                                    rounded-lg font-bold text-lg lg:text-2xl xl:text-4xl 2xl:text-5xl
                                                    transition-all duration-200
                                                    ${isGuessed
                                                        ? isInWord
                                                            ? "bg-green-200 text-green-700 border-2 lg:border-3 xl:border-4 border-green-300 opacity-60 cursor-not-allowed"
                                                            : "bg-red-100 text-red-400 border-2 lg:border-3 xl:border-4 border-red-200 opacity-40 cursor-not-allowed line-through"
                                                        : "bg-white text-gray-800 border-2 lg:border-3 xl:border-4 border-gray-300 hover:border-sky-400 hover:bg-sky-50 hover:scale-110 hover:shadow-md active:scale-95 cursor-pointer"
                                                    }
                                                `}
                                            >
                                                {letter}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* New word button (bottom, subtle) */}
                {!isGameOver && (
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
        </Card>
    );
}
