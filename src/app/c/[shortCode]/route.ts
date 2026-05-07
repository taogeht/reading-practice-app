import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classes } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export const runtime = 'nodejs';

// /c/<code> resolves to a class's student-login URL.
//
// Lookup order:
//   1. Slug match — the memorable URL form (e.g. /c/grade-1-2026). Slugs
//      are guaranteed-not-all-hex, so this never collides with the prefix path.
//   2. UUID prefix — the legacy form. Existing printed cards or links using
//      the first N chars of a class's UUID keep working forever.
//
// Falls back to /student-login (the empty-class fallback page) on miss.
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ shortCode: string }> }
) {
    const { shortCode } = await params;

    // Determine the true base URL (handling proxies or environment overrides)
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const proxyBaseUrl = host ? `${protocol}://${host}` : null;
    const fallbackBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
    const baseUrl = proxyBaseUrl || fallbackBaseUrl || request.nextUrl.origin;

    const notFoundUrl = new URL('/student-login', baseUrl).toString();

    if (!shortCode) {
        return NextResponse.redirect(notFoundUrl);
    }

    const code = shortCode.toLowerCase();

    try {
        // Try slug first. Slugs are case-insensitive (we store lowercase),
        // and guaranteed not all-hex, so they don't shadow UUID prefixes.
        const slugMatch = await db
            .select({ id: classes.id })
            .from(classes)
            .where(eq(classes.slug, code))
            .limit(1);
        if (slugMatch.length > 0) {
            const url = new URL(`/student-login/${slugMatch[0].id}`, baseUrl).toString();
            return NextResponse.redirect(url);
        }

        // Fall back to UUID-prefix match for backward compatibility with any
        // shortcodes shared before slugs existed.
        if (code.length >= 4) {
            const prefixMatch = await db
                .select({ id: classes.id })
                .from(classes)
                .where(sql`${classes.id}::text LIKE ${code + '%'}`)
                .limit(1);
            if (prefixMatch.length > 0) {
                const url = new URL(`/student-login/${prefixMatch[0].id}`, baseUrl).toString();
                return NextResponse.redirect(url);
            }
        }
    } catch (err) {
        console.error("Error finding class by shortcode/slug", err);
    }

    return NextResponse.redirect(notFoundUrl);
}
