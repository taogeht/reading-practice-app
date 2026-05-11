'use client';

// Reading-feature landing hub. Three cards funnel teachers into the
// actual work surfaces (generate / review queue / browse library);
// stat badges on each card surface "what's waiting" so the teacher
// can pick the high-leverage destination at a glance.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ClipboardList,
  Loader2,
  Sparkles,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface StatsResponse {
  counts: {
    review: number;
    draft: number;
    published: number;
    archived: number;
  };
}

export default function TeacherReadingHubPage() {
  const router = useRouter();
  const [counts, setCounts] = useState<StatsResponse['counts'] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/teacher/reading/stats');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as StatsResponse;
        if (!cancelled) setCounts(body.counts);
      } catch (err) {
        // Best-effort — the hub stays useful without badges if the
        // stats call fails. Log and move on.
        console.error('reading stats fetch failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => router.push('/teacher/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Reading Practice</h1>
              <p className="text-gray-600 mt-1">
                Generate new stories, review what&rsquo;s waiting, and browse the
                published library.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HubCard
            href="/teacher/reading/generate"
            icon={<Sparkles className="w-5 h-5 text-purple-600" />}
            title="Generate stories"
            description="Create new reading passages for the library. Defaults are tuned per level; advanced controls let you pick target words, length, grammar, and questions."
            cta="Start generating"
          />
          <HubCard
            href="/teacher/reading/review"
            icon={<ClipboardList className="w-5 h-5 text-amber-600" />}
            title="Review queue"
            description="Approve or reject generated passages before they reach students. Edit page text inline; regenerate pages or questions as needed."
            cta="Open review queue"
            badge={
              loading
                ? null
                : counts && counts.review > 0
                  ? {
                      label: `${counts.review} awaiting review`,
                      className: 'bg-amber-100 text-amber-800 border-amber-300',
                    }
                  : { label: 'Nothing waiting', className: 'text-gray-500 border-gray-200' }
            }
          />
          <HubCard
            href="/teacher/reading/review?status=published"
            icon={<BookOpen className="w-5 h-5 text-blue-600" />}
            title="Browse library"
            description="Every published passage that students can read. Same review-queue UI with the status filter pre-set to Published."
            cta="Browse library"
            badge={
              loading
                ? null
                : counts && counts.published > 0
                  ? {
                      label: `${counts.published} published`,
                      className: 'bg-blue-50 text-blue-700 border-blue-200',
                    }
                  : { label: 'No published stories yet', className: 'text-gray-500 border-gray-200' }
            }
          />
        </div>

        {/* Secondary footer with the smaller counts — present mostly for
            operators (admins) curious about draft/archived volume. */}
        {!loading && counts && (
          <div className="mt-8 text-sm text-gray-500 flex flex-wrap gap-4">
            <span>{counts.review} in review</span>
            <span>·</span>
            <span>{counts.published} published</span>
            {counts.draft > 0 && (
              <>
                <span>·</span>
                <span>{counts.draft} draft (skip-images test artifacts)</span>
              </>
            )}
            {counts.archived > 0 && (
              <>
                <span>·</span>
                <span>{counts.archived} archived</span>
              </>
            )}
          </div>
        )}
        {loading && (
          <div className="mt-8 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading library counts…
          </div>
        )}
      </div>
    </div>
  );
}

function HubCard({
  href,
  icon,
  title,
  description,
  cta,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  badge?: { label: string; className: string } | null;
}) {
  return (
    <Link
      href={href}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
    >
      <Card className="h-full hover:shadow-md transition-shadow border-gray-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          {badge && (
            <Badge
              variant="outline"
              className={`mt-1 self-start ${badge.className} text-xs`}
            >
              {badge.label}
            </Badge>
          )}
          <CardDescription className="mt-2 leading-relaxed">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 group-hover:text-blue-900">
            {cta}
            <ArrowRight className="w-4 h-4" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
