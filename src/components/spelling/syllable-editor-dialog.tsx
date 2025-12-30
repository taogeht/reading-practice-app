"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Check, X, Scissors } from "lucide-react";

interface SyllableEditorProps {
    wordId: string;
    word: string;
    currentSyllables: string[] | null;
    onSave: (syllables: string[]) => void;
    onClose: () => void;
    open: boolean;
}

// Vibrant colors for syllables preview
const SYLLABLE_COLORS = [
    { bg: "bg-rose-200", text: "text-rose-800", border: "border-rose-400" },
    { bg: "bg-sky-200", text: "text-sky-800", border: "border-sky-400" },
    { bg: "bg-amber-200", text: "text-amber-800", border: "border-amber-400" },
    { bg: "bg-emerald-200", text: "text-emerald-800", border: "border-emerald-400" },
    { bg: "bg-violet-200", text: "text-violet-800", border: "border-violet-400" },
    { bg: "bg-orange-200", text: "text-orange-800", border: "border-orange-400" },
];

export function SyllableEditorDialog({
    wordId,
    word,
    currentSyllables,
    onSave,
    onClose,
    open,
}: SyllableEditorProps) {
    // Track which positions have syllable breaks (positions between letters)
    const [breaks, setBreaks] = useState<number[]>(() => {
        if (!currentSyllables || currentSyllables.length <= 1) {
            return [];
        }
        // Convert syllables to break positions
        const positions: number[] = [];
        let pos = 0;
        for (let i = 0; i < currentSyllables.length - 1; i++) {
            pos += currentSyllables[i].length;
            positions.push(pos);
        }
        return positions;
    });

    const [saving, setSaving] = useState(false);

    // Toggle a break at a position
    const toggleBreak = (position: number) => {
        setBreaks((prev) => {
            if (prev.includes(position)) {
                return prev.filter((p) => p !== position);
            } else {
                return [...prev, position].sort((a, b) => a - b);
            }
        });
    };

    // Convert breaks to syllables
    const getSyllables = (): string[] => {
        if (breaks.length === 0) {
            return [word];
        }

        const syllables: string[] = [];
        let start = 0;

        for (const breakPos of breaks) {
            syllables.push(word.slice(start, breakPos));
            start = breakPos;
        }
        syllables.push(word.slice(start));

        return syllables;
    };

    const syllables = getSyllables();

    const handleSave = async () => {
        setSaving(true);
        try {
            const response = await fetch(`/api/spelling-words/${wordId}/syllables`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ syllables }),
            });

            if (response.ok) {
                onSave(syllables);
                onClose();
            } else {
                const data = await response.json();
                alert(data.error || "Failed to save syllables");
            }
        } catch (error) {
            console.error("Error saving syllables:", error);
            alert("Failed to save syllables");
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        setBreaks([]);
    };

    return (
        <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Scissors className="w-5 h-5" />
                        Edit Syllables
                    </DialogTitle>
                    <DialogDescription>
                        Click between letters to add or remove syllable breaks
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Interactive word editor */}
                    <div className="bg-gray-50 rounded-lg p-6">
                        <p className="text-sm text-gray-600 mb-4 text-center">
                            Tap the spaces between letters to split into syllables:
                        </p>

                        <div className="flex items-center justify-center flex-wrap gap-0">
                            {word.split("").map((letter, index) => (
                                <div key={index} className="flex items-center">
                                    {/* Break indicator before each letter (except first) */}
                                    {index > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => toggleBreak(index)}
                                            className={`
                        w-4 h-12 flex items-center justify-center
                        transition-all rounded
                        ${breaks.includes(index)
                                                    ? "bg-purple-500"
                                                    : "hover:bg-purple-100"
                                                }
                      `}
                                            title={breaks.includes(index) ? "Remove break" : "Add break"}
                                        >
                                            {breaks.includes(index) && (
                                                <div className="w-0.5 h-8 bg-white rounded-full" />
                                            )}
                                        </button>
                                    )}

                                    {/* Letter */}
                                    <span className="text-3xl font-bold text-gray-800 select-none">
                                        {letter}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Preview */}
                    <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">Preview:</p>
                        <div className="flex items-center gap-2 flex-wrap">
                            {syllables.map((syllable, index) => {
                                const colors = SYLLABLE_COLORS[index % SYLLABLE_COLORS.length];
                                return (
                                    <span
                                        key={index}
                                        className={`
                      px-3 py-2 rounded-lg font-bold text-xl
                      border-2 ${colors.bg} ${colors.text} ${colors.border}
                    `}
                                    >
                                        {syllable}
                                    </span>
                                );
                            })}
                            <span className="text-sm text-gray-500 ml-2">
                                ({syllables.length} syllable{syllables.length !== 1 ? "s" : ""})
                            </span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-between">
                        <Button variant="outline" onClick={handleReset} disabled={breaks.length === 0}>
                            Reset
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={onClose}>
                                <X className="w-4 h-4 mr-2" />
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={saving}>
                                {saving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-4 h-4 mr-2" />
                                        Save
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
