'use client';

// Focused per-job detail page. Lists each passage attempt in the
// batch, surfaces translated failure reasons (with a "Show technical
// details" toggle), and offers a retry button when at least one
// passage failed. Settings used by the job appear at the top so the
// teacher can recognise the run without scrolling back to the
// generate form.

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCcw,
  X,
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
import { READING_LEVELS } from '@/lib/reading/levels';

interface PassageResult {
  passageId: string;
  status: 'review' | 'draft' | 'failed';
  qualityReport: {
    proseScore: number;
    questionsScore: number;
    imagesValid: boolean;
    passageReady: boolean;
  };
  targetVocabIds: string[];
  failure?: {
    teacherMessage: string;
    technicalDetails: string;
    failureStage: string;
  };
}

interface JobDetail {
  id: string;
  parentJobId: string | null;
  createdAt: string;
  updatedAt: string;
  readingLevelId: number;
  countRequested: number;
  overridesUsed: Record<string, unknown>;
  status: 'queued' | 'running' | 'completed' | 'failed';
  passagesSucceeded: number;
  passagesFailed: number;
  passagesResults: PassageResult[];
  hasRetry: boolean;
}

export default function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [showTech, setShowTech] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/reading/jobs/${jobId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { job: JobDetail };
      setJob(body.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRetry = async () => {
    if (!job) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/teacher/reading/jobs/${job.id}/retry`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { jobId: string };
      router.push(`/teacher/reading/jobs/${body.jobId}`);
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading job…
        </div>
      </Shell>
    );
  }
  if (error || !job) {
    return (
      <Shell>
        <Card>
          <CardContent className="p-6 text-red-700">
            {error ?? 'Job not found'}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const levelDef = READING_LEVELS.find((l) => l.id === job.readingLevelId);

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <StatusBadge status={job.status} />
            <span>
              Level {job.readingLevelId} · {job.countRequested}{' '}
              {job.countRequested === 1 ? 'story' : 'stories'} requested
            </span>
          </CardTitle>
          <CardDescription>
            Started {new Date(job.createdAt).toLocaleString()} · {levelDef?.name ?? `Level ${job.readingLevelId}`}
            {job.parentJobId && (
              <>
                {' '}·{' '}
                <Link
                  href={`/teacher/reading/jobs/${job.parentJobId}`}
                  className="text-blue-700 hover:underline"
                >
                  Retry of an earlier run
                </Link>
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-700">
          <p>
            <span className="font-medium text-gray-900">
              {job.passagesSucceeded}
            </span>{' '}
            succeeded ·{' '}
            <span className="font-medium text-gray-900">
              {job.passagesFailed}
            </span>{' '}
            failed
          </p>
          <SettingsSummary overrides={job.overridesUsed} />
        </CardContent>
      </Card>

      <div className="mt-6 space-y-3">
        {job.passagesResults.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-gray-600">
              {job.status === 'queued' || job.status === 'running'
                ? "Generation is still running. Refresh in a few minutes — passages will appear here as they finish."
                : 'No results recorded.'}
            </CardContent>
          </Card>
        ) : (
          job.passagesResults.map((p, i) => {
            const techKey = `${i}`;
            const techOpen = !!showTech[techKey];
            return (
              <Card key={`${p.passageId}-${i}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {p.status === 'failed' ? (
                      <X className="w-4 h-4 text-red-600" />
                    ) : (
                      <Check className="w-4 h-4 text-green-600" />
                    )}
                    Passage {i + 1}
                    <Badge
                      variant="outline"
                      className={
                        p.status === 'failed'
                          ? 'border-red-300 text-red-700 bg-red-50'
                          : 'border-green-300 text-green-700 bg-green-50'
                      }
                    >
                      {p.status}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {p.status === 'failed' ? (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-800">
                        {p.failure?.teacherMessage ??
                          'Generation failed. Try again.'}
                      </p>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                        onClick={() =>
                          setShowTech((cur) => ({ ...cur, [techKey]: !cur[techKey] }))
                        }
                      >
                        {techOpen ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                        {techOpen ? 'Hide technical details' : 'Show technical details'}
                      </button>
                      {techOpen && p.failure && (
                        <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto whitespace-pre-wrap">
{`stage: ${p.failure.failureStage}\n${p.failure.technicalDetails || '(no validator issues recorded)'}`}
                        </pre>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <p className="text-gray-800">
                        Quality:{' '}
                        <span className="font-medium">
                          prose {p.qualityReport.proseScore.toFixed(2)}
                        </span>{' '}
                        ·{' '}
                        <span className="font-medium">
                          questions {p.qualityReport.questionsScore.toFixed(2)}
                        </span>{' '}
                        · images{' '}
                        {p.qualityReport.imagesValid ? 'valid' : 'invalid'}
                      </p>
                      <Link
                        href={`/teacher/reading/review/${p.passageId}`}
                        className="text-sm text-blue-700 hover:underline inline-block"
                      >
                        Open in review queue →
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {(job.hasRetry || job.status === 'failed') && (
        <div className="mt-8 flex flex-wrap items-center gap-3 bg-white border rounded-lg p-4 shadow-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span className="text-sm text-gray-700">
            Re-run with the same settings — useful for transient failures
            (image quota, Gemini hiccup).
          </span>
          <Button
            onClick={() => void onRetry()}
            disabled={retrying}
            className="ml-auto"
          >
            {retrying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <RefreshCcw className="w-4 h-4 mr-2" />
                Retry with same settings
              </>
            )}
          </Button>
        </div>
      )}
      {retryError && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
          {retryError}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/teacher/reading')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Reading hub
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Generation Job</h1>
              <p className="text-gray-600 mt-1 text-sm">
                Per-passage results + retry for this batch.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-8">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: JobDetail['status'] }) {
  const map: Record<JobDetail['status'], { label: string; cls: string }> = {
    queued: { label: 'Queued', cls: 'border-gray-300 text-gray-700 bg-gray-50' },
    running: { label: 'Running', cls: 'border-blue-300 text-blue-700 bg-blue-50' },
    completed: {
      label: 'Completed',
      cls: 'border-green-300 text-green-700 bg-green-50',
    },
    failed: { label: 'Failed', cls: 'border-red-300 text-red-700 bg-red-50' },
  };
  const { label, cls } = map[status];
  return (
    <Badge variant="outline" className={cls}>
      {label}
    </Badge>
  );
}

function SettingsSummary({ overrides }: { overrides: Record<string, unknown> }) {
  // Render the override object as terse one-line summaries the
  // teacher can scan. Anything they didn't touch was a level default
  // and stays off this list.
  const keys = Object.keys(overrides);
  if (keys.length === 0) {
    return <p className="text-xs text-gray-500">Default settings.</p>;
  }
  return (
    <div className="text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
      {keys.map((k) => {
        const v = overrides[k];
        return (
          <span key={k}>
            <span className="font-medium text-gray-800">{k}</span>:{' '}
            <code className="bg-gray-100 px-1 rounded">
              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </code>
          </span>
        );
      })}
    </div>
  );
}
