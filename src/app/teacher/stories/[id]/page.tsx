"use client";

import { useEffect, useState } from 'react';
import { notFound, useParams } from 'next/navigation';
import { StoryDetailView } from '@/components/stories/story-detail-view';

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
  ttsGeneratedAt?: string | null;
  elevenLabsVoiceId?: string | null;
  createdAt: string;
  updatedAt: string;
  creatorFirstName?: string | null;
  creatorLastName?: string | null;
}

export default function StoryDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [story, setStory] = useState<Story | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchStory() {
      try {
        const response = await fetch(`/api/stories/${id}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setNotFound(true);
          }
          return;
        }

        const data = await response.json();
        setStory(data.story);
      } catch (error) {
        console.error('Error fetching story:', error);
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }

    if (id) {
      fetchStory();
    }
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-6 bg-gray-200 rounded w-1/2 mb-8"></div>
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              <div className="h-4 bg-gray-200 rounded w-4/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !story) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Story Not Found</h1>
            <p className="text-gray-600">The story you're looking for doesn't exist or you don't have permission to view it.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <StoryDetailView story={story} />
      </div>
    </div>
  );
}