import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { UI_STRINGS, isUiStringId } from '@/lib/i18n/ui-strings';
import { ensurePhonicsAudio } from '@/lib/tts/phonics-audio';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 30;

// GET /api/student/ui-audio?key=<UiStringId>
// Student-safe read-aloud for FIXED dashboard UI labels only. Resolves the key
// to its English text from the UI_STRINGS allowlist and returns a cached TTS
// proxy URL (Google Journey-F via ensurePhonicsAudio). This deliberately does
// NOT accept free-form text, so the teacher/admin-only /api/tts/generate stays
// the only path for arbitrary generation. Returns { url: null } on any failure
// so the client falls back to the browser's Web Speech API.
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const key = request.nextUrl.searchParams.get('key') ?? '';
    if (!isUiStringId(key)) {
      return NextResponse.json({ error: 'Unknown label' }, { status: 400 });
    }

    const url = await ensurePhonicsAudio(UI_STRINGS[key].en);
    return NextResponse.json({ url });
  } catch (error) {
    logError(error, 'api/student/ui-audio');
    // Soft-fail: the client falls back to Web Speech.
    return NextResponse.json({ url: null });
  }
}
