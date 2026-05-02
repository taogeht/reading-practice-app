"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Volume2 } from "lucide-react";

interface Voice {
    voice_id: string;
    name: string;
    provider: "google" | "elevenlabs";
    description?: string;
}

interface BulkAudioDialogProps {
    listTitle: string;
    wordCount: number;
    /** True if every word in the list already has audio — clicking will overwrite. */
    isRegenerate: boolean;
    open: boolean;
    onClose: () => void;
    onConfirm: (voiceId: string) => Promise<void>;
}

export function BulkAudioDialog({
    listTitle,
    wordCount,
    isRegenerate,
    open,
    onClose,
    onConfirm,
}: BulkAudioDialogProps) {
    const [voices, setVoices] = useState<Voice[]>([]);
    const [selectedVoice, setSelectedVoice] = useState<string>("");
    const [loadingVoices, setLoadingVoices] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setError(null);

        let cancelled = false;
        (async () => {
            try {
                setLoadingVoices(true);
                const response = await fetch("/api/tts/voices");
                if (!response.ok) throw new Error("Failed to load voices");
                const data = await response.json();
                if (cancelled) return;
                const list: Voice[] = data.voices || [];
                setVoices(list);
                if (list.length > 0) setSelectedVoice(list[0].voice_id);
            } catch (err: any) {
                if (!cancelled) setError(err.message || "Failed to load voices");
            } finally {
                if (!cancelled) setLoadingVoices(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [open]);

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await onConfirm(selectedVoice);
            onClose();
        } catch (err: any) {
            setError(err.message || "Failed to generate audio");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Volume2 className="w-5 h-5 text-blue-600" />
                        {isRegenerate ? "Regenerate audio" : "Generate audio"}
                    </DialogTitle>
                    <DialogDescription>
                        {isRegenerate
                            ? `This will overwrite existing audio for all ${wordCount} word${wordCount === 1 ? "" : "s"} in "${listTitle}".`
                            : `Generate audio for ${wordCount} word${wordCount === 1 ? "" : "s"} in "${listTitle}".`}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div>
                        <Label htmlFor="bulk-voice-select" className="text-sm">Voice</Label>
                        {loadingVoices ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
                                <Loader2 className="w-4 h-4 animate-spin" /> Loading voices…
                            </div>
                        ) : voices.length === 0 ? (
                            <p className="text-sm text-amber-600 mt-2">
                                No TTS voices configured on this server.
                            </p>
                        ) : (
                            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                                <SelectTrigger id="bulk-voice-select" className="mt-1">
                                    <SelectValue placeholder="Select voice" />
                                </SelectTrigger>
                                <SelectContent>
                                    {voices.map((voice) => (
                                        <SelectItem key={voice.voice_id} value={voice.voice_id}>
                                            <span className="flex items-center gap-2">
                                                <span
                                                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                                                        voice.provider === "elevenlabs" ? "bg-violet-500" : "bg-blue-500"
                                                    }`}
                                                />
                                                <span>{voice.name}</span>
                                                <span className="text-xs text-gray-500 capitalize">
                                                    ({voice.provider})
                                                </span>
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {error && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                            {error}
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={submitting || loadingVoices || voices.length === 0}
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                {isRegenerate ? "Regenerating…" : "Generating…"}
                            </>
                        ) : (
                            <>
                                <Volume2 className="w-4 h-4 mr-2" />
                                {isRegenerate ? "Regenerate" : "Generate"}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
