"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, Pause, Volume2, FileText, Calendar, User, Clock, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

interface Recording {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
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
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed' | 'flagged'>('all');

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

  const playAudio = (audioUrl: string, recordingId: string) => {
    if (playingAudio === recordingId) {
      setPlayingAudio(null);
      // Stop audio if playing
      const audio = document.getElementById(`audio-${recordingId}`) as HTMLAudioElement;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    } else {
      setPlayingAudio(recordingId);
      // Play audio
      const audio = document.getElementById(`audio-${recordingId}`) as HTMLAudioElement;
      if (audio) {
        audio.play();
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'reviewed': return 'bg-green-100 text-green-800';
      case 'flagged': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredRecordings = recordings.filter(recording => {
    if (filter === 'all') return true;
    return recording.status === filter;
  });

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

        {filteredRecordings.length === 0 ? (
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
          <div className="space-y-4">
            {filteredRecordings.map((recording) => (
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
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => playAudio(recording.audioUrl, recording.id)}
                      >
                        {playingAudio === recording.id ? (
                          <Pause className="w-4 h-4 mr-1" />
                        ) : (
                          <Play className="w-4 h-4 mr-1" />
                        )}
                        {playingAudio === recording.id ? 'Pause' : 'Play'} Recording
                      </Button>

                      <audio
                        id={`audio-${recording.id}`}
                        src={recording.audioUrl}
                        onEnded={() => setPlayingAudio(null)}
                        onPause={() => setPlayingAudio(null)}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/teacher/submissions/${recording.id}`)}
                      >
                        Review
                      </Button>
                      {recording.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => router.push(`/teacher/submissions/${recording.id}?action=review`)}
                        >
                          Provide Feedback
                        </Button>
                      )}
                    </div>
                  </div>

                  {recording.teacherFeedback && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <h4 className="font-medium text-blue-800 mb-1">Your Feedback:</h4>
                      <p className="text-blue-700 text-sm">{recording.teacherFeedback}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}