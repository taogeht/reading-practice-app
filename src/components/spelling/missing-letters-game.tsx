"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import confetti from "canvas-confetti";
import {
    Puzzle,
    RotateCcw,
    Trophy,
    Frown,
    Loader2,
    Sparkles,
    Calendar,
    CalendarRange,
    Volume2,
    Play,
    Lightbulb,
    Eye,
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

interface LetterSlot {
    letter: string;
    isBlank: boolean;
    index: number;
}

const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const MAX_WRONG = 3;

/**
 * Determine which letter positions to blank based on word length and difficulty.
 * - Always keep first letter visible
 * - Short words (3-4): blank 1 letter
 * - Medium words (5-6): blank 2 letters
 * - Long words (7+): blank 3-4 letters
 * - Prefer blanking consonants over vowels
 */
function generateBlanks(word: string): LetterSlot[] {
    const letters = word.toLowerCase().split("");
    const len = letters.length;

    let blanksNeeded: number;
    if (len <= 2) {
        blanksNeeded = 1;
    } else if (len <= 4) {
        blanksNeeded = 1;
    } else if (len <= 6) {
        blanksNeeded = 2;
    } else if (len <= 8) {
        blanksNeeded = 3;
    } else {
        blanksNeeded = 4;
    }

    // Ensure we don't blank more letters than available (excluding first letter)
    blanksNeeded = Math.min(blanksNeeded, len - 1);

    // Collect candidate indices (skip index 0 - always keep first letter)
    const consonantIndices: number[] = [];
    const vowelIndices: number[] = [];

    for (let i = 1; i < len; i++) {
        if (!/[a-z]/.test(letters[i])) continue; // skip non-alpha
        if (VOWELS.has(letters[i])) {
            vowelIndices.push(i);
        } else {
            consonantIndices.push(i);
        }
    }

    // Shuffle helper
    const shuffle = (arr: number[]) => {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    };

    // Prefer consonants, then vowels
    const shuffledConsonants = shuffle(consonantIndices);
    const shuffledVowels = shuffle(vowelIndices);
    const candidates = [...shuffledConsonants, ...shuffledVowels];

    const blankSet = new Set<number>();
    for (const idx of candidates) {
        if (blankSet.size >= blanksNeeded) break;
        blankSet.add(idx);
    }

    return letters.map((letter, index) => ({
        letter,
        isBlank: blankSet.has(index),
        index,
    }));
}

interface MissingLettersGameProps {
    initialLists?: SpellingList[];
    skipTracking?: boolean;
}

export function MissingLettersGame({ initialLists, skipTracking }: MissingLettersGameProps = {}) {
    const [lists, setLists] = useState<SpellingList[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentWordObj, setCurrentWordObj] = useState<SpellingWord | null>(null);
    const [currentClassId, setCurrentClassId] = useState<string | null>(null);
    const [letterSlots, setLetterSlots] = useState<LetterSlot[]>([]);
    const [userInputs, setUserInputs] = useState<Record<number, string>>({});
    const [wrongGuesses, setWrongGuesses] = useState(0);
    const [gameState, setGameState] = useState<"playing" | "won" | "lost">("playing");
    const [wordsCompleted, setWordsCompleted] = useState(0);
    const [streak, setStreak] = useState(0);
    const [wordsPlayed, setWordsPlayed] = useState<Set<string>>(new Set());
    const [wordPool, setWordPool] = useState<"current" | "all">("current");
    const [wrongIndices, setWrongIndices] = useState<Set<number>>(new Set());
    const [correctIndices, setCorrectIndices] = useState<Set<number>>(new Set());
    const [hintUsed, setHintUsed] = useState(false);
    const [playingAudio, setPlayingAudio] = useState(false);

    const roundStartRef = useRef<number>(Date.now());
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

    useEffect(() => {
        if (initialLists) {
            setLists(initialLists);
            setLoading(false);
            if (initialLists.length > 0 && initialLists[0].words.length > 0) {
                const words = initialLists[0].words;
                const randomWord = words[Math.floor(Math.random() * words.length)];
                initializeWord(randomWord, initialLists[0].class.id);
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

                if (data.length > 0 && data[0].words.length > 0) {
                    const words = data[0].words;
                    const randomWord = words[Math.floor(Math.random() * words.length)];
                    initializeWord(randomWord, data[0].class.id);
                }
            }
        } catch (error) {
            console.error("Error fetching spelling lists:", error);
        } finally {
            setLoading(false);
        }
    };

    const getWordObjectsForPool = useCallback((pool: "current" | "all") => {
        const words: { word: SpellingWord; classId: string }[] = [];
        if (pool === "current" && lists.length > 0) {
            for (const word of lists[0].words) {
                words.push({ word, classId: lists[0].class.id });
            }
        } else {
            for (const list of lists) {
                for (const word of list.words) {
                    words.push({ word, classId: list.class.id });
                }
            }
        }
        return words;
    }, [lists]);

    const getAllWords = useCallback(() => {
        return getWordObjectsForPool(wordPool);
    }, [getWordObjectsForPool, wordPool]);

    const initializeWord = (wordObj: SpellingWord, classId: string) => {
        const slots = generateBlanks(wordObj.word);
        setCurrentWordObj(wordObj);
        setCurrentClassId(classId);
        setLetterSlots(slots);
        setUserInputs({});
        setWrongGuesses(0);
        setGameState("playing");
        setWrongIndices(new Set());
        setCorrectIndices(new Set());
        setHintUsed(false);
        roundStartRef.current = Date.now();

        // Focus first blank after render
        setTimeout(() => {
            const firstBlank = slots.find(s => s.isBlank);
            if (firstBlank && inputRefs.current[firstBlank.index]) {
                inputRefs.current[firstBlank.index]?.focus();
            }
        }, 100);
    };

    const pickNewWord = useCallback((overridePool?: "current" | "all") => {
        const pool = overridePool || wordPool;
        const allWordObjects = getWordObjectsForPool(pool);
        if (allWordObjects.length === 0) return;

        const unplayed = allWordObjects.filter((w) => !wordsPlayed.has(w.word.id));
        const wordChoices = unplayed.length > 0 ? unplayed : allWordObjects;
        const chosen = wordChoices[Math.floor(Math.random() * wordChoices.length)];

        setWordsPlayed((prev) => new Set(prev).add(chosen.word.id));
        initializeWord(chosen.word, chosen.classId);
    }, [getWordObjectsForPool, wordPool, wordsPlayed]);

    const handlePoolChange = (newPool: "current" | "all") => {
        setWordPool(newPool);
        pickNewWord(newPool);
    };

    const reportResult = useCallback((won: boolean, wrongCount: number) => {
        if (skipTracking) return;
        if (!currentWordObj || !currentClassId) return;
        const timeSeconds = Math.round((Date.now() - roundStartRef.current) / 1000);
        fetch('/api/student/spelling-game/results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                spellingWordId: currentWordObj.id,
                classId: currentClassId,
                won,
                wrongGuesses: wrongCount,
                guessedLetters: Object.values(userInputs),
                timeSeconds,
                activityType: 'missing-letters',
            }),
        }).catch(() => { });
    }, [currentWordObj, currentClassId, userInputs]);

    const triggerConfetti = () => {
        const end = Date.now() + 1.5 * 1000;
        const colors = ['#a864fd', '#29cdff', '#78ff44', '#ff718d', '#fdff6a'];

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
    };

    const playAudio = () => {
        if (!currentWordObj?.audioUrl) return;
        if (audioRef.current) {
            audioRef.current.pause();
        }
        const audio = new Audio(currentWordObj.audioUrl);
        audioRef.current = audio;
        setPlayingAudio(true);
        audio.onended = () => setPlayingAudio(false);
        audio.onerror = () => setPlayingAudio(false);
        audio.play().catch(() => setPlayingAudio(false));
    };

    const getBlankIndices = () => letterSlots.filter(s => s.isBlank).map(s => s.index);

    const getNextBlankIndex = (currentIndex: number) => {
        const blanks = getBlankIndices();
        const currentPos = blanks.indexOf(currentIndex);
        if (currentPos < blanks.length - 1) {
            return blanks[currentPos + 1];
        }
        return null;
    };

    const getPrevBlankIndex = (currentIndex: number) => {
        const blanks = getBlankIndices();
        const currentPos = blanks.indexOf(currentIndex);
        if (currentPos > 0) {
            return blanks[currentPos - 1];
        }
        return null;
    };

    const checkWord = (inputs: Record<number, string>) => {
        const blanks = getBlankIndices();
        const allFilled = blanks.every(idx => inputs[idx] && inputs[idx].length > 0);
        if (!allFilled) return;

        // Check each blank
        const newWrongIndices = new Set<number>();
        const newCorrectIndices = new Set<number>(correctIndices);
        let allCorrect = true;

        for (const idx of blanks) {
            const expected = letterSlots[idx].letter.toLowerCase();
            const actual = (inputs[idx] || "").toLowerCase();
            if (actual === expected) {
                newCorrectIndices.add(idx);
            } else {
                newWrongIndices.add(idx);
                allCorrect = false;
            }
        }

        if (allCorrect) {
            // Won!
            setGameState("won");
            setCorrectIndices(new Set(blanks));
            setWrongIndices(new Set());
            setStreak((prev) => prev + 1);
            setWordsCompleted((prev) => prev + 1);
            triggerConfetti();
            reportResult(true, wrongGuesses);

            // Auto-advance after delay
            setTimeout(() => {
                pickNewWord();
            }, 2500);
        } else {
            // Wrong
            const newWrong = wrongGuesses + 1;
            setWrongGuesses(newWrong);
            setWrongIndices(newWrongIndices);
            setCorrectIndices(newCorrectIndices);

            if (newWrong >= MAX_WRONG) {
                setGameState("lost");
                setStreak(0);
                reportResult(false, newWrong);
            } else {
                // Clear only wrong letters after a brief flash
                setTimeout(() => {
                    setUserInputs(prev => {
                        const updated = { ...prev };
                        for (const idx of newWrongIndices) {
                            delete updated[idx];
                        }
                        return updated;
                    });
                    setWrongIndices(new Set());

                    // Focus first wrong blank
                    const firstWrong = blanks.find(idx => newWrongIndices.has(idx));
                    if (firstWrong !== undefined && inputRefs.current[firstWrong]) {
                        inputRefs.current[firstWrong]?.focus();
                    }
                }, 800);
            }
        }
    };

    const handleInputChange = (slotIndex: number, value: string) => {
        if (gameState !== "playing") return;

        // Only accept single letter
        const letter = value.slice(-1).toLowerCase();
        if (letter && !/[a-z]/.test(letter)) return;

        const newInputs = { ...userInputs };
        if (letter) {
            newInputs[slotIndex] = letter;
        } else {
            delete newInputs[slotIndex];
        }
        setUserInputs(newInputs);

        // Clear wrong highlight for this index
        if (wrongIndices.has(slotIndex)) {
            const newWrong = new Set(wrongIndices);
            newWrong.delete(slotIndex);
            setWrongIndices(newWrong);
        }

        if (letter) {
            // Check if all blanks are filled
            const blanks = getBlankIndices();
            const allFilled = blanks.every(idx => {
                if (idx === slotIndex) return true;
                return newInputs[idx] && newInputs[idx].length > 0;
            });

            if (allFilled) {
                // Auto-check
                setTimeout(() => checkWord(newInputs), 150);
            } else {
                // Auto-advance to next blank
                const nextIdx = getNextBlankIndex(slotIndex);
                if (nextIdx !== null && inputRefs.current[nextIdx]) {
                    inputRefs.current[nextIdx]?.focus();
                }
            }
        }
    };

    const handleKeyDown = (slotIndex: number, e: React.KeyboardEvent) => {
        if (e.key === "Backspace" && !userInputs[slotIndex]) {
            const prevIdx = getPrevBlankIndex(slotIndex);
            if (prevIdx !== null) {
                const newInputs = { ...userInputs };
                delete newInputs[prevIdx];
                setUserInputs(newInputs);
                inputRefs.current[prevIdx]?.focus();
            }
        } else if (e.key === "ArrowLeft") {
            const prevIdx = getPrevBlankIndex(slotIndex);
            if (prevIdx !== null) {
                inputRefs.current[prevIdx]?.focus();
            }
        } else if (e.key === "ArrowRight") {
            const nextIdx = getNextBlankIndex(slotIndex);
            if (nextIdx !== null) {
                inputRefs.current[nextIdx]?.focus();
            }
        }
    };

    const handleHint = () => {
        if (gameState !== "playing" || hintUsed) return;
        setHintUsed(true);

        // Reveal one blank letter
        const blanks = getBlankIndices();
        const unfilledBlanks = blanks.filter(idx => !userInputs[idx] && !correctIndices.has(idx));
        if (unfilledBlanks.length > 0) {
            const hintIdx = unfilledBlanks[0];
            const newInputs = { ...userInputs, [hintIdx]: letterSlots[hintIdx].letter.toLowerCase() };
            setUserInputs(newInputs);
            setCorrectIndices(prev => new Set(prev).add(hintIdx));

            // Check if all blanks now filled
            const allFilled = blanks.every(idx => {
                if (idx === hintIdx) return true;
                return newInputs[idx] && newInputs[idx].length > 0;
            });

            if (allFilled) {
                setTimeout(() => checkWord(newInputs), 150);
            } else {
                // Focus next empty blank
                const nextEmpty = blanks.find(idx => idx !== hintIdx && !newInputs[idx]);
                if (nextEmpty !== undefined && inputRefs.current[nextEmpty]) {
                    inputRefs.current[nextEmpty]?.focus();
                }
            }
        }
    };

    if (loading) {
        return (
            <Card className="border-2 border-purple-200 shadow-lg">
                <CardHeader className="bg-gradient-to-r from-purple-100 via-pink-50 to-fuchsia-100 border-b border-purple-100 py-5 lg:py-6 xl:py-8">
                    <CardTitle className="flex items-center gap-3 text-purple-700 text-xl lg:text-2xl xl:text-3xl 2xl:text-4xl">
                        <Puzzle className="w-7 h-7 lg:w-9 lg:h-9 xl:w-12 xl:h-12" />
                        Missing Letters
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

    if (lists.length === 0 || getAllWords().length === 0) {
        return null;
    }

    if (!currentWordObj) {
        pickNewWord();
        return null;
    }

    const isWon = gameState === "won";
    const isLost = gameState === "lost";
    const isGameOver = isWon || isLost;

    return (
        <Card className="border-2 border-purple-200 shadow-lg overflow-hidden relative">
            <CardHeader className="bg-gradient-to-r from-purple-100 via-pink-50 to-fuchsia-100 border-b border-purple-100 py-5 lg:py-6 xl:py-8">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <CardTitle className="flex items-center gap-3 text-purple-700 text-xl lg:text-2xl xl:text-3xl 2xl:text-4xl">
                        <Puzzle className="w-7 h-7 lg:w-9 lg:h-9 xl:w-12 xl:h-12" />
                        Missing Letters
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        {streak > 0 && (
                            <Badge className="bg-amber-500 hover:bg-amber-600 text-sm lg:text-base xl:text-lg 2xl:text-xl px-3 py-1 lg:px-4 lg:py-1.5 xl:px-5 xl:py-2">
                                {streak} streak
                            </Badge>
                        )}
                        <Badge variant="outline" className="border-purple-300 text-purple-700 text-sm lg:text-base xl:text-lg 2xl:text-xl px-3 py-1 lg:px-4 lg:py-1.5 xl:px-5 xl:py-2">
                            {wordsCompleted} completed
                        </Badge>
                        <Badge variant="outline" className="border-orange-300 text-orange-700 text-sm lg:text-base xl:text-lg 2xl:text-xl px-3 py-1 lg:px-4 lg:py-1.5 xl:px-5 xl:py-2">
                            {MAX_WRONG - wrongGuesses} tries left
                        </Badge>
                    </div>
                </div>
                <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                    <p className="text-sm lg:text-base xl:text-lg 2xl:text-xl text-purple-600">
                        Fill in the missing letters to complete the word!
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
                <div className="flex flex-col items-center space-y-6 lg:space-y-8 xl:space-y-10">
                    {/* Word image and audio */}
                    <div className="flex flex-col items-center gap-4">
                        {currentWordObj.imageUrl && (
                            <img
                                src={currentWordObj.imageUrl}
                                alt="Word hint"
                                className="w-32 h-32 lg:w-40 lg:h-40 xl:w-48 xl:h-48 rounded-2xl object-cover border-4 border-purple-100 shadow-lg"
                            />
                        )}
                        {currentWordObj.audioUrl && (
                            <button
                                onClick={playAudio}
                                className={`
                                    w-16 h-16 lg:w-20 lg:h-20 xl:w-24 xl:h-24 rounded-full flex items-center justify-center
                                    transition-all shadow-lg active:scale-95
                                    ${playingAudio
                                        ? "bg-purple-600 text-white scale-105"
                                        : "bg-gradient-to-br from-purple-500 to-fuchsia-500 text-white hover:scale-105"
                                    }
                                `}
                                title="Listen to the word"
                            >
                                {playingAudio ? (
                                    <Volume2 className="w-8 h-8 lg:w-10 lg:h-10 xl:w-12 xl:h-12 animate-pulse" />
                                ) : (
                                    <Play className="w-8 h-8 lg:w-10 lg:h-10 xl:w-12 xl:h-12 ml-1" />
                                )}
                            </button>
                        )}
                    </div>

                    {/* Letter slots */}
                    <div className="flex items-center justify-center gap-1.5 lg:gap-2 xl:gap-3 flex-wrap">
                        {letterSlots.map((slot) => {
                            const isBlank = slot.isBlank;
                            const isWrongSlot = wrongIndices.has(slot.index);
                            const isCorrectSlot = correctIndices.has(slot.index);
                            const userValue = userInputs[slot.index] || "";

                            if (!isBlank) {
                                // Static visible letter
                                return (
                                    <div
                                        key={slot.index}
                                        className={`
                                            inline-flex items-center justify-center
                                            w-10 h-12 md:w-12 md:h-14 lg:w-16 lg:h-20 xl:w-20 xl:h-24 2xl:w-24 2xl:h-28
                                            rounded-lg font-bold uppercase
                                            text-xl md:text-2xl lg:text-3xl xl:text-4xl 2xl:text-5xl
                                            ${isWon
                                                ? "bg-green-100 text-green-700 border-2 lg:border-3 xl:border-4 border-green-300"
                                                : isLost
                                                    ? "bg-gray-100 text-gray-500 border-2 lg:border-3 xl:border-4 border-gray-300"
                                                    : "bg-purple-50 text-purple-800 border-2 lg:border-3 xl:border-4 border-purple-200"
                                            }
                                            transition-all duration-300
                                        `}
                                    >
                                        {slot.letter}
                                    </div>
                                );
                            }

                            // Blank input slot
                            if (isLost) {
                                // Reveal the letter on loss
                                return (
                                    <div
                                        key={slot.index}
                                        className="
                                            inline-flex items-center justify-center
                                            w-10 h-12 md:w-12 md:h-14 lg:w-16 lg:h-20 xl:w-20 xl:h-24 2xl:w-24 2xl:h-28
                                            rounded-lg font-bold uppercase
                                            text-xl md:text-2xl lg:text-3xl xl:text-4xl 2xl:text-5xl
                                            bg-red-100 text-red-600 border-2 lg:border-3 xl:border-4 border-red-300
                                            transition-all duration-300
                                        "
                                    >
                                        {slot.letter}
                                    </div>
                                );
                            }

                            if (isWon) {
                                return (
                                    <div
                                        key={slot.index}
                                        className="
                                            inline-flex items-center justify-center
                                            w-10 h-12 md:w-12 md:h-14 lg:w-16 lg:h-20 xl:w-20 xl:h-24 2xl:w-24 2xl:h-28
                                            rounded-lg font-bold uppercase
                                            text-xl md:text-2xl lg:text-3xl xl:text-4xl 2xl:text-5xl
                                            bg-green-200 text-green-700 border-2 lg:border-3 xl:border-4 border-green-400
                                            transition-all duration-300 scale-105
                                        "
                                    >
                                        {slot.letter}
                                    </div>
                                );
                            }

                            return (
                                <input
                                    key={slot.index}
                                    ref={(el) => { inputRefs.current[slot.index] = el; }}
                                    type="text"
                                    maxLength={1}
                                    value={userValue}
                                    onChange={(e) => handleInputChange(slot.index, e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(slot.index, e)}
                                    disabled={isGameOver || isCorrectSlot}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    className={`
                                        inline-flex items-center justify-center text-center
                                        w-10 h-12 md:w-12 md:h-14 lg:w-16 lg:h-20 xl:w-20 xl:h-24 2xl:w-24 2xl:h-28
                                        rounded-lg font-bold uppercase
                                        text-xl md:text-2xl lg:text-3xl xl:text-4xl 2xl:text-5xl
                                        outline-none transition-all duration-200
                                        ${isWrongSlot
                                            ? "bg-red-100 text-red-600 border-3 lg:border-4 xl:border-[5px] border-red-400 animate-shake"
                                            : isCorrectSlot
                                                ? "bg-green-100 text-green-700 border-2 lg:border-3 xl:border-4 border-green-400"
                                                : userValue
                                                    ? "bg-amber-50 text-amber-800 border-2 lg:border-3 xl:border-4 border-amber-300"
                                                    : "bg-white border-2 lg:border-3 xl:border-4 border-dashed border-purple-300 hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                                        }
                                    `}
                                />
                            );
                        })}
                    </div>

                    {/* Win/Lose message */}
                    {isGameOver && (
                        <div
                            className={`text-center p-4 lg:p-6 xl:p-8 rounded-xl border-2 w-full max-w-md ${
                                isWon
                                    ? "bg-green-50 border-green-300"
                                    : "bg-red-50 border-red-300"
                            }`}
                        >
                            {isWon ? (
                                <div className="space-y-2 lg:space-y-3">
                                    <Trophy className="w-10 h-10 lg:w-14 lg:h-14 xl:w-20 xl:h-20 mx-auto text-yellow-500" />
                                    <p className="font-bold text-lg lg:text-2xl xl:text-3xl 2xl:text-4xl text-green-700">
                                        Amazing!
                                    </p>
                                    <p className="text-sm lg:text-base xl:text-xl 2xl:text-2xl text-green-600">
                                        You filled in all the letters!
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2 lg:space-y-3">
                                    <Frown className="w-10 h-10 lg:w-14 lg:h-14 xl:w-20 xl:h-20 mx-auto text-red-400" />
                                    <p className="font-bold text-lg lg:text-2xl xl:text-3xl 2xl:text-4xl text-red-700">
                                        Not quite!
                                    </p>
                                    <p className="text-sm lg:text-base xl:text-xl 2xl:text-2xl text-red-600">
                                        The word was: <strong className="uppercase">{currentWordObj.word}</strong>
                                    </p>
                                    <Button
                                        onClick={() => pickNewWord()}
                                        className="mt-4 lg:mt-6 bg-purple-500 hover:bg-purple-600 text-white lg:text-lg xl:text-xl lg:px-6 lg:py-3 xl:px-8 xl:py-4"
                                    >
                                        <RotateCcw className="w-4 h-4 lg:w-5 lg:h-5 xl:w-6 xl:h-6 mr-2" />
                                        Try Another Word
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Hint + encouragement area */}
                    {!isGameOver && (
                        <div className="flex flex-col items-center gap-3">
                            {wrongGuesses > 0 && wrongGuesses < MAX_WRONG && (
                                <p className="text-sm lg:text-base xl:text-lg text-orange-600 font-medium">
                                    {wrongGuesses === 1
                                        ? "Almost! Some letters were wrong. Try again!"
                                        : "Keep trying! You can do it!"}
                                </p>
                            )}
                            <div className="flex items-center gap-3">
                                {!hintUsed && (
                                    <Button
                                        variant="outline"
                                        onClick={handleHint}
                                        className="border-amber-300 text-amber-700 hover:bg-amber-50 lg:text-base xl:text-lg"
                                    >
                                        <Lightbulb className="w-4 h-4 lg:w-5 lg:h-5 mr-1.5" />
                                        Hint
                                    </Button>
                                )}
                                {hintUsed && (
                                    <Badge variant="outline" className="border-amber-200 text-amber-500 text-sm lg:text-base">
                                        <Eye className="w-3.5 h-3.5 mr-1" />
                                        Hint used
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs lg:text-sm xl:text-base text-purple-400">
                                Type the missing letters and the word checks automatically!
                            </p>
                        </div>
                    )}
                </div>

                {/* Skip word button */}
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
