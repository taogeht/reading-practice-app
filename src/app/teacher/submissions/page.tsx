"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  FileText,
  ChevronDown,
  Trash2,
  Download,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { AIAnalysisPanel } from "@/components/grading/ai-analysis-panel";
import { TeacherReplyRecorder } from "@/components/recordings/teacher-reply-recorder";
import { RecordingAudioPlayer } from "@/components/recordings/recording-audio-player";

interface Recording {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  classId: string;
  className: string;
  audioUrl: string;
  audioDurationSeconds: number | null;
  attemptNumber: number;
  status: 'pending' | 'reviewed' | 'flagged';
  submittedAt: string;
  reviewedAt: string | null;
  teacherFeedback: string | null;
  accuracyScore: number | null;
  wpmScore: number | null;
  letterGrade: string | null;
  transcript: string | null;
  analysisJson: Record<string, unknown> | null;
  wcpm: string | number | null;
  fluencyScore: string | number | null;
  eslWcpmBand: 'concern' | 'developing' | 'on_target' | 'above_target' | null;
  nativeWcpmBand: 'concern' | 'developing' | 'on_target' | 'above_target' | null;
  phrasingScore: number | null;
  smoothnessScore: number | null;
  paceScore: number | null;
  teacherSummary: string | null;
  teacherSummaryZh: string | null;
  recordingMode: 'teacher_review' | 'ai_graded';
  maxAttempts: number | null;
  teacherReplyAudioUrl: string | null;
  teacherReplyDurationSeconds: number | null;
}

interface AttemptGroup {
  key: string;
  assignmentId: string;
  assignmentTitle: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  classId: string;
  className: string;
  recordingMode: 'teacher_review' | 'ai_graded';
  maxAttempts: number;
  attempts: Recording[];
  latestSubmittedAt: string;
}

type FilterKey = 'all' | 'pending' | 'reviewed' | 'flagged';

// Status rendered as a dot + low-saturation text label (Linear / Stripe
// idiom), never a filled chip. The single rose accent carries urgency;
// amber is the quieter warning. Reviewed sits as plain stone.
const STATUS_TONE: Record<Recording['status'], { dot: string; text: string }> = {
  pending: { dot: 'bg-amber-700', text: 'text-amber-800' },
  reviewed: { dot: 'bg-stone-400', text: 'text-stone-600' },
  flagged: { dot: 'bg-rose-700', text: 'text-rose-800' },
};

export default function TeacherSubmissionsPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [feedbackMode, setFeedbackMode] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [selectedRating, setSelectedRating] = useState<string | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState<boolean>(false);
  const [expandedClassIds, setExpandedClassIds] = useState<Set<string>>(() => new Set());
  const [hideReviewed, setHideReviewed] = useState<boolean>(true);

  useEffect(() => {
    fetchRecordings();
  }, []);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem('teacher-submissions.hide-reviewed');
      if (v === 'off') setHideReviewed(false);
      else if (v === 'on') setHideReviewed(true);
    } catch {
      /* private-mode safe */
    }
  }, []);

  const toggleHideReviewed = () => {
    setHideReviewed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('teacher-submissions.hide-reviewed', next ? 'on' : 'off');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const toggleClassExpanded = (classId: string) => {
    setExpandedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  };

  const fetchRecordings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/recordings');
      if (!response.ok) throw new Error('Failed to fetch recordings');
      const data = await response.json();
      setRecordings(data.recordings || []);
    } catch (error) {
      console.error('Error fetching recordings:', error);
      setError('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const fetchPresignedUrl = async (recordingId: string): Promise<string | null> => {
    try {
      const response = await fetch(`/api/recordings/${recordingId}/download-url`);
      if (!response.ok) throw new Error('Failed to get download URL');
      const { downloadUrl } = await response.json();
      return downloadUrl;
    } catch {
      return null;
    }
  };

  const submitFeedback = async (recordingId: string) => {
    if (!feedbackText.trim() && !selectedRating) {
      alert('Please select a rating or enter feedback before submitting.');
      return;
    }
    const finalFeedback = selectedRating
      ? `${selectedRating} ${feedbackText.trim()}`
      : feedbackText.trim();
    try {
      setSubmittingFeedback(true);
      const response = await fetch(`/api/recordings/${recordingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherFeedback: finalFeedback, status: 'reviewed' }),
      });
      if (!response.ok) throw new Error('Failed to submit feedback');
      setRecordings(prev =>
        prev.map(recording =>
          recording.id === recordingId
            ? { ...recording, teacherFeedback: finalFeedback, status: 'reviewed' as const }
            : recording
        )
      );
      setFeedbackMode(null);
      setFeedbackText('');
      setSelectedRating(null);
    } catch {
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const QUICK_RATINGS = [
    { emoji: '🌟', label: 'Excellent', message: 'Excellent work! Your reading was amazing!' },
    { emoji: '👏', label: 'Great', message: 'Great job! You read really well!' },
    { emoji: '👍', label: 'Good', message: 'Good effort! Keep practicing and you\'ll get even better!' },
    { emoji: '💪', label: 'Keep Trying', message: 'Nice try! Let\'s keep practicing together.' },
    { emoji: '🔄', label: 'Try Again', message: 'Let\'s try this one again. You can do it!' },
  ];

  const selectRating = (rating: typeof QUICK_RATINGS[0]) => {
    setSelectedRating(rating.emoji);
    setFeedbackText(rating.message);
  };

  const startFeedback = (recordingId: string, existingFeedback?: string) => {
    setFeedbackMode(recordingId);
    setFeedbackText(existingFeedback || '');
    setSelectedRating(null);
  };

  const cancelFeedback = () => {
    setFeedbackMode(null);
    setFeedbackText('');
    setSelectedRating(null);
  };

  const deleteRecording = async (recordingId: string, studentName: string, attemptNumber: number) => {
    const confirmed = confirm(`Delete attempt #${attemptNumber} by ${studentName}? This cannot be undone.`);
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/recordings/${recordingId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete recording');
      await fetchRecordings();
    } catch (error) {
      console.error('Error deleting recording:', error);
      alert('Failed to delete recording. Please try again.');
    }
  };

  const deleteAllClassRecordings = async (classId: string, className: string) => {
    const confirmed = confirm(`Delete ALL recordings from class "${className}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/recordings?classId=${classId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete recordings');
      await fetchRecordings();
      alert(`All recordings from class "${className}" have been deleted.`);
    } catch (error) {
      console.error('Error deleting class recordings:', error);
      alert('Failed to delete recordings. Please try again.');
    }
  };

  const groupsByClass = (() => {
    const groupMap = new Map<string, AttemptGroup>();
    for (const r of recordings) {
      const key = `${r.assignmentId}__${r.studentId}`;
      let group = groupMap.get(key);
      if (!group) {
        group = {
          key,
          assignmentId: r.assignmentId,
          assignmentTitle: r.assignmentTitle,
          studentId: r.studentId,
          studentFirstName: r.studentFirstName,
          studentLastName: r.studentLastName,
          classId: r.classId,
          className: r.className,
          recordingMode: r.recordingMode,
          maxAttempts: r.maxAttempts ?? 3,
          attempts: [],
          latestSubmittedAt: r.submittedAt,
        };
        groupMap.set(key, group);
      }
      group.attempts.push(r);
      if (new Date(r.submittedAt) > new Date(group.latestSubmittedAt)) {
        group.latestSubmittedAt = r.submittedAt;
      }
    }

    const filteredGroups: AttemptGroup[] = [];
    for (const group of groupMap.values()) {
      group.attempts.sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0));
      const matchesFilter = filter === 'all' || group.attempts.some(a => a.status === filter);
      if (!matchesFilter) continue;
      if (
        hideReviewed &&
        filter !== 'reviewed' &&
        group.attempts.length > 0 &&
        group.attempts.every((a) => a.status === 'reviewed')
      ) {
        continue;
      }
      filteredGroups.push(group);
    }

    const byClass: Record<string, { className: string; classId: string; groups: AttemptGroup[] }> = {};
    for (const g of filteredGroups) {
      if (!byClass[g.classId]) {
        byClass[g.classId] = { className: g.className, classId: g.classId, groups: [] };
      }
      byClass[g.classId].groups.push(g);
    }
    for (const bucket of Object.values(byClass)) {
      bucket.groups.sort(
        (a, b) => new Date(b.latestSubmittedAt).getTime() - new Date(a.latestSubmittedAt).getTime()
      );
    }
    return byClass;
  })();

  const pendingCount = recordings.filter(r => r.status === 'pending').length;
  const reviewedCount = recordings.filter(r => r.status === 'reviewed').length;
  const flaggedCount = recordings.filter(r => r.status === 'flagged').length;

  const FILTERS: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: recordings.length },
    { key: 'pending', label: 'Pending', count: pendingCount },
    { key: 'reviewed', label: 'Reviewed', count: reviewedCount },
    { key: 'flagged', label: 'Flagged', count: flaggedCount },
  ];

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-stone-50">
        <div className="max-w-[1200px] mx-auto px-6 md:px-10 pt-12 pb-24">
          {/* Skeleton header */}
          <div className="space-y-2 mb-10">
            <div className="h-6 w-32 bg-stone-200/70 rounded animate-pulse" />
            <div className="h-4 w-72 bg-stone-200/50 rounded animate-pulse" />
          </div>
          <div className="flex gap-1 mb-12">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 w-24 bg-stone-200/60 rounded animate-pulse" />
            ))}
          </div>
          {/* Skeleton class section */}
          <div className="space-y-6">
            {[1, 2].map((s) => (
              <div key={s} className="space-y-3">
                <div className="h-5 w-48 bg-stone-200/70 rounded animate-pulse" />
                <div className="space-y-2">
                  {[1, 2, 3].map((r) => (
                    <div key={r} className="h-16 w-full bg-stone-100 border border-stone-200 rounded animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-stone-50 text-stone-900">
      <div className="max-w-[1200px] mx-auto px-6 md:px-10 pt-10 pb-24">
        {/* HEADER — quiet text-link back nav, page title in sans
            font-medium (no display fonts on UI labels per product
            register), one-line subtitle. */}
        <header className="mb-10">
          <button
            type="button"
            onClick={() => router.push('/teacher/dashboard')}
            className="inline-flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-900 transition-colors duration-150 mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to dashboard
          </button>
          <h1 className="text-[26px] font-medium text-stone-900 tracking-[-0.01em] leading-tight">
            Submissions
          </h1>
          <p className="text-[13px] text-stone-500 mt-1">
            Recordings from your classes, grouped by section.
          </p>
        </header>

        {/* FILTER STRIP — true segmented control: a row of pill buttons
            with hairline border, selected fills stone-900. Counts ride
            inline in parentheses, dimmed. Less screen real estate than
            the hero-metric template; familiar Linear-style affordance. */}
        <div className="flex items-center justify-between gap-4 flex-wrap mb-10">
          <div className="inline-flex items-center bg-white border border-stone-200 rounded-md p-0.5">
            {FILTERS.map(({ key, label, count }) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`inline-flex items-baseline gap-1.5 px-3 py-1.5 text-[13px] rounded-[5px] transition-colors duration-150 ${
                    active
                      ? 'bg-stone-900 text-stone-50'
                      : 'text-stone-700 hover:text-stone-900 hover:bg-stone-50'
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`tabular-nums text-[12px] ${
                      active ? 'text-stone-400' : 'text-stone-400'
                    }`}
                  >
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>

          <label
            className={`inline-flex items-center gap-2 text-[13px] select-none ${
              filter === 'reviewed'
                ? 'text-stone-300 cursor-not-allowed'
                : 'text-stone-600 cursor-pointer hover:text-stone-900 transition-colors duration-150'
            }`}
          >
            <input
              type="checkbox"
              checked={hideReviewed}
              onChange={toggleHideReviewed}
              disabled={filter === 'reviewed'}
              className="h-3.5 w-3.5 rounded-[3px] border-stone-400 accent-stone-900"
            />
            Hide reviewed
          </label>
        </div>

        {error && (
          <div className="text-[13px] text-rose-800 bg-rose-50/60 border border-rose-200 px-4 py-3 mb-8">
            {error}
          </div>
        )}

        {Object.keys(groupsByClass).length === 0 ? (
          // Empty state teaches the surface rather than just saying "nothing".
          <div className="border border-stone-200 bg-white py-16 px-6 text-center max-w-[560px] mx-auto">
            <FileText className="w-7 h-7 mx-auto mb-4 text-stone-300" strokeWidth={1.5} />
            <h3 className="text-[15px] font-medium text-stone-900 mb-1">
              {filter === 'all' ? 'No submissions yet' : `No ${filter} submissions`}
            </h3>
            <p className="text-[13px] text-stone-500 leading-relaxed max-w-[44ch] mx-auto">
              {filter === 'all'
                ? 'Once students start recording, their attempts will appear here, grouped by class.'
                : `Nothing with the ${filter} status to show. Try a different filter, or clear it to see everything.`}
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {Object.values(groupsByClass).map(({ className, classId, groups }) => {
              const expanded = expandedClassIds.has(classId);
              const pendingInClass = groups.reduce(
                (n, g) => n + g.attempts.filter((a) => a.status === 'pending').length,
                0,
              );
              const flaggedInClass = groups.reduce(
                (n, g) => n + g.attempts.filter((a) => a.status === 'flagged').length,
                0,
              );
              return (
                <section key={classId}>
                  {/* CLASS HEADER — no card. A 1px top rule, the class
                      name as a sans heading, a quiet meta line with
                      counts and a "delete all" text link.
                      "Delete all" demoted to a text link; never a
                      destructive button in the header. */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleClassExpanded(classId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleClassExpanded(classId);
                      }
                    }}
                    className="group cursor-pointer select-none border-t border-stone-300 pt-5 pb-3"
                    aria-expanded={expanded}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="text-[18px] font-medium text-stone-900 leading-tight">
                          {className}
                        </h2>
                        <div className="flex items-center gap-3 text-[12px] text-stone-500 mt-1.5 flex-wrap">
                          <span>
                            <span className="tabular-nums text-stone-700">{groups.length}</span>{' '}
                            submission{groups.length !== 1 ? 's' : ''}
                          </span>
                          {pendingInClass > 0 && (
                            <>
                              <span className="text-stone-300">·</span>
                              <span className="inline-flex items-center gap-1.5 text-amber-800">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-700" />
                                <span className="tabular-nums">{pendingInClass}</span> pending
                              </span>
                            </>
                          )}
                          {flaggedInClass > 0 && (
                            <>
                              <span className="text-stone-300">·</span>
                              <span className="inline-flex items-center gap-1.5 text-rose-800">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-700" />
                                <span className="tabular-nums">{flaggedInClass}</span> flagged
                              </span>
                            </>
                          )}
                          <span className="text-stone-300">·</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteAllClassRecordings(classId, className);
                            }}
                            className="text-stone-500 hover:text-rose-800 transition-colors duration-150 underline-offset-[3px] hover:underline"
                          >
                            Delete all
                          </button>
                        </div>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-stone-400 mt-1.5 transition-transform duration-200 ${
                          expanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-2 border-t border-stone-200 divide-y divide-stone-200">
                      {groups.map((group) => {
                        const studentName = `${group.studentFirstName} ${group.studentLastName}`;
                        const visibleAttempts =
                          filter === 'all'
                            ? group.attempts
                            : group.attempts.filter(a => a.status === filter);
                        return (
                          <article key={group.key} className="py-6">
                            {/* GROUP META — student + assignment side-by-
                                side, attempts used + last-submitted on
                                the right. */}
                            <header className="flex items-baseline justify-between gap-4 flex-wrap mb-4">
                              <div className="min-w-0">
                                <div className="text-[15px] font-medium text-stone-900 leading-tight">
                                  {studentName}
                                </div>
                                <div className="text-[13px] text-stone-500 mt-0.5">
                                  {group.assignmentTitle}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 text-[12px] text-stone-500 flex-wrap">
                                {group.recordingMode === 'ai_graded' && (
                                  <span className="inline-flex items-center gap-1.5 text-stone-600">
                                    <Sparkles className="w-3 h-3" />
                                    AI graded
                                  </span>
                                )}
                                <span>
                                  <span className="tabular-nums text-stone-700">
                                    {group.attempts.length}
                                  </span>
                                  <span className="text-stone-400">/</span>
                                  <span className="tabular-nums">{group.maxAttempts}</span>{' '}
                                  attempts
                                </span>
                                <span className="tabular-nums">
                                  {format(new Date(group.latestSubmittedAt), 'MMM d, h:mm a')}
                                </span>
                              </div>
                            </header>

                            <div className="space-y-5">
                              {visibleAttempts.map((recording, idx) => {
                                const tone = STATUS_TONE[recording.status];
                                return (
                                  <div
                                    key={recording.id}
                                    className={idx > 0 ? 'pt-5 border-t border-stone-200/70' : ''}
                                  >
                                    <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                                      <div className="flex items-baseline gap-3 flex-wrap text-[13px]">
                                        <span className="text-[12px] text-stone-500 tabular-nums">
                                          Attempt {recording.attemptNumber}
                                        </span>
                                        <span className="text-stone-300">·</span>
                                        <span className="inline-flex items-center gap-1.5">
                                          <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                                          <span className={`capitalize ${tone.text}`}>
                                            {recording.status}
                                          </span>
                                        </span>
                                        {recording.letterGrade && (
                                          <>
                                            <span className="text-stone-300">·</span>
                                            <span className="text-stone-500">
                                              Grade{' '}
                                              <span className="text-stone-900 font-medium">
                                                {recording.letterGrade}
                                              </span>
                                            </span>
                                          </>
                                        )}
                                        {recording.accuracyScore !== null && (
                                          <>
                                            <span className="text-stone-300">·</span>
                                            <span className="tabular-nums text-stone-700">
                                              {recording.accuracyScore}%
                                            </span>
                                          </>
                                        )}
                                        <span className="text-stone-300">·</span>
                                        <span className="tabular-nums text-stone-500 text-[12px]">
                                          {format(new Date(recording.submittedAt), 'MMM d, h:mm a')}
                                        </span>
                                        {recording.audioDurationSeconds && (
                                          <>
                                            <span className="text-stone-300">·</span>
                                            <span className="tabular-nums text-stone-500 text-[12px]">
                                              {Math.floor(recording.audioDurationSeconds / 60)}:
                                              {(recording.audioDurationSeconds % 60).toString().padStart(2, '0')}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          deleteRecording(
                                            recording.id,
                                            studentName,
                                            recording.attemptNumber,
                                          )
                                        }
                                        className="text-stone-400 hover:text-rose-800 transition-colors duration-150 p-1 -m-1"
                                        title={`Delete attempt ${recording.attemptNumber}`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                                      </button>
                                    </div>

                                    <div className="flex items-center gap-3 flex-wrap">
                                      <div className="flex-1 min-w-[280px]">
                                        <RecordingAudioPlayer
                                          recordingId={recording.id}
                                          fallbackDurationSeconds={recording.audioDurationSeconds}
                                        />
                                      </div>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const downloadUrl = await fetchPresignedUrl(recording.id);
                                          if (downloadUrl) window.open(downloadUrl, '_blank');
                                          else alert('Unable to generate download link. Please try again.');
                                        }}
                                        className="inline-flex items-center gap-1.5 text-[12px] text-stone-600 hover:text-stone-900 transition-colors duration-150"
                                        title="Download recording"
                                      >
                                        <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                                        Download
                                      </button>
                                      <div className="flex items-center gap-2">
                                        {feedbackMode === recording.id ? (
                                          <>
                                            <Button
                                              size="sm"
                                              onClick={() => submitFeedback(recording.id)}
                                              disabled={submittingFeedback || !feedbackText.trim()}
                                              className="h-8 px-3 text-[13px] bg-stone-900 hover:bg-stone-800 text-stone-50"
                                            >
                                              {submittingFeedback ? 'Saving' : 'Save'}
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={cancelFeedback}
                                              disabled={submittingFeedback}
                                              className="h-8 px-3 text-[13px] text-stone-600 hover:bg-stone-100"
                                            >
                                              Cancel
                                            </Button>
                                          </>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              startFeedback(
                                                recording.id,
                                                recording.teacherFeedback || '',
                                              )
                                            }
                                            className="text-[12px] text-stone-600 hover:text-stone-900 transition-colors duration-150"
                                          >
                                            {recording.teacherFeedback ? 'Edit feedback' : '+ Add feedback'}
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {recording.recordingMode === 'ai_graded' && (
                                      <div className="mt-1">
                                        <AIAnalysisPanel
                                          recordingId={recording.id}
                                          letterGrade={recording.letterGrade}
                                          accuracyScore={
                                            recording.accuracyScore !== null
                                              ? Number(recording.accuracyScore)
                                              : null
                                          }
                                          wpmScore={
                                            recording.wpmScore !== null ? Number(recording.wpmScore) : null
                                          }
                                          wcpm={recording.wcpm !== null ? Number(recording.wcpm) : null}
                                          fluencyScore={
                                            recording.fluencyScore !== null
                                              ? Number(recording.fluencyScore)
                                              : null
                                          }
                                          eslWcpmBand={recording.eslWcpmBand}
                                          nativeWcpmBand={recording.nativeWcpmBand}
                                          phrasingScore={recording.phrasingScore}
                                          smoothnessScore={recording.smoothnessScore}
                                          paceScore={recording.paceScore}
                                          teacherSummary={recording.teacherSummary}
                                          teacherSummaryZh={recording.teacherSummaryZh}
                                          transcript={recording.transcript}
                                          analysisJson={recording.analysisJson as never}
                                          onReanalyzed={fetchRecordings}
                                        />
                                      </div>
                                    )}

                                    {feedbackMode === recording.id && (
                                      <div className="mt-4 border-t border-stone-200 pt-4 space-y-4">
                                        <div>
                                          <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-2.5">
                                            Quick rating
                                          </div>
                                          <div className="flex gap-1.5 flex-wrap">
                                            {QUICK_RATINGS.map((rating) => {
                                              const isSelected = selectedRating === rating.emoji;
                                              return (
                                                <button
                                                  key={rating.emoji}
                                                  type="button"
                                                  onClick={() => selectRating(rating)}
                                                  disabled={submittingFeedback}
                                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md text-[12px] transition-colors duration-150 ${
                                                    isSelected
                                                      ? 'bg-stone-900 border-stone-900 text-stone-50'
                                                      : 'bg-white border-stone-200 text-stone-700 hover:border-stone-400'
                                                  }`}
                                                >
                                                  <span className="text-[14px] leading-none">{rating.emoji}</span>
                                                  {rating.label}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                        <div>
                                          <label
                                            htmlFor={`feedback-${recording.id}`}
                                            className="block text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-1.5"
                                          >
                                            Message
                                          </label>
                                          <Textarea
                                            id={`feedback-${recording.id}`}
                                            value={feedbackText}
                                            onChange={(e) => setFeedbackText(e.target.value)}
                                            placeholder="Pick a rating, or write your own"
                                            rows={3}
                                            disabled={submittingFeedback}
                                            className="w-full border-stone-200 focus-visible:border-stone-900 focus-visible:ring-0 text-[14px]"
                                          />
                                        </div>
                                        <TeacherReplyRecorder
                                          recordingId={recording.id}
                                          initialAudioUrl={recording.teacherReplyAudioUrl}
                                          initialDurationSeconds={recording.teacherReplyDurationSeconds}
                                          onChange={fetchRecordings}
                                          disabled={submittingFeedback}
                                        />
                                        <p className="text-[11px] text-stone-500">
                                          Applies to attempt {recording.attemptNumber}; marks it reviewed.
                                        </p>
                                      </div>
                                    )}

                                    {recording.teacherFeedback && feedbackMode !== recording.id && (
                                      <div className="mt-3 bg-stone-50 border border-stone-200 px-3.5 py-3">
                                        <div className="text-[10px] uppercase tracking-[0.14em] text-stone-500 mb-1">
                                          Feedback, attempt {recording.attemptNumber}
                                        </div>
                                        <p className="text-[14px] text-stone-800 leading-relaxed max-w-[60ch]">
                                          {recording.teacherFeedback}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
