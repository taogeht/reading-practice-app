"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StoryCard } from "@/components/stories/story-card";
import { AudioRecorder } from "@/components/audio/audio-recorder";
import { ArrowLeft, Play, Mic, CheckCircle, RotateCcw, BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";

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

interface PracticePageProps {
  params: {
    storyId: string;
  };
}

export default function PracticePage({ params }: PracticePageProps) {
  const [story, setStory] = useState<Story | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<'listen' | 'practice' | 'record' | 'complete'>('listen');
  const [hasListened, setHasListened] = useState(false);
  const [recordingResult, setRecordingResult] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    fetchStory();
  }, [params.storyId]);

  const fetchStory = async () => {
    try {
      const response = await fetch(`/api/stories/${params.storyId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setStory(null);
          return;
        }
        throw new Error('Failed to fetch story');
      }
      
      const data = await response.json();
      setStory(data.story);
    } catch (error) {
      console.error('Error fetching story:', error);
      setStory(null);
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

  const handleRecordingComplete = (result: any) => {
    setRecordingResult(result);
    if (result.success) {
      setCurrentStep('complete');
    }
  };

  const handleStartOver = () => {
    setCurrentStep('listen');
    setHasListened(false);
    setRecordingResult(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your story...</p>
        </div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-gray-600 mb-4">Story not found</p>
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
            <div>
              <h1 className="text-2xl font-bold">Reading Practice</h1>
              <p className="text-gray-600 text-sm">Follow the steps to complete your assignment</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Progress Steps */}
        <Card className="mb-8">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-2 ${currentStep === 'listen' ? 'text-blue-600 font-medium' : hasListened ? 'text-green-600' : 'text-gray-400'}`}>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${
                  hasListened ? 'bg-green-600 border-green-600 text-white' :
                  currentStep === 'listen' ? 'border-blue-600' : 'border-gray-300'
                }`}>
                  {hasListened ? <CheckCircle className="w-3 h-3" /> : '1'}
                </div>
                <span className="hidden sm:inline">Listen to Story</span>
                <span className="sm:hidden">Listen</span>
              </div>
              
              <div className="flex-1 h-0.5 bg-gray-200 mx-4">
                <div className={`h-full transition-all duration-300 ${
                  hasListened ? 'bg-green-600 w-full' : 
                  currentStep !== 'listen' ? 'bg-blue-600 w-1/2' : 'bg-gray-200 w-0'
                }`}></div>
              </div>
              
              <div className={`flex items-center gap-2 ${
                currentStep === 'practice' || currentStep === 'record' ? 'text-blue-600 font-medium' : 
                currentStep === 'complete' ? 'text-green-600' : 'text-gray-400'
              }`}>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs ${
                  currentStep === 'complete' ? 'bg-green-600 border-green-600 text-white' :
                  (currentStep === 'practice' || currentStep === 'record') ? 'border-blue-600' : 'border-gray-300'
                }`}>
                  {currentStep === 'complete' ? <CheckCircle className="w-3 h-3" /> : '2'}
                </div>
                <span className="hidden sm:inline">Practice & Record</span>
                <span className="sm:hidden">Record</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Story */}
          <div>
            <StoryCard
              story={story}
              showFullContent={true}
              isSelectable={false}
              showAudioControls={currentStep === 'listen'}
              variant="detailed"
            />

            {currentStep === 'listen' && !hasListened && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Play className="w-5 h-5 text-blue-600" />
                    Step 1: Listen to the Story
                  </CardTitle>
                  <CardDescription>
                    Click the play button above to listen to the story first. This will help you understand how to pronounce the words correctly.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={() => {
                      setHasListened(true);
                      setCurrentStep('practice');
                    }}
                    className="w-full"
                  >
                    I've Listened - Ready to Practice!
                  </Button>
                </CardContent>
              </Card>
            )}

            {(currentStep === 'practice' || currentStep === 'record') && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mic className="w-5 h-5 text-orange-600" />
                    Step 2: Practice Reading
                  </CardTitle>
                  <CardDescription>
                    Now practice reading the story out loud. You can listen to it again if you need help with any words.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-800 mb-2">Reading Tips:</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• Read slowly and clearly</li>
                      <li>• Take your time with difficult words</li>
                      <li>• Try to read with expression</li>
                      <li>• You can record as many times as you want!</li>
                    </ul>
                  </div>
                  <Button 
                    onClick={() => setCurrentStep('record')}
                    className="w-full"
                    variant={currentStep === 'record' ? 'default' : 'outline'}
                  >
                    Ready to Record
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Recording */}
          <div>
            {currentStep === 'listen' && (
              <Card>
                <CardContent className="p-8 text-center">
                  <Play className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">Listen First</h3>
                  <p className="text-gray-600">
                    Start by listening to the story to learn how to pronounce the words correctly.
                  </p>
                </CardContent>
              </Card>
            )}

            {(currentStep === 'practice' || currentStep === 'record') && (
              <div className="space-y-6">
                {currentStep === 'practice' && (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                      <h3 className="text-lg font-medium mb-2">Practice Time</h3>
                      <p className="text-gray-600 mb-4">
                        Read the story out loud a few times to get comfortable with it.
                      </p>
                      <p className="text-sm text-gray-500">
                        When you're ready, click "Ready to Record" to move to the next step.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {currentStep === 'record' && (
                  <AudioRecorder
                    onRecordingComplete={handleRecordingComplete}
                    maxDurationSeconds={300}
                    showLivePreview={true}
                  />
                )}
              </div>
            )}

            {currentStep === 'complete' && recordingResult?.success && (
              <Card>
                <CardContent className="p-8 text-center">
                  <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-600" />
                  <h3 className="text-lg font-medium mb-2 text-green-800">
                    Great Job! 🎉
                  </h3>
                  <p className="text-gray-600 mb-6">
                    You've successfully completed your reading assignment! Your teacher will review your recording and provide feedback.
                  </p>
                  
                  <div className="space-y-3">
                    <Button onClick={handleBackToDashboard} className="w-full">
                      Back to Dashboard
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={handleStartOver}
                      className="w-full"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Record Again
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}