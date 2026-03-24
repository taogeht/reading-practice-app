"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Gamepad2, Loader2 } from "lucide-react";
import { SnowmanGame } from "@/components/spelling/snowman-game";
import { ListenAndSpellGame } from "@/components/spelling/listen-spell-game";
import { UnscrambleGame } from "@/components/spelling/unscramble-game";
import { MissingLettersGame } from "@/components/spelling/missing-letters-game";

interface SpellingWord {
    id: string;
    word: string;
    syllables: string[] | null;
    audioUrl: string | null;
    imageUrl: string | null;
}

interface SpellingListData {
    id: string;
    classId: string;
    className: string;
    title: string;
    weekNumber: number | null;
    active: boolean;
    words: SpellingWord[];
    createdAt: string;
}

// Shape expected by game components
interface GameSpellingList {
    id: string;
    title: string;
    weekNumber: number | null;
    active: boolean;
    createdAt: string;
    words: (SpellingWord & { orderIndex: number })[];
    class: { id: string; name: string };
}

export default function SpellingGamePreviewPage() {
    const router = useRouter();
    const params = useParams();
    const listId = params.id as string;

    const [list, setList] = useState<SpellingListData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchList();
    }, [listId]);

    const fetchList = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/teacher/spelling-lists/${listId}`);
            if (!response.ok) throw new Error("Failed to fetch spelling list");
            const data = await response.json();
            setList(data);
        } catch (err: any) {
            setError(err.message || "Failed to load spelling list");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-blue-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            </div>
        );
    }

    if (error || !list) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-600 mb-4">{error || "List not found"}</p>
                    <Button onClick={() => router.push("/teacher/spelling-lists")}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Spelling Lists
                    </Button>
                </div>
            </div>
        );
    }

    const gameLists: GameSpellingList[] = [{
        id: list.id,
        title: list.title,
        weekNumber: list.weekNumber,
        active: list.active,
        createdAt: list.createdAt,
        words: list.words.map((w, i) => ({ ...w, orderIndex: i })),
        class: { id: list.classId, name: list.className },
    }];

    return (
        <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-blue-50">
            {/* Header */}
            <div className="bg-white shadow-sm border-b">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={() => router.push("/teacher/spelling-lists")}
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                <Gamepad2 className="w-5 h-5 text-indigo-500" />
                                Preview Games
                            </h1>
                            <p className="text-sm text-gray-500">{list.title} — {list.words.length} words</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Games */}
            <div className="max-w-4xl mx-auto px-4 py-8">
                <Tabs defaultValue="snowman" className="w-full">
                    <TabsList className="bg-white/70 border border-gray-200 flex-wrap h-auto gap-1 p-1 mb-6">
                        <TabsTrigger value="snowman" className="data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-800">
                            ⛄ Snowman
                        </TabsTrigger>
                        <TabsTrigger value="listen" className="data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-800">
                            🎧 Listen & Spell
                        </TabsTrigger>
                        <TabsTrigger value="unscramble" className="data-[state=active]:bg-purple-100 data-[state=active]:text-purple-800">
                            🔀 Unscramble
                        </TabsTrigger>
                        <TabsTrigger value="missing" className="data-[state=active]:bg-violet-100 data-[state=active]:text-violet-800">
                            ✏️ Missing Letters
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="snowman" className="mt-0">
                        <SnowmanGame initialLists={gameLists} skipTracking />
                    </TabsContent>

                    <TabsContent value="listen" className="mt-0">
                        <ListenAndSpellGame initialLists={gameLists} skipTracking />
                    </TabsContent>

                    <TabsContent value="unscramble" className="mt-0">
                        <UnscrambleGame initialLists={gameLists} skipTracking />
                    </TabsContent>

                    <TabsContent value="missing" className="mt-0">
                        <MissingLettersGame initialLists={gameLists} skipTracking />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
