'use client';

// Standalone /student/reading page. Provides the page-level chrome
// (sticky header with a back-to-Dashboard link, gradient bg,
// max-width container) and embeds the shared ReadingLibrary.
//
// The reader's "← Library" link points here, so a kid finishing a
// story lands on this page; from here they need a way back to the
// dashboard, hence the header.
//
// The same ReadingLibrary component is also rendered inside the
// dashboard's Stories tab — that embed deliberately does NOT include
// this back-link because the dashboard's tab nav already provides
// the home affordance.

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ReadingLibrary } from '@/components/reading/reading-library';
import { useHeartbeat } from '@/hooks/use-heartbeat';

export default function StudentReadingLibraryPage() {
  useHeartbeat();
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <header className="bg-white/80 backdrop-blur sticky top-0 z-30 border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center">
          <Link
            href="/student/dashboard"
            className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 active:scale-95 text-sm font-medium"
          >
            <ArrowLeft className="w-5 h-5" />
            Dashboard
          </Link>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
        <ReadingLibrary />
      </div>
    </div>
  );
}
