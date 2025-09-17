'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AudioRecorder } from '@/components/audio/audio-recorder';
import { Progress } from '@/components/ui/progress';
import { 
  BookOpen, 
  Volume2, 
  Clock, 
  Target, 
  ArrowLeft,
  User,
  Calendar,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  maxAttempts: number;
  instructions: string | null;
  story: {
    id: string;
    title: string;
    content: string;
    readingLevel: string | null;
    wordCount: number | null;
    ttsAudioUrl: string | null;
    ttsAudioDurationSeconds: number | null;
    author: string | null;
    genre: string | null;
  };
};

type StudentProgress = {
  completedAttempts: number;
  maxAttempts: number;
  bestScore: number | null;
  hasCompletedRecording: boolean;
  canAttempt: boolean;
  recordings: Array<{
    id: string;
    attemptNumber: number;
    audioUrl: string | null;
    transcription: string | null;
    score: number | null;
    feedback: string | null;
    createdAt: string;
    status: string;
  }>;
};

type AssignmentData = {
  success: boolean;
  assignment: Assignment;
  studentProgress: StudentProgress;
};

export default function AssignmentPracticePage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params.id as string;
  
  const [assignmentData, setAssignmentData] = useState<AssignmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);

  useEffect(() => {
    fetchAssignmentData();
  }, [assignmentId]);

  const fetchAssignmentData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/assignments/${assignmentId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch assignment data');
      }
      
      const data = await response.json();
      setAssignmentData(data);
    } catch (error) {
      console.error('Error fetching assignment:', error);
      setError('Failed to load assignment data');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayTTS = () => {
    const { assignment } = assignmentData!;
    if (assignment.story.ttsAudioUrl && !isPlayingTTS) {
      setIsPlayingTTS(true);
      const audio = new Audio(assignment.story.ttsAudioUrl);
      audio.play();
      audio.onended = () => setIsPlayingTTS(false);
      audio.onerror = () => {
        setIsPlayingTTS(false);
        console.error('Error playing TTS audio');
      };
    }
  };

  const handleRecordingComplete = (result: { success: boolean; publicUrl?: string; key?: string; error?: string }) => {
    if (result.success) {
      // Refresh assignment data to get updated progress
      fetchAssignmentData();
    }
  };

  const formatDueDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Due today';
    if (diffInDays === 1) return 'Due tomorrow';
    if (diffInDays > 0) return `Due in ${diffInDays} days`;
    return 'Overdue';
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="h-96 bg-gray-200 rounded"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !assignmentData) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="border-red-200">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Assignment</h2>
            <p className="text-red-600 mb-4">{error || 'Failed to load assignment'}</p>
            <Button onClick={() => router.push('/student2.0/dashboard')} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { assignment, studentProgress } = assignmentData;
  const progressPercentage = (studentProgress.completedAttempts / studentProgress.maxAttempts) * 100;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Button 
          onClick={() => router.push('/student2.0/dashboard')} 
          variant="ghost" 
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
        
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{assignment.title}</h1>
            {assignment.description && (
              <p className="text-gray-600 mb-4">{assignment.description}</p>
            )}
            
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <BookOpen className="w-4 h-4" />
                <span>{assignment.story.title}</span>
              </div>
              {assignment.story.author && (
                <div className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  <span>{assignment.story.author}</span>
                </div>
              )}
              {assignment.dueAt && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDueDate(assignment.dueAt)}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {assignment.story.readingLevel && (
              <Badge variant="outline">{assignment.story.readingLevel}</Badge>
            )}
            {assignment.story.genre && (
              <Badge variant="secondary">{assignment.story.genre}</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Progress Overview */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Your Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {studentProgress.completedAttempts}
              </div>
              <div className="text-sm text-gray-500">Attempts Made</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {studentProgress.bestScore || 0}%
              </div>
              <div className="text-sm text-gray-500">Best Score</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {studentProgress.maxAttempts - studentProgress.completedAttempts}
              </div>
              <div className="text-sm text-gray-500">Attempts Left</div>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{studentProgress.completedAttempts} of {studentProgress.maxAttempts} attempts</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>
          
          {!studentProgress.canAttempt && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              <span className="text-sm text-yellow-800">
                You have used all your attempts for this assignment.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Story Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Story: {assignment.story.title}
            </CardTitle>
            <CardDescription>
              {assignment.story.wordCount && (
                <span>{assignment.story.wordCount} words</span>
              )}
              {assignment.story.ttsAudioDurationSeconds && (
                <span className="ml-2">• {formatDuration(assignment.story.ttsAudioDurationSeconds)}</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {assignment.story.ttsAudioUrl && (
              <Button 
                onClick={handlePlayTTS} 
                disabled={isPlayingTTS}
                className="w-full"
              >
                <Volume2 className="w-4 h-4 mr-2" />
                {isPlayingTTS ? 'Playing...' : 'Listen to Story'}
              </Button>
            )}
            
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-lg leading-relaxed">
                {assignment.story.content}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recording Interface */}
        <div className="space-y-6">
          {assignment.instructions && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700">{assignment.instructions}</p>
              </CardContent>
            </Card>
          )}
          
          <div className="flex justify-center">
            <AudioRecorder
              onRecordingComplete={handleRecordingComplete}
              maxDurationSeconds={300}
              disabled={!studentProgress.canAttempt}
              assignmentId={assignmentId}
            />
          </div>
          
          {studentProgress.hasCompletedRecording && (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-green-800">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">Assignment Completed!</span>
                </div>
                <p className="text-sm text-green-700 mt-1">
                  You have successfully submitted a recording for this assignment.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      
      {/* Previous Attempts */}
      {studentProgress.recordings.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Previous Attempts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {studentProgress.recordings.map((recording) => (
                <div key={recording.id} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Attempt #{recording.attemptNumber}</span>
                    <div className="flex items-center gap-2">
                      {recording.score && (
                        <Badge variant="default">{recording.score}%</Badge>
                      )}
                      <Badge variant={recording.status === 'completed' ? 'default' : 'secondary'}>
                        {recording.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    {new Date(recording.createdAt).toLocaleDateString()}
                  </div>
                  {recording.feedback && (
                    <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
                      <strong>Feedback:</strong> {recording.feedback}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}