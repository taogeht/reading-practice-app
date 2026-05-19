"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStars } from "@/components/providers/stars-provider";
import { StudentShopTab } from "@/components/gamification/student-shop-tab";
import { StudentInventoryTab } from "@/components/gamification/student-inventory-tab";
import { StudentAvatarTab } from "@/components/gamification/student-avatar-tab";
import { StudentClassmatesTab } from "@/components/gamification/student-classmates-tab";
import { labelForTransaction } from "@/lib/gamification/labels";
import { STUDENT_SHOP_ENABLED } from "@/lib/feature-flags";

interface Transaction {
    id: string;
    amount: number;
    direction: "earn" | "spend";
    source_type: string;
    source_ref: string | null;
    created_at: string;
    item_name?: string | null;
    note?: string | null;
}

function relativeTime(iso: string): string {
    const then = new Date(iso);
    const now = new Date();
    const diff = Math.max(0, now.getTime() - then.getTime());
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    // Two-day window gets a relative day phrase; older falls back to an
    // absolute "May 14" so kids don't have to count days.
    const days = Math.floor(hours / 24);
    if (days === 1) return "yesterday";
    if (days < 7) return `${days} days ago`;
    return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function WalletTab() {
    const { balance, lifetime } = useStars();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const res = await fetch("/api/student/stars/history?limit=10", { cache: "no-store" });
                if (!res.ok) throw new Error("Failed to load history");
                const data = (await res.json()) as { transactions: Transaction[] };
                if (!cancelled) setTransactions(data.transactions);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load history");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    return (
        <div className="space-y-4">
            <Card>
                <CardContent className="p-6 text-center space-y-2">
                    <div className="flex items-center justify-center gap-3">
                        <Star className="w-10 h-10 fill-amber-400 text-amber-500" />
                        <span className="text-5xl font-bold tabular-nums text-amber-700">{balance}</span>
                    </div>
                    <p className="text-sm text-gray-600">
                        Lifetime stars earned: <span className="font-semibold tabular-nums">{lifetime}</span>
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Recent activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                    {loading && (
                        <div className="flex items-center gap-2 text-gray-500 py-4">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                        </div>
                    )}
                    {error && !loading && <p className="text-sm text-red-600 py-4">{error}</p>}
                    {!loading && !error && transactions.length === 0 && (
                        <p className="text-sm text-gray-500 py-4">
                            No activity yet. Finish a story or a practice round to earn your first stars!
                        </p>
                    )}
                    {!loading && !error && transactions.length > 0 && (
                        <ul className="divide-y divide-gray-100">
                            {transactions.map((tx) => {
                                const { emoji, label, subtitle } = labelForTransaction({
                                    source_type: tx.source_type,
                                    source_ref: tx.source_ref,
                                    item_name: tx.item_name,
                                    note: tx.note,
                                });
                                const earned = tx.amount > 0;
                                return (
                                    <li key={tx.id} className="flex items-start justify-between gap-3 py-2.5">
                                        <div className="flex items-start gap-2 min-w-0">
                                            <span className="text-lg leading-none mt-0.5" aria-hidden>
                                                {emoji}
                                            </span>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-medium text-gray-900 truncate">{label}</span>
                                                {subtitle && (
                                                    <span className="text-xs italic text-gray-500 truncate">{subtitle}</span>
                                                )}
                                                <span className="text-xs text-gray-500">{relativeTime(tx.created_at)}</span>
                                            </div>
                                        </div>
                                        <span
                                            className={`flex items-center gap-1 text-sm font-semibold tabular-nums shrink-0 ${
                                                earned ? "text-amber-700" : "text-red-600"
                                            }`}
                                        >
                                            {earned ? `+${tx.amount}` : tx.amount}
                                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// Shop + Collection only appear when the shop feature is enabled. Valid-tab
// list and the tabs grid width both adapt to the flag so a deep link to
// ?tab=shop while disabled falls through to the default (avatar).
const VALID_TABS = STUDENT_SHOP_ENABLED
    ? (["avatar", "wallet", "shop", "inventory", "classmates"] as const)
    : (["avatar", "wallet", "classmates"] as const);

export default function StudentStuffPage() {
    // Avatar tab is the headline payoff and the default. ?tab= picks a
    // different tab after hydration — we can't branch on window during the
    // initial render or SSR and CSR disagree (hydration mismatch). Reading
    // the URL in a useEffect keeps both sides identical at mount and lets
    // the client snap to the requested tab right after.
    const [activeTab, setActiveTab] = useState<string>("avatar");

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const t = params.get("tab");
        if (t && (VALID_TABS as readonly string[]).includes(t)) {
            setActiveTab(t);
        }
    }, []);

    const tabGridCols = STUDENT_SHOP_ENABLED ? "grid-cols-5" : "grid-cols-3";

    return (
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
                <div className="flex items-center gap-3">
                    <Link href="/student/dashboard">
                        <Button variant="outline" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Back
                        </Button>
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900">My Stuff</h1>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className={`grid w-full ${tabGridCols} h-10`}>
                        <TabsTrigger value="avatar">Avatar</TabsTrigger>
                        <TabsTrigger value="wallet">Wallet</TabsTrigger>
                        {STUDENT_SHOP_ENABLED && (
                            <>
                                <TabsTrigger value="shop">Shop</TabsTrigger>
                                <TabsTrigger value="inventory">Collection</TabsTrigger>
                            </>
                        )}
                        <TabsTrigger value="classmates">Classmates</TabsTrigger>
                    </TabsList>
                    <TabsContent value="avatar" className="mt-4">
                        {/* onGoToShop only wired when the shop is enabled; the
                            avatar editor swallows undefined and hides its
                            "Visit the shop →" CTA. */}
                        <StudentAvatarTab
                            onGoToShop={STUDENT_SHOP_ENABLED ? () => setActiveTab("shop") : undefined}
                        />
                    </TabsContent>
                    <TabsContent value="wallet" className="mt-4">
                        <WalletTab />
                    </TabsContent>
                    {STUDENT_SHOP_ENABLED && (
                        <>
                            <TabsContent value="shop" className="mt-4">
                                <StudentShopTab />
                            </TabsContent>
                            <TabsContent value="inventory" className="mt-4">
                                <StudentInventoryTab onGoToShop={() => setActiveTab("shop")} />
                            </TabsContent>
                        </>
                    )}
                    <TabsContent value="classmates" className="mt-4">
                        <StudentClassmatesTab />
                    </TabsContent>
                </Tabs>
            </div>
    );
}
