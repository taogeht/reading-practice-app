"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StoryCard } from "@/components/stories/story-card";
import { AudioRecorder } from "@/components/audio/audio-recorder";
import { ArrowLeft, Play, Mic, CheckCircle, RotateCcw, BookOpen, Calendar, FileText } from "lucide-react";
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
  dueAt: string | null;
  maxAttempts: number;
  story: Story;
  attempts: number;
  status: 'pending' | 'completed';
}

interface AssignmentPracticePageProps {
  params: {
    assignmentId: string;
  };
}

export default function AssignmentPracticePage({ params }: AssignmentPracticePageProps) {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<'instructions' | 'ready' | 'record' | 'complete'>('instructions');
  const [hasListened, setHasListened] = useState(false);
  const [recordingResult, setRecordingResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchAssignment();
  }, [params.assignmentId]);

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
      console.log('Assignment data:', data.assignment);
      console.log('Story TTS URL:', data.assignment?.story?.ttsAudioUrl);
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

  const handleStepChange = (newStep: typeof currentStep) => {
    setCurrentStep(newStep);
  };

  const handleRecordingComplete = async (result: any) => {
    if (result.success && assignment) {
      setSubmitting(true);
      try {
        // Submit the recording to the database
        const response = await fetch('/api/recordings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            assignmentId: assignment.id,
            storyId: assignment.story.id,
            audioUrl: result.publicUrl,
            audioDurationSeconds: null, // Could be calculated from recording
            fileSizeBytes: null, // Could be included from upload result
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to submit recording');
        }

        const submissionResult = await response.json();
        setRecordingResult({
          ...result,
          submission: submissionResult,
        });
        setCurrentStep('complete');
      } catch (error) {
        console.error('Error submitting recording:', error);
        setRecordingResult({
          success: false,
          error: 'Failed to submit recording. Please try again.',
        });
      } finally {
        setSubmitting(false);
      }
    } else {
      setRecordingResult(result);
    }
  };

  const handleStartOver = () => {
    setCurrentStep('instructions');
    setHasListened(false);
    setRecordingResult(null);
  };

  const formatDueDate = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return "Due today";
    if (diffInDays === 1) return "Due tomorrow";
    if (diffInDays > 0) return `Due in ${diffInDays} days`;
    return "Overdue";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your assignment...</p>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-gray-600 mb-4">Assignment not found</p>
            <Button onClick={handleBackToDashboard}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100">
      {/* Header */}
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
                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                  Step: {currentStep}
                </span>
                <span className="flex items-center gap-1">
                  <BookOpen className="w-4 h-4" />
                  {assignment.story.title}
                </span>
                {assignment.dueAt && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {formatDueDate(assignment.dueAt)}
                  </span>
                )}
                <span>
                  Attempt {assignment.attempts + 1} of {assignment.maxAttempts}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Progress Steps */}
        <Card className="mb-8">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-2 ${currentStep === 'instructions' || currentStep === 'ready' ? 'text-blue-600 font-medium' : 'text-green-600'}`}>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${
                  currentStep === 'record' || currentStep === 'complete' ? 'bg-green-600 border-green-600 text-white' :
                  'border-blue-600'
                }`}>
                  {currentStep === 'record' || currentStep === 'complete' ? <CheckCircle className="w-3 h-3" /> : '1'}
                </div>
                <span className="hidden sm:inline">Read Instructions</span>
                <span className="sm:hidden">Read</span>
              </div>

              <div className="flex-1 h-0.5 bg-gray-200 mx-4">
                <div className={`h-full transition-all duration-300 ${
                  currentStep === 'record' || currentStep === 'complete' ? 'bg-green-600 w-full' :
                  currentStep === 'ready' ? 'bg-blue-600 w-1/2' : 'bg-gray-200 w-0'
                }`}></div>
              </div>

              <div className={`flex items-center gap-2 ${
                currentStep === 'record' ? 'text-blue-600 font-medium' :
                currentStep === 'complete' ? 'text-green-600' : 'text-gray-400'
              }`}>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${
                  currentStep === 'complete' ? 'bg-green-600 border-green-600 text-white' :
                  currentStep === 'record' ? 'border-blue-600' : 'border-gray-300'
                }`}>
                  {currentStep === 'complete' ? <CheckCircle className="w-3 h-3" /> : '2'}
                </div>
                <span className="hidden sm:inline">Record Reading</span>
                <span className="sm:hidden">Record</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Assignment & Story */}
          <div>
            {/* Assignment Instructions */}
            {currentStep === 'instructions' && (
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    {assignment.instructions ? 'Instructions from Your Teacher' : 'Ready to Start'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {assignment.instructions && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <p className="text-blue-800 whitespace-pre-wrap">{assignment.instructions}</p>
                    </div>
                  )}
                  {!assignment.instructions && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <p className="text-blue-800">Listen to the story above if you'd like, then click below when you're ready to record your reading.</p>
                    </div>
                  )}
                  <Button
                    onClick={() => setCurrentStep('ready')}
                    className="w-full"
                  >
                    Ready to Begin
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Story Card */}
            <StoryCard
              story={assignment.story}
              showFullContent={true}
              isSelectable={false}
              showAudioControls={currentStep !== 'complete'}
              variant="detailed"
            />

            {currentStep === 'ready' && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mic className="w-5 h-5 text-orange-600" />
                    Ready to Record
                  </CardTitle>
                  <CardDescription>
                    {assignment.story.ttsAudioUrl
                      ? "You can listen to the story above if you'd like, or jump straight to recording when you're ready."
                      : "Read the story carefully, then start recording when you're ready."
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-800 mb-2">Reading Tips:</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• Read slowly and clearly</li>
                      <li>• Take your time with difficult words</li>
                      <li>• Try to read with expression</li>
                      <li>• You have {assignment.maxAttempts - assignment.attempts} attempts remaining</li>
                    </ul>
                  </div>
                  <Button
                    onClick={() => setCurrentStep('record')}
                    className="w-full"
                  >
                    <Mic className="w-4 h-4 mr-2" />
                    Start Recording
                  </Button>
                </CardContent>
              </Card>
            )}

          </div>

          {/* Right Column - Recording */}
          <div>
            {(currentStep === 'instructions' || currentStep === 'ready') && (
              <Card>
                <CardContent className="p-8 text-center">
                  <Play className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">
                    {currentStep === 'instructions' ? 'Read Instructions First' : 'Optional: Listen to the Story'}
                  </h3>
                  <p className="text-gray-600">
                    {currentStep === 'instructions'
                      ? 'Read the assignment instructions to get started.'
                      : 'You can listen to the story to help with pronunciation, or jump straight to recording when ready.'
                    }
                  </p>
                </CardContent>
              </Card>
            )}

            {currentStep === 'record' && (
              <div className="space-y-6">
                <AudioRecorder
                  onRecordingComplete={handleRecordingComplete}
                  maxDurationSeconds={300}
                  showLivePreview={true}
                  disabled={submitting}
                />

                {submitting && (
                  <Card>
                    <CardContent className="p-6 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-gray-600">Submitting your recording...</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {currentStep === 'complete' && recordingResult && (
              <Card>
                <CardContent className="p-8 text-center">
                  {recordingResult.success ? (
                    <>
                      <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-600" />
                      <h3 className="text-lg font-medium mb-2 text-green-800">
                        Great Job! 🎉
                      </h3>
                      <p className="text-gray-600 mb-6">
                        You've successfully submitted your recording! Your teacher will review it and provide feedback.
                      </p>

                      <div className="space-y-3">
                        <Button onClick={handleBackToDashboard} className="w-full">
                          Back to Dashboard
                        </Button>
                        {assignment.attempts + 1 < assignment.maxAttempts && (
                          <Button
                            variant="outline"
                            onClick={handleStartOver}
                            className="w-full"
                          >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Record Again ({assignment.maxAttempts - assignment.attempts - 1} attempts left)
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-8 h-8 text-red-600" />
                      </div>
                      <h3 className="text-lg font-medium mb-2 text-red-800">
                        Submission Failed
                      </h3>
                      <p className="text-gray-600 mb-6">
                        {recordingResult.error || 'There was an error submitting your recording. Please try again.'}
                      </p>

                      <div className="space-y-3">
                        <Button onClick={handleStartOver} className="w-full">
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Try Again
                        </Button>
                        <Button variant="outline" onClick={handleBackToDashboard} className="w-full">
                          Back to Dashboard
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}