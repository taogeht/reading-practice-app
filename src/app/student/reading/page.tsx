'use client';

// Standalone /student/reading page. Provides the page-level chrome
// (gradient bg, max-width container) and embeds the shared
// ReadingLibrary. The reader's "← Library" link points here so a
// kid finishing a story always lands on a stable URL.

import { ReadingLibrary } from '@/components/reading/reading-library';
import { useHeartbeat } from '@/hooks/use-heartbeat';

export default function StudentReadingLibraryPage() {
  useHeartbeat();
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
        <ReadingLibrary />
      </div>
    </div>
  );
}
