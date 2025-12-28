"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    BookA,
    Plus,
    Play,
    Pause,
    Loader2,
    Volume2,
    Trash2,
    ChevronDown,
    ChevronUp,
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
}

interface SpellingWordsSectionProps {
    classId: string;
}

export function SpellingWordsSection({ classId }: SpellingWordsSectionProps) {
    const [lists, setLists] = useState<SpellingList[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [expandedListId, setExpandedListId] = useState<string | null>(null);
    const [generatingAudio, setGeneratingAudio] = useState<string | null>(null);
    const [playingWordId, setPlayingWordId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Form state
    const [newListTitle, setNewListTitle] = useState("");
    const [newListWeek, setNewListWeek] = useState("");
    const [newListWords, setNewListWords] = useState("");
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        fetchSpellingLists();
    }, [classId]);

    const fetchSpellingLists = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/spelling-lists?classId=${classId}`);
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

    const handleCreateList = async () => {
        if (!newListTitle.trim() || !newListWords.trim()) return;

        // Parse words - split by newlines or commas
        const words = newListWords
            .split(/[\n,]+/)
            .map((w) => w.trim())
            .filter((w) => w.length > 0);

        if (words.length === 0) return;

        setCreating(true);
        try {
            const response = await fetch("/api/spelling-lists", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    classId,
                    title: newListTitle.trim(),
                    weekNumber: newListWeek ? parseInt(newListWeek) : null,
                    words,
                }),
            });

            if (response.ok) {
                await fetchSpellingLists();
                setShowCreateDialog(false);
                setNewListTitle("");
                setNewListWeek("");
                setNewListWords("");
            }
        } catch (error) {
            console.error("Error creating spelling list:", error);
        } finally {
            setCreating(false);
        }
    };

    const handleGenerateAudio = async (listId: string) => {
        setGeneratingAudio(listId);
        try {
            const response = await fetch(`/api/spelling-lists/${listId}/generate-audio`, {
                method: "POST",
            });

            if (response.ok) {
                await fetchSpellingLists();
            } else {
                const data = await response.json();
                alert(data.error || "Failed to generate audio");
            }
        } catch (error) {
            console.error("Error generating audio:", error);
        } finally {
            setGeneratingAudio(null);
        }
    };

    const handleDeleteList = async (listId: string, title: string) => {
        if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;

        try {
            const response = await fetch(`/api/spelling-lists/${listId}`, {
                method: "DELETE",
            });

            if (response.ok) {
                await fetchSpellingLists();
            }
        } catch (error) {
            console.error("Error deleting list:", error);
        }
    };

    const handleToggleActive = async (list: SpellingList) => {
        try {
            const response = await fetch(`/api/spelling-lists/${list.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ active: !list.active }),
            });

            if (response.ok) {
                await fetchSpellingLists();
            }
        } catch (error) {
            console.error("Error toggling list active state:", error);
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

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString();
    };

    const getWordsWithAudio = (words: SpellingWord[]) => {
        return words.filter((w) => w.audioUrl).length;
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <BookA className="w-5 h-5" />
                            Spelling Words
                        </CardTitle>
                        <CardDescription>
                            Weekly spelling word lists with audio
                        </CardDescription>
                    </div>
                    <Button onClick={() => setShowCreateDialog(true)} size="sm">
                        <Plus className="w-4 h-4 mr-2" />
                        New List
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                ) : lists.length === 0 ? (
                    <div className="text-center py-8">
                        <BookA className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-600 mb-4">No spelling lists yet</p>
                        <Button onClick={() => setShowCreateDialog(true)} variant="outline">
                            <Plus className="w-4 h-4 mr-2" />
                            Create First List
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {lists.map((list) => (
                            <div
                                key={list.id}
                                className="border rounded-lg overflow-hidden"
                            >
                                {/* List Header */}
                                <div
                                    className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
                                    onClick={() =>
                                        setExpandedListId(expandedListId === list.id ? null : list.id)
                                    }
                                >
                                    <div className="flex items-center gap-3">
                                        {expandedListId === list.id ? (
                                            <ChevronUp className="w-4 h-4 text-gray-500" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4 text-gray-500" />
                                        )}
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{list.title}</span>
                                                {list.weekNumber && (
                                                    <Badge variant="outline" className="text-xs">
                                                        Week {list.weekNumber}
                                                    </Badge>
                                                )}
                                                <Badge variant={list.active ? "default" : "secondary"}>
                                                    {list.active ? "Active" : "Hidden"}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-gray-500">
                                                {list.words.length} words • {getWordsWithAudio(list.words)} with audio •{" "}
                                                {formatDate(list.createdAt)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                        {getWordsWithAudio(list.words) < list.words.length && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleGenerateAudio(list.id)}
                                                disabled={generatingAudio === list.id}
                                            >
                                                {generatingAudio === list.id ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                        Generating...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Volume2 className="w-4 h-4 mr-2" />
                                                        Generate Audio
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleToggleActive(list)}
                                        >
                                            {list.active ? "Hide" : "Show"}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-red-600 hover:text-red-700"
                                            onClick={() => handleDeleteList(list.id, list.title)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Expanded Word List */}
                                {expandedListId === list.id && (
                                    <div className="p-4 border-t">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                                            {list.words.map((word) => (
                                                <div
                                                    key={word.id}
                                                    className="flex items-center gap-2 p-2 bg-white border rounded hover:bg-gray-50"
                                                >
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 w-8 p-0"
                                                        onClick={() => playWord(word)}
                                                        disabled={!word.audioUrl}
                                                    >
                                                        {playingWordId === word.id ? (
                                                            <Pause className="w-4 h-4" />
                                                        ) : (
                                                            <Play className="w-4 h-4" />
                                                        )}
                                                    </Button>
                                                    <span className="flex-1 truncate">{word.word}</span>
                                                    {!word.audioUrl && (
                                                        <span className="text-xs text-gray-400">No audio</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>

            {/* Create List Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create Spelling List</DialogTitle>
                        <DialogDescription>
                            Add a new set of spelling words for this class
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="listTitle">List Title</Label>
                            <Input
                                id="listTitle"
                                value={newListTitle}
                                onChange={(e) => setNewListTitle(e.target.value)}
                                placeholder="e.g., Week 12 Spelling Words"
                            />
                        </div>
                        <div>
                            <Label htmlFor="weekNumber">Week Number (optional)</Label>
                            <Input
                                id="weekNumber"
                                type="number"
                                value={newListWeek}
                                onChange={(e) => setNewListWeek(e.target.value)}
                                placeholder="e.g., 12"
                                min="1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="words">Spelling Words</Label>
                            <Textarea
                                id="words"
                                value={newListWords}
                                onChange={(e) => setNewListWords(e.target.value)}
                                placeholder="Enter words, one per line or comma-separated:&#10;apple&#10;banana&#10;cherry"
                                rows={8}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Paste words one per line or comma-separated
                            </p>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setShowCreateDialog(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCreateList}
                                disabled={creating || !newListTitle.trim() || !newListWords.trim()}
                            >
                                {creating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    "Create List"
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
