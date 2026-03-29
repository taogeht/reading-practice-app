"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import confetti from "canvas-confetti";
import {
    Layers,
    RotateCcw,
    Star,
    Loader2,
    Volume2,
    Play,
    Pause,
    Calendar,
    CalendarRange,
    ArrowLeft,
    Sparkles,
    Eye,
    Languages,
    ImageIcon,
} from "lucide-react";

interface SpellingWord {
    id: string;
    word: string;
    syllables: string[] | null;
    audioUrl: string | null;
    imageUrl: string | null;
    mandarinTranslation: string | null;
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

interface DeckCard {
    word: SpellingWord;
    retries: number;
    cardStartTime: number;
    totalTime: number;
}

// Vibrant colors for syllables - same as student-spelling-section
const SYLLABLE_COLORS = [
    { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-300" },
    { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-300" },
    { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
    { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-300" },
    { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-300" },
    { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
];

function SyllableWord({ word, syllables }: { word: string; syllables: string[] | null }) {
    const hasSyllables = syllables && syllables.length > 1;
    if (!hasSyllables) {
        return <span className="font-bold text-4xl text-gray-800">{word}</span>;
    }
    return (
        <div className="flex flex-wrap items-center gap-2 justify-center">
            {syllables.map((syllable, index) => {
                const colors = SYLLABLE_COLORS[index % SYLLABLE_COLORS.length];
                return (
                    <span
                        key={index}
                        className={`px-4 py-2 text-3xl rounded-lg font-bold border-2 ${colors.bg} ${colors.text} ${colors.border}`}
                    >
                        {syllable}
                    </span>
                );
            })}
        </div>
    );
}

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

type PromptMode = "image" | "mandarin" | "audio";

function getAvailableModes(word: SpellingWord): PromptMode[] {
    const modes: PromptMode[] = [];
    if (word.imageUrl) modes.push("image");
    if (word.mandarinTranslation) modes.push("mandarin");
    if (word.audioUrl) modes.push("audio");
    return modes.length > 0 ? modes : ["audio"];
}

export function FlashcardGame() {
    const [lists, setLists] = useState<SpellingList[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedList, setSelectedList] = useState<SpellingList | null>(null);
    const [selectedWeek, setSelectedWeek] = useState<"current" | "previous">("current");
    const [promptMode, setPromptMode] = useState<PromptMode>("image");

    // Game state
    const [deck, setDeck] = useState<DeckCard[]>([]);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [knownCount, setKnownCount] = useState(0);
    const [totalCards, setTotalCards] = useState(0);
    const [gameComplete, setGameComplete] = useState(false);
    const [gameStarted, setGameStarted] = useState(false);

    const [playingAudio, setPlayingAudio] = useState(false);
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

    const startGame = useCallback((list: SpellingList, mode: PromptMode) => {
        const cards: DeckCard[] = shuffle(list.words).map((w) => ({
            word: w,
            retries: 0,
            cardStartTime: Date.now(),
            totalTime: 0,
        }));
        // Reset card start times
        if (cards.length > 0) {
            cards[0].cardStartTime = Date.now();
        }
        setSelectedList(list);
        setPromptMode(mode);
        setDeck(cards);
        setIsFlipped(false);
        setKnownCount(0);
        setTotalCards(list.words.length);
        setGameComplete(false);
        setGameStarted(true);
    }, []);

    const flipCard = () => {
        if (!isFlipped && deck.length > 0) {
            setIsFlipped(true);
            // Auto-play audio on reveal
            const currentWord = deck[0].word;
            if (currentWord.audioUrl) {
                playAudio(currentWord.audioUrl);
            }
        }
    };

    const playAudio = (url: string) => {
        if (audioRef.current) {
            audioRef.current.pause();
        }
        const audio = new Audio(url);
        audioRef.current = audio;
        setPlayingAudio(true);
        audio.onended = () => setPlayingAudio(false);
        audio.onerror = () => setPlayingAudio(false);
        audio.play();
    };

    const handleKnewIt = async () => {
        if (deck.length === 0) return;

        const current = deck[0];
        const timeSpent = current.totalTime + (Date.now() - current.cardStartTime);

        // Save result
        if (selectedList) {
            fetch("/api/student/spelling-game/results", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    spellingWordId: current.word.id,
                    classId: selectedList.class.id,
                    won: true,
                    wrongGuesses: current.retries,
                    guessedLetters: null,
                    activityType: "flashcard",
                    timeSeconds: Math.round(timeSpent / 1000),
                }),
            }).catch(console.error);
        }

        const newKnownCount = knownCount + 1;
        setKnownCount(newKnownCount);

        // Small confetti burst for each correct card
        confetti({
            particleCount: 30,
            spread: 50,
            origin: { y: 0.7 },
            colors: ["#fbbf24", "#f59e0b", "#d97706"],
        });

        const remaining = deck.slice(1);
        if (remaining.length === 0) {
            // Game complete!
            setDeck([]);
            setGameComplete(true);
            // Big celebration
            setTimeout(() => {
                confetti({
                    particleCount: 150,
                    spread: 100,
                    origin: { y: 0.5 },
                });
                setTimeout(() => {
                    confetti({
                        particleCount: 100,
                        spread: 120,
                        origin: { y: 0.6, x: 0.3 },
                    });
                    confetti({
                        particleCount: 100,
                        spread: 120,
                        origin: { y: 0.6, x: 0.7 },
                    });
                }, 300);
            }, 200);
        } else {
            // Hide card, swap content, then show the new card face-down
            setIsTransitioning(true);
            setTimeout(() => {
                remaining[0].cardStartTime = Date.now();
                setDeck(remaining);
                setIsFlipped(false);
                setIsTransitioning(false);
            }, 50);
        }
    };

    const handleShowAgain = () => {
        if (deck.length === 0) return;

        const current = { ...deck[0] };
        current.retries += 1;
        current.totalTime += Date.now() - current.cardStartTime;

        const remaining = deck.slice(1);

        // Insert at a random position at least 2 cards from the front (or at the end if deck is small)
        const minPos = Math.min(2, remaining.length);
        const insertPos = minPos + Math.floor(Math.random() * (remaining.length - minPos + 1));
        remaining.splice(insertPos, 0, current);

        // Hide card, swap content, then show the new card face-down
        setIsTransitioning(true);
        setTimeout(() => {
            remaining[0].cardStartTime = Date.now();
            setDeck(remaining);
            setIsFlipped(false);
            setIsTransitioning(false);
        }, 50);
    };

    const resetGame = () => {
        setGameStarted(false);
        setGameComplete(false);
        setSelectedList(null);
        setDeck([]);
        setIsFlipped(false);
        setKnownCount(0);
    };

    // Determine best default prompt mode for a list
    const getBestMode = (list: SpellingList): PromptMode => {
        const hasImages = list.words.some((w) => w.imageUrl);
        const hasMandarin = list.words.some((w) => w.mandarinTranslation);
        if (hasImages) return "image";
        if (hasMandarin) return "mandarin";
        return "audio";
    };

    // Loading state
    if (loading) {
        return (
            <Card className="border-2 border-amber-200">
                <CardHeader className="bg-gradient-to-r from-amber-50 to-yellow-50">
                    <CardTitle className="flex items-center gap-2 text-amber-700">
                        <Layers className="w-6 h-6" />
                        Flashcards
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (lists.length === 0) {
        return (
            <Card className="border-2 border-amber-200">
                <CardHeader className="bg-gradient-to-r from-amber-50 to-yellow-50">
                    <CardTitle className="flex items-center gap-2 text-amber-700">
                        <Layers className="w-6 h-6" />
                        Flashcards
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-center text-gray-500 py-8">No spelling lists available yet.</p>
                </CardContent>
            </Card>
        );
    }

    // Celebration screen
    if (gameComplete) {
        return (
            <Card className="border-2 border-amber-200 overflow-hidden">
                <CardContent className="p-0">
                    <div className="bg-gradient-to-br from-yellow-100 via-amber-50 to-orange-100 py-12 px-6 text-center space-y-6">
                        <div className="text-7xl animate-bounce">
                            🌟
                        </div>
                        <h2 className="text-3xl font-bold text-amber-800">
                            Amazing Job!
                        </h2>
                        <p className="text-xl text-amber-700">
                            You learned all {totalCards} words!
                        </p>
                        <div className="flex justify-center gap-2 flex-wrap">
                            {Array.from({ length: totalCards }).map((_, i) => (
                                <Star
                                    key={i}
                                    className="w-8 h-8 text-yellow-500 fill-yellow-400"
                                />
                            ))}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                            <Button
                                onClick={() => {
                                    if (selectedList) startGame(selectedList, promptMode);
                                }}
                                className="bg-amber-500 hover:bg-amber-600 text-white text-lg px-6 py-3"
                            >
                                <RotateCcw className="w-5 h-5 mr-2" />
                                Play Again
                            </Button>
                            <Button
                                variant="outline"
                                onClick={resetGame}
                                className="text-lg px-6 py-3"
                            >
                                <ArrowLeft className="w-5 h-5 mr-2" />
                                Pick Another List
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Game in progress
    if (gameStarted && deck.length > 0) {
        const currentCard = deck[0];
        const currentWord = currentCard.word;
        const progress = totalCards > 0 ? Math.round((knownCount / totalCards) * 100) : 0;
        const cardModes = getAvailableModes(currentWord);
        // Use the selected mode if available for this card, otherwise fallback
        const activeMode = cardModes.includes(promptMode) ? promptMode : cardModes[0];

        return (
            <Card className="border-2 border-amber-200 overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-amber-50 to-yellow-50 pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <button onClick={resetGame} className="text-gray-500 hover:text-gray-700 p-1">
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <CardTitle className="flex items-center gap-2 text-amber-700 text-lg">
                                <Layers className="w-5 h-5" />
                                {selectedList?.title}
                            </CardTitle>
                        </div>
                        <Badge variant="outline" className="bg-amber-50 border-amber-300 text-amber-700">
                            {knownCount}/{totalCards} ⭐
                        </Badge>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-3 h-3 bg-amber-100 rounded-full overflow-hidden">
                        <div
                            className="h-3 bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-xs text-amber-600 mt-1 text-center">
                        {deck.length} card{deck.length !== 1 ? "s" : ""} left
                    </p>
                </CardHeader>

                <CardContent className="p-6">
                    {/* The Card */}
                    <div
                        className={`
                            relative w-full max-w-sm mx-auto aspect-[3/4] cursor-pointer
                            [perspective:1000px]
                            ${isTransitioning ? "opacity-0" : "opacity-100"}
                        `}
                        onClick={!isFlipped ? flipCard : undefined}
                    >
                        <div
                            className={`
                                relative w-full h-full
                                [transform-style:preserve-3d]
                                ${isTransitioning ? "" : "transition-transform duration-500"}
                                ${isFlipped ? "[transform:rotateY(180deg)]" : ""}
                            `}
                        >
                            {/* Front of card - the prompt */}
                            <div
                                className="
                                    absolute inset-0 [backface-visibility:hidden]
                                    bg-gradient-to-br from-white to-amber-50
                                    rounded-3xl border-4 border-amber-200 shadow-lg
                                    flex flex-col items-center justify-center p-6 gap-4
                                "
                            >
                                {activeMode === "image" && currentWord.imageUrl && (
                                    <>
                                        <img
                                            src={currentWord.imageUrl}
                                            alt="What word is this?"
                                            className="w-40 h-40 rounded-2xl object-cover border-4 border-amber-100 shadow-md"
                                        />
                                        {currentWord.mandarinTranslation && (
                                            <p className="text-2xl text-gray-600">{currentWord.mandarinTranslation}</p>
                                        )}
                                    </>
                                )}

                                {activeMode === "mandarin" && currentWord.mandarinTranslation && (
                                    <div className="text-center space-y-3">
                                        <p className="text-5xl font-bold text-gray-800">{currentWord.mandarinTranslation}</p>
                                        {currentWord.imageUrl && (
                                            <img
                                                src={currentWord.imageUrl}
                                                alt="Hint"
                                                className="w-28 h-28 rounded-2xl object-cover border-4 border-amber-100 shadow-md mx-auto"
                                            />
                                        )}
                                    </div>
                                )}

                                {activeMode === "audio" && (
                                    <div className="text-center space-y-4">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (currentWord.audioUrl) playAudio(currentWord.audioUrl);
                                            }}
                                            className={`
                                                w-24 h-24 rounded-full flex items-center justify-center mx-auto
                                                transition-all shadow-lg
                                                ${playingAudio
                                                    ? "bg-amber-600 text-white scale-105"
                                                    : "bg-gradient-to-br from-amber-400 to-orange-500 text-white hover:scale-105"
                                                }
                                            `}
                                        >
                                            {playingAudio ? (
                                                <Pause className="w-12 h-12" />
                                            ) : (
                                                <Play className="w-12 h-12 ml-1" />
                                            )}
                                        </button>
                                        <p className="text-lg text-gray-500">Listen and guess!</p>
                                    </div>
                                )}

                                <div className="mt-4 flex items-center gap-2 text-amber-600">
                                    <Eye className="w-5 h-5" />
                                    <span className="text-sm font-medium">Tap to reveal</span>
                                </div>

                                {currentCard.retries > 0 && (
                                    <Badge variant="outline" className="text-xs text-gray-400 border-gray-200">
                                        Seen {currentCard.retries} time{currentCard.retries !== 1 ? "s" : ""}
                                    </Badge>
                                )}
                            </div>

                            {/* Back of card - the answer */}
                            <div
                                className="
                                    absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]
                                    bg-gradient-to-br from-white to-green-50
                                    rounded-3xl border-4 border-green-200 shadow-lg
                                    flex flex-col items-center justify-center p-6 gap-4
                                "
                            >
                                {currentWord.imageUrl && (
                                    <img
                                        src={currentWord.imageUrl}
                                        alt={currentWord.word}
                                        className="w-32 h-32 rounded-2xl object-cover border-4 border-green-100 shadow-md"
                                    />
                                )}

                                <SyllableWord word={currentWord.word} syllables={currentWord.syllables} />

                                {currentWord.mandarinTranslation && (
                                    <p className="text-xl text-gray-500">{currentWord.mandarinTranslation}</p>
                                )}

                                {currentWord.audioUrl && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            playAudio(currentWord.audioUrl!);
                                        }}
                                        className={`
                                            w-14 h-14 rounded-full flex items-center justify-center
                                            transition-all shadow-md
                                            ${playingAudio
                                                ? "bg-green-600 text-white scale-105"
                                                : "bg-gradient-to-br from-green-500 to-emerald-500 text-white hover:scale-105"
                                            }
                                        `}
                                    >
                                        {playingAudio ? (
                                            <Pause className="w-7 h-7" />
                                        ) : (
                                            <Volume2 className="w-7 h-7" />
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Action buttons - only shown when flipped */}
                    {isFlipped && (
                        <div className="flex gap-4 mt-6 justify-center">
                            <Button
                                onClick={handleShowAgain}
                                variant="outline"
                                className="flex-1 max-w-[180px] h-14 text-lg border-2 border-orange-300 text-orange-700 hover:bg-orange-50"
                            >
                                <RotateCcw className="w-5 h-5 mr-2" />
                                Again
                            </Button>
                            <Button
                                onClick={handleKnewIt}
                                className="flex-1 max-w-[180px] h-14 text-lg bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white border-0"
                            >
                                <Star className="w-5 h-5 mr-2" />
                                Got it!
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    }

    // List selection screen
    const currentList = lists[0];
    const previousLists = lists.slice(1);

    return (
        <Card className="border-2 border-amber-200 overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-amber-100 via-yellow-50 to-orange-100 border-b border-amber-100">
                <CardTitle className="flex items-center gap-3 text-amber-700 text-2xl">
                    <Layers className="w-7 h-7" />
                    Flashcards
                </CardTitle>
                <p className="text-sm text-amber-600 mt-1">
                    See the picture or Chinese word, then guess the English word!
                </p>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                {/* Current week */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Badge className="bg-green-500 hover:bg-green-600 text-sm px-3 py-1">
                            <Calendar className="w-3.5 h-3.5 mr-1" />
                            This Week
                        </Badge>
                        <span className="font-bold text-lg text-gray-800">{currentList.title}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {currentList.words.some((w) => w.imageUrl) && (
                            <button
                                onClick={() => startGame(currentList, "image")}
                                className="flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 hover:border-amber-400 hover:shadow-md transition-all text-amber-800 font-medium"
                            >
                                <ImageIcon className="w-5 h-5" />
                                Picture Mode
                            </button>
                        )}
                        {currentList.words.some((w) => w.mandarinTranslation) && (
                            <button
                                onClick={() => startGame(currentList, "mandarin")}
                                className="flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 hover:border-purple-400 hover:shadow-md transition-all text-purple-800 font-medium"
                            >
                                <Languages className="w-5 h-5" />
                                中文 Mode
                            </button>
                        )}
                        {currentList.words.some((w) => w.audioUrl) && (
                            <button
                                onClick={() => startGame(currentList, "audio")}
                                className="flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-sky-50 hover:border-blue-400 hover:shadow-md transition-all text-blue-800 font-medium"
                            >
                                <Volume2 className="w-5 h-5" />
                                Listen Mode
                            </button>
                        )}
                    </div>
                    <p className="text-xs text-gray-500">{currentList.words.length} words</p>
                </div>

                {/* Previous lists */}
                {previousLists.length > 0 && (
                    <div className="border-t pt-4 space-y-4">
                        <h3 className="text-sm font-medium text-gray-600 flex items-center gap-2">
                            <CalendarRange className="w-4 h-4" />
                            Previous Lists
                        </h3>
                        {previousLists.map((list) => (
                            <div key={list.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 border">
                                <div>
                                    <span className="font-medium text-sm text-gray-800">{list.title}</span>
                                    <span className="text-xs text-gray-500 ml-2">{list.words.length} words</span>
                                </div>
                                <div className="flex gap-2">
                                    {list.words.some((w) => w.imageUrl) && (
                                        <button
                                            onClick={() => startGame(list, "image")}
                                            className="p-2 rounded-lg border border-amber-200 hover:bg-amber-50 text-amber-700 transition-colors"
                                            title="Picture Mode"
                                        >
                                            <ImageIcon className="w-4 h-4" />
                                        </button>
                                    )}
                                    {list.words.some((w) => w.mandarinTranslation) && (
                                        <button
                                            onClick={() => startGame(list, "mandarin")}
                                            className="p-2 rounded-lg border border-purple-200 hover:bg-purple-50 text-purple-700 transition-colors"
                                            title="中文 Mode"
                                        >
                                            <Languages className="w-4 h-4" />
                                        </button>
                                    )}
                                    {list.words.some((w) => w.audioUrl) && (
                                        <button
                                            onClick={() => startGame(list, "audio")}
                                            className="p-2 rounded-lg border border-blue-200 hover:bg-blue-50 text-blue-700 transition-colors"
                                            title="Listen Mode"
                                        >
                                            <Volume2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
