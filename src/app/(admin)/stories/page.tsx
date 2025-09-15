'use client';

import { useEffect, useState } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import StoryForm from "@/components/admin/story-form";

interface Story {
  id: string;
  title: string;
  content: string;
  readingLevel?: string;
  gradeLevels: number[];
  wordCount?: number;
  estimatedReadingTimeMinutes?: number;
  author?: string;
  genre?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function StoryManagementPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<Story | undefined>(undefined);
  const [formLoading, setFormLoading] = useState(false);

  const fetchStories = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/stories');
      if (!response.ok) {
        throw new Error('Failed to fetch stories');
      }
      const data = await response.json();
      setStories(data.stories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStories();
  }, []);

  const handleAddStory = () => {
    setEditingStory(undefined);
    setIsDialogOpen(true);
  };

  const handleEditStory = (story: Story) => {
    setEditingStory(story);
    setIsDialogOpen(true);
  };

  const handleDeleteStory = async (story: Story) => {
    if (!confirm(`Are you sure you want to delete "${story.title}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/stories/${story.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete story');
      }

      await fetchStories();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete story');
    }
  };

  const handleSaveStory = async (storyData: any) => {
    try {
      setFormLoading(true);
      
      const url = editingStory 
        ? `/api/admin/stories/${editingStory.id}`
        : '/api/admin/stories';
      
      const method = editingStory ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(storyData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save story');
      }

      setIsDialogOpen(false);
      await fetchStories();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save story');
    } finally {
      setFormLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading stories...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-600 dark:text-red-400 p-4">
        Error: {error}
        <Button onClick={fetchStories} className="ml-4">Retry</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Story Management</h1>
        <Button onClick={handleAddStory}>Add New Story</Button>
      </div>
      
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Genre</TableHead>
              <TableHead>Reading Level</TableHead>
              <TableHead>Word Count</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stories.map((story) => (
              <TableRow key={story.id}>
                <TableCell className="font-medium">{story.title}</TableCell>
                <TableCell>{story.author || 'N/A'}</TableCell>
                <TableCell>{story.genre || 'N/A'}</TableCell>
                <TableCell>{story.readingLevel || 'N/A'}</TableCell>
                <TableCell>{story.wordCount || 'N/A'}</TableCell>
                <TableCell>
                  <Badge variant={story.active ? 'default' : 'secondary'}>
                    {story.active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleEditStory(story)}
                    >
                      Edit
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => handleDeleteStory(story)}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {stories.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">No stories found.</p>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {editingStory ? 'Edit Story' : 'Add New Story'}
            </DialogTitle>
          </DialogHeader>
          <StoryForm
            story={editingStory}
            onSave={handleSaveStory}
            onCancel={() => setIsDialogOpen(false)}
            loading={formLoading}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}