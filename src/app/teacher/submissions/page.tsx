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
  // Phase 7 fluency fields. All optional — null on pre-fluency rows / Whisper-only.
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

// Tone tokens for the submission status — kept as a tiny colored dot
// alongside an uppercase tracked label rather than a filled chip.
// Single accent palette: emerald (reviewed) / amber (pending) / rose
// (flagged). No purple anywhere.
const STATUS_TONE: Record<Recording['status'], { dot: string; text: string }> = {
  pending: { dot: 'bg-amber-500', text: 'text-amber-700' },
  reviewed: { dot: 'bg-emerald-600', text: 'text-emerald-700' },
  flagged: { dot: 'bg-rose-600', text: 'text-rose-700' },
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
  // Per-class expand/collapse. Each page load starts every class
  // collapsed so a teacher with many classes lands on a quiet,
  // overview page; tapping a class header expands its content.
  const [expandedClassIds, setExpandedClassIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Hide groups whose attempts have all been reviewed. Defaults ON to
  // keep the page focused on actionable work; persisted to
  // localStorage so the teacher's preference sticks across navigations.
  // Bypassed when the active filter is 'reviewed' (otherwise the page
  // would render empty).
  const [hideReviewed, setHideReviewed] = useState<boolean>(true);

  useEffect(() => {
    fetchRecordings();
  }, []);

  // Hydrate hide-reviewed preference from localStorage on mount.
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
        window.localStorage.setItem(
          'teacher-submissions.hide-reviewed',
          next ? 'on' : 'off',
        );
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

      if (!response.ok) {
        throw new Error('Failed to fetch recordings');
      }

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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teacherFeedback: finalFeedback,
          status: 'reviewed',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }

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

    } catch (error) {
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
      const response = await fetch(`/api/recordings/${recordingId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete recording');
      }

      await fetchRecordings();
    } catch (error) {
      console.error('Error deleting recording:', error);
      alert('Failed to delete recording. Please try again.');
    }
  };

  const deleteAllClassRecordings = async (classId: string, className: string) => {
    const confirmed = confirm(`Are you sure you want to delete ALL recordings from class "${className}"? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/recordings?classId=${classId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete recordings');
      }

      await fetchRecordings();
      alert(`All recordings from class "${className}" have been deleted`);
    } catch (error) {
      console.error('Error deleting class recordings:', error);
      alert('Failed to delete recordings. Please try again.');
    }
  };

  // Build one group per (assignment × student), keeping all attempts together.
  // A group is included if ANY of its attempts matches the active filter.
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
      const matchesFilter =
        filter === 'all' || group.attempts.some(a => a.status === filter);
      if (!matchesFilter) continue;
      // Hide-reviewed: skip groups whose every attempt is reviewed
      // already. Bypassed when the active filter is 'reviewed' so
      // the teacher can still explicitly browse them.
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

    // Group by class
    const byClass: Record<string, { className: string; classId: string; groups: AttemptGroup[] }> = {};
    for (const g of filteredGroups) {
      if (!byClass[g.classId]) {
        byClass[g.classId] = { className: g.className, classId: g.classId, groups: [] };
      }
      byClass[g.classId].groups.push(g);
    }
    // Sort groups within each class by latest submission desc
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

  const FILTERS: { key: FilterKey; label: string; count: number; dot: string | null }[] = [
    { key: 'all', label: 'All', count: recordings.length, dot: null },
    { key: 'pending', label: 'Pending', count: pendingCount, dot: 'bg-amber-500' },
    { key: 'reviewed', label: 'Reviewed', count: reviewedCount, dot: 'bg-emerald-600' },
    { key: 'flagged', label: 'Flagged', count: flaggedCount, dot: 'bg-rose-600' },
  ];

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-white flex items-center justify-center">
        <div className="text-xs uppercase tracking-[0.22em] text-zinc-400">
          Loading submissions
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-white text-zinc-900">
      {/* MASTHEAD — editorial header. The back link is a quiet text
          link, not a button. The page title sits as a deliberately
          large display heading with a thin meta line below. */}
      <header className="max-w-[1320px] mx-auto px-6 md:px-10 pt-8 pb-10">
        <button
          type="button"
          onClick={() => router.push('/teacher/dashboard')}
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-900 transition-colors mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </button>
        <div className="flex items-end justify-between gap-6 flex-wrap border-b border-zinc-900 pb-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-2">
              Teacher · Submissions
            </div>
            <h1 className="text-4xl md:text-5xl tracking-tight leading-none text-zinc-950">
              Student readings
            </h1>
          </div>
          <p className="text-sm text-zinc-500 max-w-[42ch]">
            Review, score, and respond to recordings grouped by class.
          </p>
        </div>
      </header>

      <main className="max-w-[1320px] mx-auto px-6 md:px-10 pb-24">
        {/* FILTER STRIP — anti-card. Four cells separated by hairline
            verticals. Tap target is the cell. Active state is a thick
            bottom rule + zinc-950 text; inactive is muted. */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-zinc-200 mb-12">
          {FILTERS.map(({ key, label, count, dot }) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`group text-left px-5 py-4 first:pl-0 last:pr-0 border-b-2 transition-[border-color,background-color] duration-200 ${
                  active
                    ? 'border-zinc-950'
                    : 'border-transparent hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {dot && (
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                  )}
                  <span
                    className={`text-[10px] uppercase tracking-[0.18em] ${
                      active ? 'text-zinc-900' : 'text-zinc-500'
                    }`}
                  >
                    {label}
                  </span>
                </div>
                <div
                  className={`font-mono tabular-nums text-3xl md:text-4xl leading-none ${
                    active ? 'text-zinc-950' : 'text-zinc-700'
                  }`}
                >
                  {count}
                </div>
              </button>
            );
          })}
        </div>

        {/* Hide-reviewed toggle — recast as a text-link affordance,
            not a checkbox row. Reads as a quiet utility setting. */}
        <div className="mb-8 flex items-center justify-end">
          <label
            className={`inline-flex items-center gap-2.5 text-[11px] uppercase tracking-[0.14em] select-none ${
              filter === 'reviewed'
                ? 'text-zinc-300 cursor-not-allowed'
                : 'text-zinc-600 cursor-pointer hover:text-zinc-900 transition-colors'
            }`}
          >
            <input
              type="checkbox"
              checked={hideReviewed}
              onChange={toggleHideReviewed}
              disabled={filter === 'reviewed'}
              className="h-3.5 w-3.5 rounded-[2px] border-zinc-400 accent-zinc-900"
            />
            Hide reviewed
          </label>
        </div>

        {error && (
          <div className="border-l-2 border-rose-500 pl-4 py-1 text-sm text-rose-800 mb-8">
            {error}
          </div>
        )}

        {Object.keys(groupsByClass).length === 0 ? (
          <div className="border-t border-zinc-200 pt-16 pb-20 text-center">
            <FileText className="w-10 h-10 mx-auto mb-5 text-zinc-300" strokeWidth={1.25} />
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-2">
              Empty
            </div>
            <h3 className="text-2xl tracking-tight text-zinc-900 mb-2">
              {filter === 'all' ? 'No submissions yet' : `No ${filter} submissions`}
            </h3>
            <p className="text-sm text-zinc-500 max-w-[42ch] mx-auto">
              {filter === 'all'
                ? 'Student submissions will appear here once they start completing assignments.'
                : `Nothing with the ${filter} status to show.`}
            </p>
          </div>
        ) : (
          <div className="space-y-16">
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
                  {/* CLASS SECTION DIVIDER — bold top rule like the
                      head of a print magazine section. Number on the
                      left, name center-left, meta right. The whole row
                      is the tap target. */}
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
                    className="group cursor-pointer select-none border-t-[3px] border-zinc-950 pt-5"
                    aria-expanded={expanded}
                  >
                    <div className="flex items-start justify-between gap-6 flex-wrap">
                      <div className="flex items-baseline gap-5 flex-wrap min-w-0">
                        <h2 className="text-3xl md:text-4xl tracking-tight leading-none text-zinc-950">
                          {className}
                        </h2>
                        <span className="font-mono tabular-nums text-xs text-zinc-500">
                          {groups.length} submission{groups.length !== 1 ? 's' : ''}
                        </span>
                        {pendingInClass > 0 && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-amber-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span className="font-mono tabular-nums">{pendingInClass}</span> pending
                          </span>
                        )}
                        {flaggedInClass > 0 && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-rose-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                            <span className="font-mono tabular-nums">{flaggedInClass}</span> flagged
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteAllClassRecordings(classId, className);
                          }}
                          className="text-[11px] uppercase tracking-[0.14em] text-zinc-400 hover:text-rose-700 transition-colors"
                        >
                          Delete all
                        </button>
                        <ChevronDown
                          className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${
                            expanded ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-8 space-y-12">
                      {groups.map((group) => {
                        const studentName = `${group.studentFirstName} ${group.studentLastName}`;
                        const visibleAttempts =
                          filter === 'all'
                            ? group.attempts
                            : group.attempts.filter(a => a.status === filter);
                        return (
                          <article key={group.key}>
                            {/* ASSIGNMENT MASTHEAD — student / title /
                                meta in a quiet grid. The student name
                                acts as the primary line, the
                                assignment as a smaller subtitle. */}
                            <header className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mb-5 pb-4 border-b border-zinc-200">
                              <div className="min-w-0">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1.5">
                                  {studentName}
                                </div>
                                <h3 className="text-xl tracking-tight text-zinc-900 leading-tight">
                                  {group.assignmentTitle}
                                </h3>
                              </div>
                              <div className="flex items-center gap-4 text-[11px] text-zinc-500 md:justify-end flex-wrap">
                                {group.recordingMode === 'ai_graded' && (
                                  <span className="inline-flex items-center gap-1.5 uppercase tracking-[0.14em]">
                                    <Sparkles className="w-3 h-3" />
                                    AI graded
                                  </span>
                                )}
                                <span className="uppercase tracking-[0.14em]">
                                  <span className="font-mono tabular-nums text-zinc-900">
                                    {group.attempts.length}
                                  </span>
                                  <span className="text-zinc-400">/</span>
                                  <span className="font-mono tabular-nums">{group.maxAttempts}</span>
                                  <span className="ml-1.5">attempts</span>
                                </span>
                                <span className="font-mono tabular-nums">
                                  {format(new Date(group.latestSubmittedAt), 'MMM d · h:mm a')}
                                </span>
                              </div>
                            </header>

                            <div>
                              {visibleAttempts.map((recording, idx) => {
                                const tone = STATUS_TONE[recording.status];
                                return (
                                  <div
                                    key={recording.id}
                                    className={`grid grid-cols-[3.5rem_1fr] gap-4 py-6 ${
                                      idx > 0 ? 'border-t border-zinc-200' : ''
                                    }`}
                                  >
                                    {/* MONUMENTAL ATTEMPT NUMERAL — sits
                                        as a column-1 marker like a print
                                        catalog entry. */}
                                    <div className="font-mono tabular-nums text-3xl text-zinc-300 leading-none pt-1">
                                      {String(recording.attemptNumber).padStart(2, '0')}
                                    </div>

                                    <div className="min-w-0 space-y-4">
                                      <div className="flex items-baseline justify-between gap-3 flex-wrap">
                                        <div className="flex items-baseline gap-5 flex-wrap">
                                          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em]">
                                            <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                                            <span className={tone.text}>{recording.status}</span>
                                          </span>
                                          {recording.letterGrade && (
                                            <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                                              Grade
                                              <span className="font-mono tabular-nums text-zinc-900 ml-1.5">
                                                {recording.letterGrade}
                                              </span>
                                            </span>
                                          )}
                                          {recording.accuracyScore !== null && (
                                            <span className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                                              <span className="font-mono tabular-nums text-zinc-900">
                                                {recording.accuracyScore}
                                              </span>
                                              %
                                            </span>
                                          )}
                                          <span className="font-mono tabular-nums text-[11px] text-zinc-500">
                                            {format(new Date(recording.submittedAt), 'MMM d · h:mm a')}
                                          </span>
                                          {recording.audioDurationSeconds && (
                                            <span className="font-mono tabular-nums text-[11px] text-zinc-500">
                                              {Math.floor(recording.audioDurationSeconds / 60)}:
                                              {(recording.audioDurationSeconds % 60).toString().padStart(2, '0')}
                                            </span>
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
                                          className="text-zinc-400 hover:text-rose-700 transition-colors p-1 -m-1"
                                          title={`Delete attempt #${recording.attemptNumber}`}
                                        >
                                          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
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
                                            if (downloadUrl) {
                                              window.open(downloadUrl, '_blank');
                                            } else {
                                              alert('Unable to generate download link. Please try again.');
                                            }
                                          }}
                                          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-zinc-600 hover:text-zinc-950 transition-colors"
                                          title="Download recording"
                                        >
                                          <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                                          Download
                                        </button>
                                        <div className="flex gap-3">
                                          {feedbackMode === recording.id ? (
                                            <>
                                              <Button
                                                size="sm"
                                                onClick={() => submitFeedback(recording.id)}
                                                disabled={submittingFeedback || !feedbackText.trim()}
                                                className="rounded-none uppercase tracking-[0.14em] text-[11px] font-medium bg-zinc-950 hover:bg-zinc-800"
                                              >
                                                {submittingFeedback ? 'Saving' : 'Save feedback'}
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={cancelFeedback}
                                                disabled={submittingFeedback}
                                                className="rounded-none uppercase tracking-[0.14em] text-[11px] font-medium text-zinc-600 hover:bg-transparent hover:text-zinc-950"
                                              >
                                                Cancel
                                              </Button>
                                            </>
                                          ) : (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() =>
                                                startFeedback(
                                                  recording.id,
                                                  recording.teacherFeedback || '',
                                                )
                                              }
                                              className="rounded-none border-zinc-300 uppercase tracking-[0.14em] text-[11px] font-medium hover:bg-zinc-950 hover:text-white hover:border-zinc-950 transition-colors"
                                            >
                                              {recording.teacherFeedback ? 'Edit feedback' : 'Add feedback'}
                                            </Button>
                                          )}
                                        </div>
                                      </div>

                                      {recording.recordingMode === 'ai_graded' && (
                                        <AIAnalysisPanel
                                          recordingId={recording.id}
                                          letterGrade={recording.letterGrade}
                                          accuracyScore={
                                            recording.accuracyScore !== null
                                              ? Number(recording.accuracyScore)
                                              : null
                                          }
                                          wpmScore={
                                            recording.wpmScore !== null
                                              ? Number(recording.wpmScore)
                                              : null
                                          }
                                          wcpm={
                                            recording.wcpm !== null ? Number(recording.wcpm) : null
                                          }
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
                                      )}

                                      {feedbackMode === recording.id && (
                                        <div className="border-t border-zinc-200 pt-5 space-y-5">
                                          <div>
                                            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-3">
                                              Quick rating
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                              {QUICK_RATINGS.map((rating) => {
                                                const isSelected = selectedRating === rating.emoji;
                                                return (
                                                  <button
                                                    key={rating.emoji}
                                                    type="button"
                                                    onClick={() => selectRating(rating)}
                                                    disabled={submittingFeedback}
                                                    className={`inline-flex items-center gap-2 px-3 py-2 border text-[11px] uppercase tracking-[0.14em] font-medium transition-colors ${
                                                      isSelected
                                                        ? 'border-zinc-950 bg-zinc-950 text-white'
                                                        : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-950'
                                                    }`}
                                                  >
                                                    <span className="text-base leading-none">{rating.emoji}</span>
                                                    {rating.label}
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          </div>
                                          <div>
                                            <label
                                              htmlFor={`feedback-${recording.id}`}
                                              className="block text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2"
                                            >
                                              Message
                                              <span className="text-zinc-400 ml-1.5 normal-case tracking-normal">
                                                — edit, or write your own
                                              </span>
                                            </label>
                                            <Textarea
                                              id={`feedback-${recording.id}`}
                                              value={feedbackText}
                                              onChange={(e) => setFeedbackText(e.target.value)}
                                              placeholder="Pick a rating or type your own feedback…"
                                              rows={3}
                                              disabled={submittingFeedback}
                                              className="w-full rounded-none border-zinc-300 focus-visible:border-zinc-950 focus-visible:ring-0"
                                            />
                                          </div>
                                          <TeacherReplyRecorder
                                            recordingId={recording.id}
                                            initialAudioUrl={recording.teacherReplyAudioUrl}
                                            initialDurationSeconds={recording.teacherReplyDurationSeconds}
                                            onChange={fetchRecordings}
                                            disabled={submittingFeedback}
                                          />
                                          <p className="text-[11px] text-zinc-500">
                                            Applies to attempt #{recording.attemptNumber}; marks it reviewed.
                                          </p>
                                        </div>
                                      )}

                                      {recording.teacherFeedback && feedbackMode !== recording.id && (
                                        <div className="border-l-2 border-zinc-900 pl-5 py-1">
                                          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1.5">
                                            Feedback · Attempt {recording.attemptNumber}
                                          </div>
                                          <p className="text-sm text-zinc-900 leading-relaxed max-w-[60ch]">
                                            {recording.teacherFeedback}
                                          </p>
                                        </div>
                                      )}
                                    </div>
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
      </main>
    </div>
  );
}
