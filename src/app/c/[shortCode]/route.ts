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

    if (!shortCode || shortCode.length < 4) {
        return NextResponse.redirect(new URL('/student-login', request.url));
    }

    try {
        const classRecords = await db
            .select({ id: classes.id })
            .from(classes)
            .where(like(classes.id, `${shortCode}%`))
            .limit(1);

        if (classRecords.length > 0) {
            return NextResponse.redirect(new URL(`/student-login/${classRecords[0].id}`, request.url));
        }
    } catch (err) {
        console.error("Error finding class by shortcode", err);
    }

    return NextResponse.redirect(new URL('/student-login', request.url));
}
