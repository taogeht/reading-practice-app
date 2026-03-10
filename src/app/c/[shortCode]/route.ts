import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classes } from "@/lib/db/schema";
import { like } from "drizzle-orm";

export const runtime = 'nodejs';

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

    if (!shortCode || shortCode.length < 4) {
        return NextResponse.redirect(notFoundUrl);
    }

    try {
        const classRecords = await db
            .select({ id: classes.id })
            .from(classes)
            .where(like(classes.id, `${shortCode}%`))
            .limit(1);

        if (classRecords.length > 0) {
            const successUrl = new URL(`/student-login/${classRecords[0].id}`, baseUrl).toString();
            return NextResponse.redirect(successUrl);
        }
    } catch (err) {
        console.error("Error finding class by shortcode", err);
    }

    return NextResponse.redirect(notFoundUrl);
}
