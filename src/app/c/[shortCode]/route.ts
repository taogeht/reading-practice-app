import { NextRequest, NextResponse } from "next/server";
import { resolveClassLoginCode } from '@/lib/classes/login-code';

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

    try {
        const destination = await resolveClassLoginCode(shortCode);
        if (destination) {
            const url = new URL(`/student-login/${destination.id}`, baseUrl).toString();
            return NextResponse.redirect(url);
        }
    } catch (err) {
        console.error("Error finding class by shortcode/slug", err);
    }

    return NextResponse.redirect(notFoundUrl);
}
