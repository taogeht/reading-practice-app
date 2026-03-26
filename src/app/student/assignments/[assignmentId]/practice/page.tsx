"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AudioRecorder } from "@/components/audio/audio-recorder";
import { ArrowLeft, Volume2, Mic, Square, Upload, CheckCircle, RotateCcw, BookOpen, StopCircle, FileText, Loader2, Eye, EyeOff } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { format } from "date-fns";

import type { StoryTtsAudio } from "@/types/story";

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
  ttsAudio: StoryTtsAudio[];
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

export default function AssignmentPracticePage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = params.assignmentId as string;

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [isPlayingStory, setIsPlayingStory] = useState(false);
  const [recordingResult, setRecordingResult] = useState<any>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [storyAudio, setStoryAudio] = useState<HTMLAudioElement | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    if (assignmentId) {
      fetchAssignment();
    }
  }, [assignmentId]);

  useEffect(() => {
    return () => {
      if (storyAudio) {
        storyAudio.pause();
        storyAudio.currentTime = 0;
      }
    };
  }, [storyAudio]);

  useEffect(() => {
    if (!assignment?.story.ttsAudio?.length) {
      setSelectedVoiceId(null);
      return;
    }

    const firstVoiceId = assignment.story.ttsAudio[0]?.id ?? null;
    if (!selectedVoiceId || !assignment.story.ttsAudio.some((entry) => entry.id === selectedVoiceId)) {
      setSelectedVoiceId(firstVoiceId);
    }
  }, [assignment, selectedVoiceId]);

  const fetchAssignment = async () => {
    try {
      const response = await fetch(`/api/student/assignments/${assignmentId}`);

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

  const currentVoice = assignment?.story.ttsAudio.find((entry) => entry.id === selectedVoiceId)
    ?? assignment?.story.ttsAudio[0];

  const handlePlayStory = () => {
    if (!currentVoice?.url) return;

    if (isPlayingStory && storyAudio) {
      storyAudio.pause();
      storyAudio.currentTime = 0;
      setIsPlayingStory(false);
      setStoryAudio(null);
    } else {
      const audio = new Audio(currentVoice.url);
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

    // Trigger transcription after successful upload
    if (result.success && result.key) {
      setIsTranscribing(true);
      try {
        const response = await fetch(`/api/recordings/${result.key}/transcribe`, {
          method: 'POST',
        });
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.transcript) {
            setTranscript(data.transcript);
          }
        }
      } catch (error) {
        console.error('Transcription error:', error);
      } finally {
        setIsTranscribing(false);
      }
    }
  };

  const handleStartOver = () => {
    setIsRecording(false);
    setHasRecording(false);
    setRecordingResult(null);
    setAudioBlob(null);
    setTranscript(null);
    setIsTranscribing(false);
    setShowTranscript(false);
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
          <div className="max-w-6xl mx-auto px-4 py-4">
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

        <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
          {/* Success message */}
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-8 text-center">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-600" />
              <h2 className="text-2xl font-bold mb-2 text-green-800">
                Great Job! 🎉
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Your recording has been submitted! Your teacher will review it.
              </p>

              <div className="flex gap-4 justify-center flex-wrap">
                <Button onClick={handleBackToDashboard} size="lg">
                  Back to Dashboard
                </Button>
                <Button variant="outline" onClick={handleStartOver} size="lg">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Record Again
                </Button>
                {(transcript || isTranscribing) && (
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setShowTranscript(!showTranscript)}
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                  >
                    {showTranscript ? (
                      <><EyeOff className="w-4 h-4 mr-2" />Hide What I Said</>
                    ) : (
                      <><Eye className="w-4 h-4 mr-2" />See What I Said</>
                    )}
                  </Button>
                )}
                {isTranscribing && (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Listening to your recording...
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Side-by-side transcript view */}
          {showTranscript && (transcript || isTranscribing) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Original story text */}
              <Card className="border-2 border-blue-200">
                <CardHeader className="bg-blue-50 py-4">
                  <CardTitle className="text-lg flex items-center gap-2 text-blue-700">
                    <BookOpen className="w-5 h-5" />
                    The Story
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5">
                  <p className="text-base leading-relaxed whitespace-pre-wrap text-gray-800">
                    {assignment.story.content}
                  </p>
                </CardContent>
              </Card>

              {/* Student's transcript */}
              <Card className="border-2 border-purple-200">
                <CardHeader className="bg-purple-50 py-4">
                  <CardTitle className="text-lg flex items-center gap-2 text-purple-700">
                    <FileText className="w-5 h-5" />
                    What You Said
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5">
                  {isTranscribing ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                      <Loader2 className="w-8 h-8 animate-spin mb-3" />
                      <p className="text-sm">Turning your recording into text...</p>
                    </div>
                  ) : transcript ? (
                    <p className="text-base leading-relaxed whitespace-pre-wrap text-gray-800">
                      {transcript}
                    </p>
                  ) : (
                    <p className="text-gray-400 italic py-12 text-center">
                      No transcript available
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
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
            {assignment.story.ttsAudio.length > 0 && currentVoice ? (
              <div className="mb-6 space-y-3">
                {assignment.story.ttsAudio.length > 1 && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-sm font-semibold text-gray-600">Choose a voice</span>
                    <Select
                      value={currentVoice.id}
                      onValueChange={(value) => setSelectedVoiceId(value)}
                    >
                      <SelectTrigger className="sm:max-w-xs">
                        <SelectValue placeholder="Select a voice" />
                      </SelectTrigger>
                      <SelectContent>
                        {assignment.story.ttsAudio.map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.label ?? voice.voiceId ?? 'Voice option'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button
                  onClick={handlePlayStory}
                  size="lg"
                  className={`w-full h-16 text-xl ${isPlayingStory
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
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Voice:</span> {currentVoice.label ?? currentVoice.voiceId ?? 'Default'}
                  {currentVoice.durationSeconds && (
                    <span className="ml-2">
                      • {(currentVoice.durationSeconds / 60).toFixed(1)} min
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="mb-6 text-center text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg py-4">
                Audio will appear here once your teacher generates it.
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
