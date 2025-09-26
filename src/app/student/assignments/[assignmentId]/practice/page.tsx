"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AudioRecorder } from "@/components/audio/audio-recorder";
import { ArrowLeft, Volume2, Mic, Square, Upload, CheckCircle, RotateCcw, BookOpen, StopCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

interface Story {
  id: string;
  title: string;
  content: string;
  readingLevel?: string | null;
  gradeLevels: number[];
  wordCount?: number | null;
  estimatedReadingTimeMinutes?: number | null;
  author?: string | null;
  genre?: string | null;
  ttsAudioUrl?: string | null;
  ttsAudioDurationSeconds?: number | null;
  createdAt: string;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  story: Story;
  attempts: number;
  status: 'pending' | 'completed';
  teacherFeedback: string | null;
  reviewedAt: string | null;
  hasTeacherFeedback: boolean;
}

interface AssignmentPracticePageProps {
  params: {
    assignmentId: string;
  };
}

export default function AssignmentPracticePage({ params }: AssignmentPracticePageProps) {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [isPlayingStory, setIsPlayingStory] = useState(false);
  const [recordingResult, setRecordingResult] = useState<any>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [storyAudio, setStoryAudio] = useState<HTMLAudioElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchAssignment();
  }, [params.assignmentId]);

  useEffect(() => {
    return () => {
      if (storyAudio) {
        storyAudio.pause();
        storyAudio.currentTime = 0;
      }
    };
  }, [storyAudio]);

  const fetchAssignment = async () => {
    try {
      const response = await fetch(`/api/student/assignments/${params.assignmentId}`);

      if (!response.ok) {
        if (response.status === 404) {
          setAssignment(null);
          return;
        }
        throw new Error('Failed to fetch assignment');
      }

      const data = await response.json();
      setAssignment(data.assignment);
    } catch (error) {
      console.error('Error fetching assignment:', error);
      setAssignment(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToDashboard = () => {
    router.push('/student/dashboard');
  };

  const handlePlayStory = () => {
    if (!assignment?.story.ttsAudioUrl) return;

    if (isPlayingStory && storyAudio) {
      storyAudio.pause();
      storyAudio.currentTime = 0;
      setIsPlayingStory(false);
      setStoryAudio(null);
    } else {
      const audio = new Audio(assignment.story.ttsAudioUrl);
      setStoryAudio(audio);
      setIsPlayingStory(true);

      audio.play().catch(() => {
        setIsPlayingStory(false);
        setStoryAudio(null);
        console.error('Error playing TTS audio');
      });

      audio.onended = () => {
        setIsPlayingStory(false);
        setStoryAudio(null);
      };

      audio.onerror = () => {
        setIsPlayingStory(false);
        setStoryAudio(null);
        console.error('Error playing TTS audio');
      };
    }
  };

  const handleRecordingComplete = async (result: any) => {
    setRecordingResult(result);
  };

  const handleStartOver = () => {
    setIsRecording(false);
    setHasRecording(false);
    setRecordingResult(null);
    setAudioBlob(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-xl">Loading your assignment...</p>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-gray-600 mb-4 text-xl">Assignment not found</p>
            <Button onClick={handleBackToDashboard} size="lg">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (recordingResult?.success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-emerald-100">
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="sm" onClick={handleBackToDashboard}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="flex-1">
                <h1 className="text-2xl font-bold">{assignment.title}</h1>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-8">
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-12 text-center">
              <CheckCircle className="w-24 h-24 mx-auto mb-6 text-green-600" />
              <h2 className="text-3xl font-bold mb-4 text-green-800">
                Great Job! 🎉
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                You've successfully submitted your recording! Your teacher will review it and provide feedback.
              </p>

              <div className="space-y-4">
                <Button onClick={handleBackToDashboard} className="w-full" size="lg">
                  Back to Dashboard
                </Button>
                <Button
                  variant="outline"
                  onClick={handleStartOver}
                  className="w-full"
                  size="lg"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Record Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={handleBackToDashboard}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{assignment.title}</h1>
              <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                <span className="flex items-center gap-1">
                  <BookOpen className="w-4 h-4" />
                  {assignment.story.title}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <Card className="border-2 border-blue-200">
          <CardHeader className="bg-blue-50">
            <CardTitle className="text-2xl flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-blue-600" />
              {assignment.story.title}
            </CardTitle>
            {assignment.story.author && (
              <p className="text-lg text-gray-600">by {assignment.story.author}</p>
            )}
          </CardHeader>
          <CardContent className="p-6">
            {assignment.story.ttsAudioUrl && (
              <div className="mb-6">
                <Button
                  onClick={handlePlayStory}
                  size="lg"
                  className={`w-full h-16 text-xl ${
                    isPlayingStory
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isPlayingStory ? (
                    <>
                      <StopCircle className="w-8 h-8 mr-3" />
                      Stop Story
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-8 h-8 mr-3" />
                      Listen to Story
                    </>
                  )}
                </Button>
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-6">
              <div className="prose prose-lg max-w-none">
                <p className="text-lg leading-relaxed whitespace-pre-wrap">
                  {assignment.story.content}
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              {assignment.story.readingLevel && (
                <Badge variant="outline" className="text-sm">
                  Level: {assignment.story.readingLevel}
                </Badge>
              )}
              {assignment.story.wordCount && (
                <Badge variant="outline" className="text-sm">
                  {assignment.story.wordCount} words
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {assignment.instructions && (
          <Card className="border-2 border-yellow-200">
            <CardHeader className="bg-yellow-50">
              <CardTitle className="text-xl text-yellow-800">
                Instructions from Your Teacher
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-lg text-yellow-900 whitespace-pre-wrap">
                {assignment.instructions}
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="border-2 border-green-200">
          <CardHeader className="bg-green-50">
            <CardTitle className="text-2xl flex items-center gap-3">
              <Mic className="w-8 h-8 text-green-600" />
              Record Your Reading
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="text-center">
              <AudioRecorder
                onRecordingComplete={handleRecordingComplete}
                maxDurationSeconds={300}
                showLivePreview={true}
                disabled={false}
                assignmentId={assignment.id}
              />

              {recordingResult && !recordingResult.success && (
                <div className="mt-8 p-6 bg-red-50 border border-red-200 rounded-lg">
                  <div className="text-red-800 text-lg">
                    ❌ {recordingResult.error || 'There was an error with your recording. Please try again.'}
                  </div>
                  <Button onClick={handleStartOver} className="mt-4" size="lg">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Try Again
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
