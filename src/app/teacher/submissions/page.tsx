"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Volume2, FileText, Calendar, ChevronDown, ChevronUp, User, Clock, Star, Trash2, Users, Sparkles } from "lucide-react";
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

export default function TeacherSubmissionsPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed' | 'flagged'>('all');
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'reviewed': return 'bg-green-100 text-green-800';
      case 'flagged': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading submissions...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => router.push('/teacher/dashboard')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Student Submissions</h1>
                <p className="text-gray-600 mt-1">
                  Review and provide feedback on student recordings
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card
            className={`cursor-pointer transition-colors ${filter === 'all' ? 'ring-2 ring-blue-500' : 'hover:bg-gray-50'}`}
            onClick={() => setFilter('all')}
          >
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{recordings.length}</div>
              <div className="text-sm text-gray-600">Total Submissions</div>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${filter === 'pending' ? 'ring-2 ring-yellow-500' : 'hover:bg-gray-50'}`}
            onClick={() => setFilter('pending')}
          >
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
              <div className="text-sm text-gray-600">Pending Review</div>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${filter === 'reviewed' ? 'ring-2 ring-green-500' : 'hover:bg-gray-50'}`}
            onClick={() => setFilter('reviewed')}
          >
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{reviewedCount}</div>
              <div className="text-sm text-gray-600">Reviewed</div>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${filter === 'flagged' ? 'ring-2 ring-red-500' : 'hover:bg-gray-50'}`}
            onClick={() => setFilter('flagged')}
          >
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-red-600">{flaggedCount}</div>
              <div className="text-sm text-gray-600">Flagged</div>
            </CardContent>
          </Card>
        </div>

        {/* Hide-reviewed toggle. The data stays in the DB; this is a
            purely client-side filter so the teacher can declutter
            without losing history. Disabled (visually muted) when the
            active filter is 'reviewed' so the teacher doesn't get
            an empty page. */}
        <div className="mb-6 flex items-center justify-end">
          <label
            className={`inline-flex items-center gap-2 text-sm select-none ${
              filter === 'reviewed' ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 cursor-pointer'
            }`}
          >
            <input
              type="checkbox"
              checked={hideReviewed}
              onChange={toggleHideReviewed}
              disabled={filter === 'reviewed'}
              className="h-4 w-4 rounded border-gray-300"
            />
            Hide reviewed submissions
            <span className="text-xs text-gray-400">
              (kept in records, just hidden here)
            </span>
          </label>
        </div>

        {error && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="text-red-600">{error}</div>
            </CardContent>
          </Card>
        )}

        {Object.keys(groupsByClass).length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">
                {filter === 'all' ? 'No submissions yet' : `No ${filter} submissions`}
              </h3>
              <p className="text-gray-600">
                {filter === 'all'
                  ? 'Student submissions will appear here once they start completing assignments.'
                  : `No submissions with ${filter} status found.`
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
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
              <div key={classId} className="space-y-4">
                {/* Clickable class header — toggles the per-class
                    body. The Delete button stops propagation so the
                    teacher can't accidentally fire the destroy
                    action while expanding the class. */}
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
                  className="flex items-center justify-between bg-white p-4 rounded-lg border shadow-sm cursor-pointer select-none hover:bg-gray-50"
                  aria-expanded={expanded}
                >
                  <div className="flex items-center gap-3">
                    {expanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    )}
                    <Users className="w-5 h-5 text-blue-600" />
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">{className}</h2>
                      <p className="text-sm text-gray-600 flex items-center gap-2 flex-wrap">
                        <span>
                          {groups.length} student submission{groups.length !== 1 ? 's' : ''}
                        </span>
                        {pendingInClass > 0 && (
                          <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-800 border-yellow-300">
                            {pendingInClass} pending
                          </Badge>
                        )}
                        {flaggedInClass > 0 && (
                          <Badge variant="outline" className="text-xs bg-red-50 text-red-800 border-red-300">
                            {flaggedInClass} flagged
                          </Badge>
                        )}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteAllClassRecordings(classId, className);
                    }}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete All from Class
                  </Button>
                </div>

                {expanded && (
                <div className="space-y-4 ml-4">
                  {groups.map((group) => {
                    const studentName = `${group.studentFirstName} ${group.studentLastName}`;
                    const visibleAttempts =
                      filter === 'all'
                        ? group.attempts
                        : group.attempts.filter(a => a.status === filter);
                    return (
                      <Card key={group.key} className="hover:shadow-md transition-shadow">
                        <CardHeader>
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2 flex-wrap">
                                <CardTitle className="text-lg">{group.assignmentTitle}</CardTitle>
                                {group.recordingMode === 'ai_graded' && (
                                  <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-300 flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" />
                                    AI-graded
                                  </Badge>
                                )}
                                <Badge variant="outline" className="font-medium">
                                  {group.attempts.length} of {group.maxAttempts} attempt{group.maxAttempts !== 1 ? 's' : ''} used
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                                <span className="flex items-center gap-1">
                                  <User className="w-4 h-4" />
                                  {studentName}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-4 h-4" />
                                  Latest: {format(new Date(group.latestSubmittedAt), 'MMM d, yyyy \'at\' h:mm a')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {visibleAttempts.map((recording, idx) => (
                            <div
                              key={recording.id}
                              className={`rounded-lg border bg-gray-50/40 p-4 space-y-3 ${
                                idx > 0 ? 'mt-2' : ''
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className="font-semibold">
                                    Attempt #{recording.attemptNumber}
                                  </Badge>
                                  <Badge className={getStatusColor(recording.status)}>
                                    {recording.status}
                                  </Badge>
                                  {recording.letterGrade && (
                                    <Badge variant="outline" className="font-semibold">
                                      Grade: {recording.letterGrade}
                                    </Badge>
                                  )}
                                  {recording.accuracyScore && (
                                    <Badge variant="outline" className="flex items-center gap-1">
                                      <Star className="w-3 h-3" />
                                      {recording.accuracyScore}%
                                    </Badge>
                                  )}
                                  <span className="flex items-center gap-1 text-xs text-gray-600">
                                    <Calendar className="w-3 h-3" />
                                    {format(new Date(recording.submittedAt), 'MMM d, h:mm a')}
                                  </span>
                                  {recording.audioDurationSeconds && (
                                    <span className="flex items-center gap-1 text-xs text-gray-600">
                                      <Volume2 className="w-3 h-3" />
                                      {Math.floor(recording.audioDurationSeconds / 60)}:{(recording.audioDurationSeconds % 60).toString().padStart(2, '0')}
                                    </span>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteRecording(recording.id, studentName, recording.attemptNumber)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  title={`Delete attempt #${recording.attemptNumber}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>

                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex-1 min-w-[280px]">
                                  <RecordingAudioPlayer
                                    recordingId={recording.id}
                                    fallbackDurationSeconds={recording.audioDurationSeconds}
                                  />
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    const downloadUrl = await fetchPresignedUrl(recording.id);
                                    if (downloadUrl) {
                                      window.open(downloadUrl, '_blank');
                                    } else {
                                      alert('Unable to generate download link. Please try again.');
                                    }
                                  }}
                                  title="Download recording"
                                >
                                  📥 Download
                                </Button>
                                <div className="flex gap-2">
                                  {feedbackMode === recording.id ? (
                                    <>
                                      <Button
                                        size="sm"
                                        onClick={() => submitFeedback(recording.id)}
                                        disabled={submittingFeedback || !feedbackText.trim()}
                                      >
                                        {submittingFeedback ? 'Saving...' : 'Save Feedback'}
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={cancelFeedback}
                                        disabled={submittingFeedback}
                                      >
                                        Cancel
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => startFeedback(recording.id, recording.teacherFeedback || '')}
                                    >
                                      {recording.teacherFeedback ? 'Edit Feedback' : 'Add Feedback'}
                                    </Button>
                                  )}
                                </div>
                              </div>

                              {recording.recordingMode === 'ai_graded' && (
                                <AIAnalysisPanel
                                  recordingId={recording.id}
                                  letterGrade={recording.letterGrade}
                                  accuracyScore={recording.accuracyScore !== null ? Number(recording.accuracyScore) : null}
                                  wpmScore={recording.wpmScore !== null ? Number(recording.wpmScore) : null}
                                  transcript={recording.transcript}
                                  analysisJson={recording.analysisJson as never}
                                  onReanalyzed={fetchRecordings}
                                />
                              )}

                              {feedbackMode === recording.id && (
                                <div className="p-4 bg-white border rounded-lg space-y-3">
                                  <label className="block text-sm font-medium text-gray-700">
                                    Quick Rating
                                  </label>
                                  <div className="flex gap-2 flex-wrap">
                                    {QUICK_RATINGS.map((rating) => (
                                      <button
                                        key={rating.emoji}
                                        type="button"
                                        onClick={() => selectRating(rating)}
                                        disabled={submittingFeedback}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                                          selectedRating === rating.emoji
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                                            : 'border-gray-200 bg-white hover:bg-gray-100 text-gray-700'
                                        }`}
                                      >
                                        <span className="text-lg">{rating.emoji}</span>
                                        {rating.label}
                                      </button>
                                    ))}
                                  </div>
                                  <div>
                                    <label htmlFor={`feedback-${recording.id}`} className="block text-sm font-medium text-gray-700 mb-1">
                                      Message <span className="font-normal text-gray-400">(edit or write your own)</span>
                                    </label>
                                    <Textarea
                                      id={`feedback-${recording.id}`}
                                      value={feedbackText}
                                      onChange={(e) => setFeedbackText(e.target.value)}
                                      placeholder="Pick a rating above or type your own feedback..."
                                      rows={3}
                                      disabled={submittingFeedback}
                                      className="w-full"
                                    />
                                  </div>
                                  <TeacherReplyRecorder
                                    recordingId={recording.id}
                                    initialAudioUrl={recording.teacherReplyAudioUrl}
                                    initialDurationSeconds={recording.teacherReplyDurationSeconds}
                                    onChange={fetchRecordings}
                                    disabled={submittingFeedback}
                                  />
                                  <p className="text-xs text-gray-500">
                                    This feedback applies to attempt #{recording.attemptNumber} and will mark it as reviewed.
                                  </p>
                                </div>
                              )}

                              {recording.teacherFeedback && feedbackMode !== recording.id && (
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                  <h4 className="font-medium text-blue-800 mb-1 text-sm">Feedback for Attempt #{recording.attemptNumber}:</h4>
                                  <p className="text-blue-700 text-sm">{recording.teacherFeedback}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
