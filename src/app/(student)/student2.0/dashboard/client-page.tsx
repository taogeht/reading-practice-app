"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Play, Mic, StopCircle, Upload, Volume2, Trash2 } from "lucide-react";

export default function StudentDashboardV2() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const assignment = {
    id: "demo-assignment",
    title: "Read 'The Little Red Hen'",
    story: "Once upon a time, in a cozy little barn, lived a diligent red hen. She spent her days scratching for worms and seeds, always busy and bustling. One sunny morning, she discovered a handful of wheat seeds. An idea sparked in her mind! She would plant these seeds and bake a delicious loaf of bread. But the task was too big for her alone. She chirped to her farm friends - a lazy cat, a sleepy dog, and a playful pig - \"Who will help me plant these seeds?\" But they all had excuses. So, with a determined cluck, the little red hen planted the seeds all by herself.",
    ttsAudioUrl: "https://www2.cs.uic.edu/~i101/SoundFiles/BabyElephantWalk60.wav", // Mock audio URL for demo
  };

  const handleRecord = () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
    } else {
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      }).then((stream) => {
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        });
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        setRecordingDuration(0);

        mediaRecorder.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          setAudioBlob(audioBlob);

          // Create URL for playback
          const url = URL.createObjectURL(audioBlob);
          setAudioUrl(url);

          // Stop timer
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }

          // Stop all tracks
          stream.getTracks().forEach(track => track.stop());
          setIsRecording(false);
        };

        mediaRecorder.start(100); // Collect data every 100ms
        setIsRecording(true);

        // Start timer
        timerRef.current = setInterval(() => {
          setRecordingDuration(prev => prev + 1);
        }, 1000);
      }).catch(error => {
        console.error('Error accessing microphone:', error);
        alert('Failed to access microphone. Please check your permissions.');
      });
    }
  };

  const handlePlay = () => {
    if (audioUrl) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      audioRef.current = new Audio(audioUrl);
      audioRef.current.play().catch(console.error);
    }
  };

  const handleDelete = () => {
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setRecordingDuration(0);
    setUploadProgress(0);
  };

  const handleListen = () => {
    if (assignment.ttsAudioUrl) {
      const audio = new Audio(assignment.ttsAudioUrl);
      audio.play();
    }
  };

  const handleSubmit = async () => {
    if (!audioBlob) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('assignmentId', assignment.id);

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      const response = await fetch('/api/recordings/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      console.log('Upload successful:', result);

      // Show success message
      alert('Recording uploaded successfully!');

      // Clear the recording
      handleDelete();

    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-blue-50 p-4">
      <h1 className="text-4xl font-bold text-gray-800 mb-8">Your Assignment</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-gray-800">{assignment.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl text-gray-600 mb-4 leading-relaxed">
              {assignment.story}
            </p>
            <Button onClick={handleListen} className="w-full py-4 text-lg">
              <Volume2 className="w-6 h-6 mr-2" />
              Listen to the Story
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-gray-800">Record Your Reading</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center space-y-8">
            <Button
              size="lg"
              className={`w-48 h-48 rounded-full text-white flex flex-col items-center justify-center ${
                isRecording ? "bg-red-500 hover:bg-red-600 animate-pulse" : "bg-green-500 hover:bg-green-600"
              }`}
              onClick={handleRecord}
              disabled={isUploading}
            >
              {isRecording ? (
                <>
                  <StopCircle className="w-24 h-24" />
                  <span className="mt-2">Stop</span>
                </>
              ) : (
                <>
                  <Mic className="w-24 h-24" />
                  <span className="mt-2">Record</span>
                </>
              )}
            </Button>

            {/* Recording Timer */}
            {(isRecording || recordingDuration > 0) && (
              <div className="text-center">
                <div className="text-2xl font-mono text-gray-700">
                  {formatDuration(recordingDuration)}
                </div>
                {isRecording && (
                  <div className="text-sm text-gray-500">Recording in progress...</div>
                )}
              </div>
            )}

            {/* Upload Progress */}
            {isUploading && (
              <div className="w-full space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="w-full" />
              </div>
            )}

            {/* Playback and Upload Controls */}
            {audioBlob && !isRecording && (
              <div className="flex flex-col space-y-4 w-full">
                <div className="flex items-center space-x-4">
                  <Button
                    onClick={handlePlay}
                    disabled={isUploading}
                    className="flex-1 py-4 px-6 text-lg"
                  >
                    <Play className="w-6 h-6 mr-2" />
                    Play My Recording
                  </Button>
                  <Button
                    onClick={handleDelete}
                    disabled={isUploading}
                    variant="outline"
                    className="py-4 px-6"
                  >
                    <Trash2 className="w-6 h-6" />
                  </Button>
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={isUploading}
                  className="w-full py-4 px-6 text-lg"
                >
                  <Upload className="w-6 h-6 mr-2" />
                  {isUploading ? 'Uploading...' : 'Submit My Recording'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}