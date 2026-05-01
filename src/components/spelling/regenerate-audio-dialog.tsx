"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Pause, Play, Volume2, Wand2 } from "lucide-react";

interface Voice {
    voice_id: string;
    name: string;
    provider: "google" | "elevenlabs";
    description?: string;
}

interface RegenerateAudioDialogProps {
    wordId: string;
    word: string;
    currentAudioUrl: string | null;
    /** Sibling list IDs (deduped view) — same-text words inside these lists also get the new audio. */
    applyToListIds?: string[];
    open: boolean;
    onClose: () => void;
    onRegenerated: (newAudioUrl: string) => void;
}

export function RegenerateAudioDialog({
    wordId,
    word,
    currentAudioUrl,
    applyToListIds,
    open,
    onClose,
    onRegenerated,
}: RegenerateAudioDialogProps) {
    const [voices, setVoices] = useState<Voice[]>([]);
    const [selectedVoice, setSelectedVoice] = useState<string>("");
    const [applyToSchool, setApplyToSchool] = useState(false);
    const [loadingVoices, setLoadingVoices] = useState(true);
    const [regenerating, setRegenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(currentAudioUrl);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Load voices when the dialog opens
    useEffect(() => {
        if (!open) return;
        setError(null);
        setPreviewAudioUrl(currentAudioUrl);
        setApplyToSchool(false);

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
                if (list.length > 0) {
                    setSelectedVoice(list[0].voice_id);
                }
            } catch (err: any) {
                if (!cancelled) setError(err.message || "Failed to load voices");
            } finally {
                if (!cancelled) setLoadingVoices(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [open, currentAudioUrl]);

    // Stop playback whenever the dialog closes or the preview URL changes
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    const handlePlay = () => {
        if (!previewAudioUrl) return;
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        if (isPlaying) {
            setIsPlaying(false);
            return;
        }
        const audio = new Audio(previewAudioUrl);
        audioRef.current = audio;
        setIsPlaying(true);
        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => setIsPlaying(false);
        audio.play().catch(() => setIsPlaying(false));
    };

    const handleRegenerate = async () => {
        setRegenerating(true);
        setError(null);
        try {
            const response = await fetch(`/api/spelling-words/${wordId}/regenerate-audio`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    voiceId: selectedVoice || undefined,
                    applyToListIds: applyToListIds || [],
                    applyToSchool,
                }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || "Failed to regenerate audio");
            }
            const data = await response.json();
            setPreviewAudioUrl(data.audioUrl);
            onRegenerated(data.audioUrl);
        } catch (err: any) {
            setError(err.message || "Failed to regenerate audio");
        } finally {
            setRegenerating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wand2 className="w-5 h-5 text-blue-600" />
                        Regenerate audio for "{word}"
                    </DialogTitle>
                    <DialogDescription>
                        Pick a voice and regenerate this single word. Useful when the default
                        voice mispronounces something.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Preview player */}
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
                        <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            onClick={handlePlay}
                            disabled={!previewAudioUrl}
                            className="h-10 w-10 rounded-full"
                            title={previewAudioUrl ? "Play current audio" : "No audio yet"}
                        >
                            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                        </Button>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{word}</p>
                            <p className="text-xs text-gray-500">
                                {previewAudioUrl ? "Tap play to preview the current voice" : "No audio generated yet"}
                            </p>
                        </div>
                        {isPlaying && <Volume2 className="w-4 h-4 text-blue-500 animate-pulse" />}
                    </div>

                    {/* Voice picker */}
                    <div>
                        <Label htmlFor="voice-select" className="text-sm">Voice</Label>
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
                                <SelectTrigger id="voice-select" className="mt-1">
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

                    {/* Apply to whole school */}
                    <label className="flex items-start gap-2 text-sm cursor-pointer p-3 rounded-lg border hover:bg-gray-50">
                        <input
                            type="checkbox"
                            className="mt-0.5 rounded border-gray-300 text-blue-600"
                            checked={applyToSchool}
                            onChange={(e) => setApplyToSchool(e.target.checked)}
                        />
                        <span>
                            <span className="font-medium">Apply to whole school</span>
                            <span className="block text-xs text-gray-500">
                                Also replace audio for every "{word}" in other teachers' classes in this school.
                                By default, only your classes that share this list are updated.
                            </span>
                        </span>
                    </label>

                    {error && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                            {error}
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={regenerating}>
                        Close
                    </Button>
                    <Button
                        onClick={handleRegenerate}
                        disabled={regenerating || loadingVoices || voices.length === 0}
                    >
                        {regenerating ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Regenerating…
                            </>
                        ) : (
                            <>
                                <Wand2 className="w-4 h-4 mr-2" /> Regenerate
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
