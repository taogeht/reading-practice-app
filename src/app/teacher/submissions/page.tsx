"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Play, Pause, Volume2, FileText, Calendar, User, Clock, Star, AlertCircle, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

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
}

export default function TeacherSubmissionsPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [audioErrors, setAudioErrors] = useState<Set<string>>(new Set());
  const [presignedUrls, setPresignedUrls] = useState<Map<string, string>>(new Map());
  const [loadingAudio, setLoadingAudio] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed' | 'flagged'>('all');
  const [feedbackMode, setFeedbackMode] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [submittingFeedback, setSubmittingFeedback] = useState<boolean>(false);

  useEffect(() => {
    fetchRecordings();
  }, []);

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

  const getPresignedUrl = async (recordingId: string): Promise<string | null> => {
    try {
      setLoadingAudio(prev => new Set([...prev, recordingId]));

      const response = await fetch(`/api/recordings/${recordingId}/download-url`);
      if (!response.ok) {
        throw new Error('Failed to get download URL');
      }

      const { downloadUrl } = await response.json();
      setPresignedUrls(prev => new Map(prev).set(recordingId, downloadUrl));
      return downloadUrl;
    } catch (error) {
      setAudioErrors(prev => new Set([...prev, recordingId]));
      return null;
    } finally {
      setLoadingAudio(prev => {
        const newSet = new Set(prev);
        newSet.delete(recordingId);
        return newSet;
      });
    }
  };

  const playAudio = async (recordingId: string) => {
    if (playingAudio === recordingId) {
      // Pause current audio
      const audio = document.getElementById(`audio-${recordingId}`) as HTMLAudioElement;
      if (audio) {
        audio.pause();
      }
      setPlayingAudio(null);
      return;
    }

    // Stop any currently playing audio
    if (playingAudio) {
      const currentAudio = document.getElementById(`audio-${playingAudio}`) as HTMLAudioElement;
      if (currentAudio) {
        currentAudio.pause();
      }
    }

    let audioUrl = presignedUrls.get(recordingId);

    if (!audioUrl) {
      audioUrl = await getPresignedUrl(recordingId);
      if (!audioUrl) {
        alert('Unable to load recording. Please try again.');
        return;
      }
    }

    // Get the audio element and update its source
    const audio = document.getElementById(`audio-${recordingId}`) as HTMLAudioElement;
    if (audio) {
      setPlayingAudio(recordingId);

      // Update audio source with presigned URL
      const sources = audio.querySelectorAll('source');
      sources.forEach(source => {
        source.src = audioUrl;
      });

      audio.load(); // Reload the audio element with new source

      try {
        await audio.play();
      } catch (error) {
        setPlayingAudio(null);
        setAudioErrors(prev => new Set([...prev, recordingId]));
      }
    }
  };

  const submitFeedback = async (recordingId: string) => {
    if (!feedbackText.trim()) {
      alert('Please enter feedback before submitting.');
      return;
    }

    try {
      setSubmittingFeedback(true);

      const response = await fetch(`/api/recordings/${recordingId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teacherFeedback: feedbackText.trim(),
          status: 'reviewed',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }

      // Update the recording in local state
      setRecordings(prev =>
        prev.map(recording =>
          recording.id === recordingId
            ? { ...recording, teacherFeedback: feedbackText.trim(), status: 'reviewed' as const }
            : recording
        )
      );

      // Reset feedback form
      setFeedbackMode(null);
      setFeedbackText('');

    } catch (error) {
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const startFeedback = (recordingId: string, existingFeedback?: string) => {
    setFeedbackMode(recordingId);
    setFeedbackText(existingFeedback || '');
  };

  const cancelFeedback = () => {
    setFeedbackMode(null);
    setFeedbackText('');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'reviewed': return 'bg-green-100 text-green-800';
      case 'flagged': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const deleteRecording = async (recordingId: string, studentName: string) => {
    const confirmed = confirm(`Are you sure you want to delete the recording by ${studentName}? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/recordings/${recordingId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete recording');
      }

      // Refresh recordings list
      await fetchRecordings();
      alert('Recording deleted successfully');
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

      // Refresh recordings list
      await fetchRecordings();
      alert(`All recordings from class "${className}" have been deleted`);
    } catch (error) {
      console.error('Error deleting class recordings:', error);
      alert('Failed to delete recordings. Please try again.');
    }
  };

  const filteredRecordings = recordings.filter(recording => {
    if (filter === 'all') return true;
    return recording.status === filter;
  });

  // Group recordings by class
  const recordingsByClass = filteredRecordings.reduce((acc, recording) => {
    const classKey = recording.classId;
    if (!acc[classKey]) {
      acc[classKey] = {
        className: recording.className,
        classId: recording.classId,
        recordings: []
      };
    }
    acc[classKey].recordings.push(recording);
    return acc;
  }, {} as Record<string, { className: string; classId: string; recordings: Recording[] }>);

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
      {/* Header */}
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
        {/* Stats Cards */}
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

        {error && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="text-red-600">{error}</div>
            </CardContent>
          </Card>
        )}

        {Object.keys(recordingsByClass).length === 0 ? (
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
            {Object.values(recordingsByClass).map(({ className, classId, recordings }) => (
              <div key={classId} className="space-y-4">
                {/* Class Header */}
                <div className="flex items-center justify-between bg-white p-4 rounded-lg border shadow-sm">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-blue-600" />
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">{className}</h2>
                      <p className="text-sm text-gray-600">
                        {recordings.length} submission{recordings.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteAllClassRecordings(classId, className)}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete All from Class
                  </Button>
                </div>

                {/* Class Recordings */}
                <div className="space-y-4 ml-4">
                  {recordings.map((recording) => (
                    <Card key={recording.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <CardTitle className="text-lg">{recording.assignmentTitle}</CardTitle>
                              <Badge className={getStatusColor(recording.status)}>
                                {recording.status}
                              </Badge>
                              {recording.accuracyScore && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                  <Star className="w-3 h-3" />
                                  {recording.accuracyScore}%
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-600">
                              <span className="flex items-center gap-1">
                                <User className="w-4 h-4" />
                                {recording.studentFirstName} {recording.studentLastName}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {format(new Date(recording.submittedAt), 'MMM d, yyyy \'at\' h:mm a')}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                Attempt #{recording.attemptNumber}
                              </span>
                              {recording.audioDurationSeconds && (
                                <span className="flex items-center gap-1">
                                  <Volume2 className="w-4 h-4" />
                                  {Math.floor(recording.audioDurationSeconds / 60)}:{(recording.audioDurationSeconds % 60).toString().padStart(2, '0')}
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteRecording(recording.id, `${recording.studentFirstName} ${recording.studentLastName}`)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => playAudio(recording.id)}
                              disabled={loadingAudio.has(recording.id)}
                            >
                              {playingAudio === recording.id ? (
                                <Pause className="w-4 h-4 mr-1" />
                              ) : loadingAudio.has(recording.id) ? (
                                <div className="w-4 h-4 mr-1 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></div>
                              ) : (
                                <Play className="w-4 h-4 mr-1" />
                              )}
                              {loadingAudio.has(recording.id) ? 'Loading...' :
                               playingAudio === recording.id ? 'Pause' : 'Listen to Recording'}
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                let downloadUrl = presignedUrls.get(recording.id);
                                if (!downloadUrl) {
                                  downloadUrl = await getPresignedUrl(recording.id);
                                }
                                if (downloadUrl) {
                                  window.open(downloadUrl, '_blank');
                                } else {
                                  alert('Unable to generate download link. Please try again.');
                                }
                              }}
                              title="Download recording"
                              disabled={loadingAudio.has(recording.id)}
                            >
                              📥 Download
                            </Button>

                            <audio
                              id={`audio-${recording.id}`}
                              onEnded={() => setPlayingAudio(null)}
                              onPause={() => setPlayingAudio(null)}
                              onError={() => {
                                setPlayingAudio(null);
                                setAudioErrors(prev => new Set([...prev, recording.id]));
                              }}
                              onLoadedData={() => {
                                // Audio loaded successfully
                              }}
                              onLoadStart={() => {
                                // Audio loading started
                              }}
                              preload="none"
                              controls={false}
                              style={{ display: 'none' }}
                            >
                              <source type="audio/webm; codecs=opus" />
                              <source type="audio/webm" />
                              <source type="audio/mp4" />
                              <source type="audio/mpeg" />
                              Your browser does not support the audio element.
                            </audio>
                          </div>

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
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => startFeedback(recording.id, recording.teacherFeedback || '')}
                                >
                                  {recording.teacherFeedback ? 'Edit Feedback' : 'Add Feedback'}
                                </Button>
                                {recording.status === 'pending' && (
                                  <Button
                                    size="sm"
                                    onClick={() => startFeedback(recording.id, recording.teacherFeedback || '')}
                                  >
                                    Provide Feedback
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {feedbackMode === recording.id && (
                          <div className="mt-4 p-4 bg-gray-50 border rounded-lg">
                            <label htmlFor={`feedback-${recording.id}`} className="block text-sm font-medium text-gray-700 mb-2">
                              Teacher Feedback
                            </label>
                            <Textarea
                              id={`feedback-${recording.id}`}
                              value={feedbackText}
                              onChange={(e) => setFeedbackText(e.target.value)}
                              placeholder="Enter your feedback for this recording..."
                              rows={4}
                              disabled={submittingFeedback}
                              className="w-full"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              This feedback will be visible to the student and will mark the recording as reviewed.
                            </p>
                          </div>
                        )}

                        {recording.teacherFeedback && feedbackMode !== recording.id && (
                          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <h4 className="font-medium text-blue-800 mb-1">Your Feedback:</h4>
                            <p className="text-blue-700 text-sm">{recording.teacherFeedback}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}