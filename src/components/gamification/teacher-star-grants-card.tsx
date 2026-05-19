"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Star } from "lucide-react";

interface Grant {
    id: string;
    amount: number;
    note: string | null;
    created_at: string;
    teacher_name: string;
}

interface Props {
    studentId: string;
}

function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - then);
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
}

export function TeacherStarGrantsCard({ studentId }: Props) {
    const [amount, setAmount] = useState<number>(1);
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [confirm, setConfirm] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [grants, setGrants] = useState<Grant[]>([]);
    const [grantsLoading, setGrantsLoading] = useState(true);

    const loadGrants = useCallback(async () => {
        try {
            setGrantsLoading(true);
            const res = await fetch(`/api/teacher/students/${studentId}/star-grants`, { cache: "no-store" });
            if (!res.ok) return;
            const data = (await res.json()) as { grants: Grant[] };
            setGrants(data.grants);
        } catch (err) {
            console.error("Failed to load grants:", err);
        } finally {
            setGrantsLoading(false);
        }
    }, [studentId]);

    useEffect(() => {
        loadGrants();
    }, [loadGrants]);

    const handleSubmit = async () => {
        setError(null);
        if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
            setError("Amount must be a whole number between 1 and 100.");
            return;
        }
        try {
            setSubmitting(true);
            const res = await fetch("/api/teacher/stars/grant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ student_id: studentId, amount, note: note.trim() || undefined }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || "Failed to award stars");
            }
            setConfirm(`⭐ ${amount} star${amount === 1 ? "" : "s"} awarded!`);
            setAmount(1);
            setNote("");
            await loadGrants();
            setTimeout(() => setConfirm(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to award stars");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Star className="w-5 h-5 fill-amber-400 text-amber-500" />
                    Award Stars
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">
                    Give this student a manual star bonus for great effort, behavior, or progress. They'll see it on
                    their My Stuff page.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="star-amount">Amount</Label>
                        <Input
                            id="star-amount"
                            type="number"
                            min={1}
                            max={100}
                            value={amount}
                            onChange={(e) => setAmount(Number(e.target.value))}
                            disabled={submitting}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="star-note">Note (optional)</Label>
                        <Textarea
                            id="star-note"
                            placeholder="What was this for?"
                            value={note}
                            onChange={(e) => setNote(e.target.value.slice(0, 280))}
                            rows={2}
                            disabled={submitting}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button onClick={handleSubmit} disabled={submitting} size="sm">
                        {submitting ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Star className="w-4 h-4 mr-2" />
                        )}
                        Award stars
                    </Button>
                    {confirm && <span className="text-sm text-green-600 font-medium">{confirm}</span>}
                    {error && <span className="text-sm text-red-600">{error}</span>}
                </div>

                <div className="pt-2 border-t">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Recent grants</h4>
                    {grantsLoading && (
                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                        </div>
                    )}
                    {!grantsLoading && grants.length === 0 && (
                        <p className="text-sm text-gray-500">No grants yet.</p>
                    )}
                    {!grantsLoading && grants.length > 0 && (
                        <ul className="divide-y divide-gray-100">
                            {grants.map((g) => (
                                <li key={g.id} className="flex items-start justify-between gap-3 py-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-gray-900">
                                            <span className="font-medium">{g.teacher_name}</span>
                                            <span className="text-gray-500"> · {relativeTime(g.created_at)}</span>
                                        </div>
                                        {g.note && <p className="text-sm text-gray-600 italic truncate">{g.note}</p>}
                                    </div>
                                    <span className="flex items-center gap-1 text-sm font-semibold text-amber-700 tabular-nums shrink-0">
                                        +{g.amount}
                                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
