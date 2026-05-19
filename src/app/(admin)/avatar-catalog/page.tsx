"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Loader2, RefreshCw, Sparkles } from "lucide-react";

type Status = "pending" | "generating" | "complete" | "failed";

interface CharacterRow {
    id: string;
    character_type: "human" | "animal" | "robot";
    variant_index: number;
    name: string;
    personality: string;
    asset_url: string | null;
    generation_status: Status;
    generated_at: string | null;
}

interface SceneRow {
    id: string;
    name: string;
    description: string | null;
    star_cost: number;
    asset_type: "css" | "image";
    asset_data: { emoji?: string; color?: string; url?: string; scene_prompt?: string } | null;
}

interface CosmeticRow {
    id: string;
    name: string;
    category: string;
    description: string | null;
    star_cost: number;
    asset_type: "css" | "image";
    asset_data: { emoji?: string; color?: string; url?: string } | null;
}

const STATUS_BADGE: Record<Status, { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "bg-gray-200 text-gray-700" },
    generating: { label: "Generating…", cls: "bg-amber-200 text-amber-800 animate-pulse" },
    complete: { label: "Complete", cls: "bg-green-200 text-green-800" },
    failed: { label: "Failed", cls: "bg-red-200 text-red-800" },
};

const TYPE_LABEL: Record<CharacterRow["character_type"], string> = {
    human: "Human",
    animal: "Animal",
    robot: "Robot",
};

export default function AvatarCatalogPage() {
    const [characters, setCharacters] = useState<CharacterRow[]>([]);
    const [scenes, setScenes] = useState<SceneRow[]>([]);
    const [cosmetics, setCosmetics] = useState<CosmeticRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<Set<string>>(new Set());
    const [bulkRunning, setBulkRunning] = useState(false);
    const [snapshotRegen, setSnapshotRegen] = useState<{ running: boolean; started: number | null }>({ running: false, started: null });
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/avatar-catalog/status", { cache: "no-store" });
            if (!res.ok) throw new Error("Failed to load catalog");
            const data = (await res.json()) as { characters: CharacterRow[]; scenes: SceneRow[]; cosmetics: CosmeticRow[] };
            setCharacters(data.characters);
            setScenes(data.scenes);
            setCosmetics(data.cosmetics ?? []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const anyGenerating = useMemo(
        () =>
            characters.some((c) => c.generation_status === "generating") ||
            // Scenes/cosmetics have no generation_status column; we treat
            // them as "generating" for polling purposes when busy has the id.
            scenes.some((s) => busy.has(s.id)) ||
            cosmetics.some((c) => busy.has(c.id)),
        [characters, scenes, cosmetics, busy],
    );

    // Poll while anything is mid-generation so cards refresh on their own.
    useEffect(() => {
        if (!anyGenerating) {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
            return;
        }
        if (pollingRef.current) return;
        pollingRef.current = setInterval(() => {
            load();
        }, 3000);
        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [anyGenerating, load]);

    // When a generation completes, drop its id from the busy set.
    useEffect(() => {
        if (busy.size === 0) return;
        setBusy((prev) => {
            const next = new Set(prev);
            for (const c of characters) {
                if (c.generation_status === "complete" || c.generation_status === "failed") {
                    next.delete(c.id);
                }
            }
            for (const s of scenes) {
                if (s.asset_type === "image") next.delete(s.id);
            }
            for (const c of cosmetics) {
                if (c.asset_type === "image") next.delete(c.id);
            }
            return next.size === prev.size ? prev : next;
        });
    }, [characters, scenes, cosmetics, busy.size]);

    const charactersByType = useMemo(() => {
        const groups: Record<string, CharacterRow[]> = { human: [], animal: [], robot: [] };
        for (const c of characters) {
            if (groups[c.character_type]) groups[c.character_type].push(c);
        }
        return groups;
    }, [characters]);

    const generateCharacter = async (id: string) => {
        setBusy((prev) => new Set(prev).add(id));
        try {
            const res = await fetch("/api/admin/avatar-catalog/generate-character", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ character_id: id }),
            });
            if (!res.ok) throw new Error("Generation failed to start");
            await load();
        } catch (err) {
            console.error(err);
            setBusy((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const generateScene = async (id: string) => {
        setBusy((prev) => new Set(prev).add(id));
        try {
            const res = await fetch("/api/admin/avatar-catalog/generate-scene", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ item_id: id }),
            });
            if (!res.ok) throw new Error("Generation failed to start");
            await load();
        } catch (err) {
            console.error(err);
            setBusy((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const generateCosmetic = async (id: string) => {
        setBusy((prev) => new Set(prev).add(id));
        try {
            const res = await fetch("/api/admin/avatar-catalog/generate-cosmetic", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ item_id: id }),
            });
            if (!res.ok) throw new Error("Generation failed to start");
            await load();
        } catch (err) {
            console.error(err);
            setBusy((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    // Bulk: run one-at-a-time on the client, awaiting each completion via the
    // polling state. We just fire each in sequence; the server-side generation
    // is async but Gemini's per-key concurrency keeps things sane.
    const bulkGenerate = async () => {
        setBulkRunning(true);
        try {
            const pendingChars = characters.filter(
                (c) => c.generation_status === "pending" || c.generation_status === "failed",
            );
            for (const c of pendingChars) {
                await fetch("/api/admin/avatar-catalog/generate-character", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ character_id: c.id }),
                });
                // Small gap between fire-and-forget requests to be polite to
                // Gemini's rate limiter.
                await new Promise((r) => setTimeout(r, 500));
            }
            const pendingScenes = scenes.filter((s) => s.asset_type !== "image");
            for (const s of pendingScenes) {
                await fetch("/api/admin/avatar-catalog/generate-scene", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ item_id: s.id }),
                });
                await new Promise((r) => setTimeout(r, 500));
            }
            const pendingCosmetics = cosmetics.filter((c) => c.asset_type !== "image");
            for (const c of pendingCosmetics) {
                await fetch("/api/admin/avatar-catalog/generate-cosmetic", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ item_id: c.id }),
                });
                await new Promise((r) => setTimeout(r, 500));
            }
            await load();
        } finally {
            setBulkRunning(false);
        }
    };

    if (loading) {
        return (
            <div className="p-8 flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading catalog…
            </div>
        );
    }

    const pendingCount =
        characters.filter((c) => c.generation_status !== "complete").length +
        scenes.filter((s) => s.asset_type !== "image").length +
        cosmetics.filter((c) => c.asset_type !== "image").length;

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Avatar Catalog</h1>
                    <p className="text-sm text-gray-600">
                        Pre-generate the 9 base character portraits and the 3 starter scenes. Students never wait
                        for these — Gemini runs here, students see finished images.
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button
                        variant="outline"
                        onClick={async () => {
                            if (snapshotRegen.running) return;
                            if (!confirm("Re-composite every student's avatar snapshot? Runs sequentially on the server (~1–3s per student).")) return;
                            setSnapshotRegen({ running: true, started: null });
                            try {
                                const res = await fetch("/api/admin/avatar-catalog/regenerate-snapshots", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({}),
                                });
                                const json = await res.json().catch(() => ({}));
                                setSnapshotRegen({ running: false, started: typeof json.started === "number" ? json.started : 0 });
                            } catch (err) {
                                console.error(err);
                                setSnapshotRegen({ running: false, started: null });
                            }
                        }}
                        disabled={snapshotRegen.running}
                        title="Useful after regenerating characters/cosmetics — refreshes every student's saved snapshot in the background."
                    >
                        {snapshotRegen.running ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Camera className="w-4 h-4 mr-2" />
                        )}
                        Refresh all snapshots
                        {snapshotRegen.started !== null && (
                            <span className="ml-2 text-xs text-gray-500">
                                started {snapshotRegen.started}
                            </span>
                        )}
                    </Button>
                    <Button onClick={bulkGenerate} disabled={bulkRunning || pendingCount === 0}>
                        {bulkRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        Generate all pending ({pendingCount})
                    </Button>
                </div>
            </div>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Base Characters</h2>
                {(["human", "animal", "robot"] as const).map((type) => (
                    <div key={type}>
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600 mb-2">
                            {TYPE_LABEL[type]}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {charactersByType[type]?.map((c) => {
                                const badge = STATUS_BADGE[c.generation_status];
                                const isBusy = busy.has(c.id) || c.generation_status === "generating";
                                return (
                                    <Card key={c.id}>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="flex items-center justify-between text-base">
                                                <span>
                                                    {c.name}{" "}
                                                    <span className="text-xs font-normal text-gray-500">#{c.variant_index}</span>
                                                </span>
                                                <Badge className={badge.cls}>{badge.label}</Badge>
                                            </CardTitle>
                                            <p className="text-xs text-gray-600">{c.personality}</p>
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            <div className="w-full aspect-square bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                                                {c.asset_url ? (
                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                    <img
                                                        src={c.asset_url}
                                                        alt={c.name}
                                                        className="max-w-full max-h-full object-contain"
                                                    />
                                                ) : (
                                                    <span className="text-sm text-gray-400">{badge.label}</span>
                                                )}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant={c.asset_url ? "outline" : "default"}
                                                onClick={() => generateCharacter(c.id)}
                                                disabled={isBusy || bulkRunning}
                                                className="w-full"
                                            >
                                                {isBusy ? (
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                ) : c.asset_url ? (
                                                    <RefreshCw className="w-4 h-4 mr-2" />
                                                ) : (
                                                    <Sparkles className="w-4 h-4 mr-2" />
                                                )}
                                                {c.asset_url ? "Regenerate" : "Generate"}
                                            </Button>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Cosmetics</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {cosmetics.map((c) => {
                        const isBusy = busy.has(c.id);
                        const generated = c.asset_type === "image";
                        const url = (c.asset_data?.url as string | undefined) ?? null;
                        return (
                            <Card key={c.id}>
                                <CardContent className="p-3 space-y-2">
                                    <div className="w-full aspect-square bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                                        {generated && url ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={url} alt={c.name} className="max-w-full max-h-full object-contain" />
                                        ) : (
                                            <span className="text-4xl">{c.asset_data?.emoji ?? "🎨"}</span>
                                        )}
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-gray-900 truncate">{c.name}</div>
                                        <div className="flex items-center gap-2 text-xs">
                                            <Badge className="bg-gray-200 text-gray-700 capitalize">{c.category}</Badge>
                                            <Badge className={generated ? STATUS_BADGE.complete.cls : STATUS_BADGE.pending.cls}>
                                                {generated ? "Image" : "CSS"}
                                            </Badge>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant={generated ? "outline" : "default"}
                                        onClick={() => generateCosmetic(c.id)}
                                        disabled={isBusy || bulkRunning}
                                        className="w-full"
                                    >
                                        {isBusy ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : generated ? (
                                            <RefreshCw className="w-4 h-4 mr-2" />
                                        ) : (
                                            <Sparkles className="w-4 h-4 mr-2" />
                                        )}
                                        {generated ? "Regenerate" : "Generate"}
                                    </Button>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Scenes</h2>
                <div className="space-y-3">
                    {scenes.map((s) => {
                        const isBusy = busy.has(s.id);
                        const generated = s.asset_type === "image";
                        const url = (s.asset_data?.url as string | undefined) ?? null;
                        return (
                            <Card key={s.id}>
                                <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-start">
                                    <div className="w-full sm:w-48 aspect-video bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                                        {generated && url ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={url} alt={s.name} className="max-w-full max-h-full object-cover" />
                                        ) : (
                                            <span className="text-4xl">{s.asset_data?.emoji ?? "🎨"}</span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-semibold text-gray-900">{s.name}</h3>
                                            <Badge className={generated ? STATUS_BADGE.complete.cls : STATUS_BADGE.pending.cls}>
                                                {generated ? "Image" : "CSS only"}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">{s.description}</p>
                                        {s.asset_data?.scene_prompt && (
                                            <p className="text-xs text-gray-500 italic mt-1 line-clamp-2">
                                                Prompt: {s.asset_data.scene_prompt}
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        size="sm"
                                        variant={generated ? "outline" : "default"}
                                        onClick={() => generateScene(s.id)}
                                        disabled={isBusy || bulkRunning}
                                    >
                                        {isBusy ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : generated ? (
                                            <RefreshCw className="w-4 h-4 mr-2" />
                                        ) : (
                                            <Sparkles className="w-4 h-4 mr-2" />
                                        )}
                                        {generated ? "Regenerate" : "Generate"}
                                    </Button>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
