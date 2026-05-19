"use client";

import Link from "next/link";
import { ShoppingBag, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStars } from "@/components/providers/stars-provider";

// Compact dashboard promo for the star shop. Shows the current balance and a
// direct link into /student/stuff?tab=shop so kids don't have to discover the
// nav badges to find spending. Mobile-first: full-width card, large tap target.
export function ShopCalloutCard() {
    const { balance } = useStars();
    return (
        <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
            <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 shrink-0">
                            <ShoppingBag className="w-6 h-6 text-amber-700" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-gray-900 leading-tight">Star Shop</h3>
                            <p className="text-sm text-gray-600 flex items-center gap-1">
                                You have
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                                <span className="font-semibold tabular-nums">{balance}</span>
                                to spend
                            </p>
                        </div>
                    </div>
                    <Link href="/student/stuff?tab=shop" className="shrink-0">
                        <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                            Open Shop →
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}
