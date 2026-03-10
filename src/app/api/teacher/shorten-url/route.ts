import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    try {
        const { url } = await request.json();

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // Use is.gd as it's very reliable and fast, or fallback to tinyurl
        const res = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`);

        if (!res.ok) {
            // Fallback to tinyurl if is.gd fails
            const fallbackRes = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
            if (fallbackRes.ok) {
                const shortUrl = await fallbackRes.text();
                return NextResponse.json({ shortUrl }, { status: 200 });
            }
            throw new Error(`is.gd returned ${res.status}`);
        }

        const shortUrl = await res.text();
        return NextResponse.json({ shortUrl }, { status: 200 });

    } catch (error) {
        console.error('Error shortening URL:', error);
        return NextResponse.json(
            { error: 'Failed to shorten URL' },
            { status: 500 }
        );
    }
}
