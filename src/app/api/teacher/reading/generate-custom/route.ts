import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canGenerateReadingContent } from '@/lib/auth/reading-content';
import { generateCustomPassage } from '@/lib/reading/generate/custom-passage';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    if (!(await canGenerateReadingContent(user))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.pages) || body.pages.length === 0) {
      return NextResponse.json({ error: 'Please provide at least one page with text' }, { status: 400 });
    }

    const readingLevelId = Number.isInteger(body.readingLevelId) ? body.readingLevelId : 2;

    // Create a streaming response using NDJSON
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const sendEvent = async (data: Record<string, any>) => {
      try {
        await writer.write(encoder.encode(JSON.stringify(data) + '\n'));
      } catch (err) {
        console.error('[generate-custom] stream write error:', err);
      }
    };

    // Run async in background connected to the stream
    (async () => {
      try {
        await generateCustomPassage({
          title: body.title,
          readingLevelId,
          pages: body.pages,
          characters: body.characters,
          setting: body.setting,
          summary: body.summary,
          generateQuestions: body.generateQuestions !== false,
          style: body.style,
          onProgress: (event) => {
            void sendEvent(event);
          },
        });
      } catch (err) {
        logError(err, 'api/teacher/reading/generate-custom streaming task');
        const msg = err instanceof Error ? err.message : 'Generation failed';
        await sendEvent({ step: 'error', error: msg });
      } finally {
        try {
          await writer.close();
        } catch {
          // stream already closed
        }
      }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    logError(err, 'api/teacher/reading/generate-custom');
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
