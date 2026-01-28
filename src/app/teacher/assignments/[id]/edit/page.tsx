"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Users, Volume2, VolumeX, ArrowLeft, Save } from "lucide-react";
import type { StoryTtsAudio } from "@/types/story";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter, useParams } from "next/navigation";

const assignmentSchema = z.object({
  title: z.string().min(1, "Assignment title is required"),
  description: z.string().optional(),
  storyId: z.string().min(1, "Please select a story"),
  classId: z.string().min(1, "Please select a class"),
  instructions: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
});

type AssignmentFormData = z.infer<typeof assignmentSchema>;

interface Story {
  id: string;
  title: string;
  readingLevel?: string | null;
  gradeLevels: number[];
  ttsAudio: StoryTtsAudio[];
  wordCount?: number | null;
}

interface Class {
  id: string;
  name: string;
  gradeLevel?: number | null;
  studentCount: number;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assignedAt: string;
  instructions: string | null;
  storyId: string;
  classId: string;
}

export default function EditAssignmentPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = params.id as string;
  const [stories, setStories] = useState<Story[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<AssignmentFormData>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      title: "",
      description: "",
      storyId: "",
      classId: "",
      instructions: "",
      status: "published",
    },
  });

  useEffect(() => {
    loadData();
  }, [assignmentId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [storiesResponse, classesResponse, assignmentResponse] = await Promise.all([
        fetch('/api/stories'),
        fetch('/api/classes'),
        fetch(`/api/assignments/${assignmentId}`),
      ]);

      if (storiesResponse.ok) {
        const storiesData = await storiesResponse.json();
        setStories(storiesData.stories || []);
      }

      if (classesResponse.ok) {
        const classesData = await classesResponse.json();
        setClasses(classesData.classes || []);
      }

      if (assignmentResponse.ok) {
        const assignmentData = await assignmentResponse.json();
        const assignment: Assignment = assignmentData.assignment;

        // Populate form with existing data
        form.reset({
          title: assignment.title,
          description: assignment.description || "",
          storyId: assignment.storyId,
          classId: assignment.classId,
          instructions: assignment.instructions || "",
          status: assignment.status as 'draft' | 'published' | 'archived',
        });
      } else if (assignmentResponse.status === 404) {
        setError('Assignment not found');
      } else {
        throw new Error('Failed to load assignment');
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load assignment data');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: AssignmentFormData) => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/assignments/${assignmentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to update assignment');
      }

      router.push(`/teacher/assignments/${assignmentId}`);
    } catch (error) {
      console.error('Error updating assignment:', error);
      alert('Failed to update assignment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedStory = stories.find(story => story.id === form.watch('storyId'));
  const selectedClass = classes.find(cls => cls.id === form.watch('classId'));

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading assignment...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => router.push('/teacher/assignments')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Assignments
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => router.push(`/teacher/assignments/${assignmentId}`)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Assignment
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Edit Assignment</h1>
              <p className="text-gray-600 mt-1">
                Update assignment details and settings
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Assignment Title */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignment Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Read 'The Little Red Hen'"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Status */}
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select assignment status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Only published assignments are visible to students
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Story Selection */}
              <FormField
                control={form.control}
                name="storyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Story</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a story for students to read" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stories.map((story) => (
                          <SelectItem key={story.id} value={story.id}>
                            <div className="flex items-center justify-between w-full">
                              <span>{story.title}</span>
                              <div className="flex items-center gap-1 ml-2">
                                {story.ttsAudio.length > 0 ? (
                                  <Volume2 className="w-3 h-3 text-green-600" />
                                ) : (
                                  <VolumeX className="w-3 h-3 text-gray-400" />
                                )}
                                {story.readingLevel && (
                                  <Badge variant="outline" className="text-xs">
                                    {story.readingLevel}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedStory && (
                      <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2 text-sm">
                          <BookOpen className="w-4 h-4" />
                          <span className="font-medium">{selectedStory.title}</span>
                          {selectedStory.ttsAudio.length > 0 ? (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              <Volume2 className="w-3 h-3 mr-1" />
                              Audio Available
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <VolumeX className="w-3 h-3 mr-1" />
                              No Audio
                            </Badge>
                          )}
                        </div>
                        {selectedStory.readingLevel && (
                          <p className="text-xs text-gray-600 mt-1">
                            Reading Level: {selectedStory.readingLevel}
                          </p>
                        )}
                        {selectedStory.wordCount && (
                          <p className="text-xs text-gray-600">
                            {selectedStory.wordCount} words
                          </p>
                        )}
                        {selectedStory.ttsAudio.length > 0 && (
                          <p className="text-xs text-gray-600">
                            {selectedStory.ttsAudio.length} voice option{selectedStory.ttsAudio.length > 1 ? 's' : ''} available
                          </p>
                        )}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Class Selection */}
              <FormField
                control={form.control}
                name="classId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Class</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose which class to assign this to" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {classes.map((cls) => (
                          <SelectItem key={cls.id} value={cls.id}>
                            <div className="flex items-center justify-between w-full">
                              <span>{cls.name}</span>
                              <div className="flex items-center gap-1 ml-2">
                                <Users className="w-3 h-3" />
                                <span className="text-xs">{cls.studentCount}</span>
                                {cls.gradeLevel && (
                                  <Badge variant="outline" className="text-xs">
                                    Grade {cls.gradeLevel}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedClass && (
                      <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="w-4 h-4" />
                          <span className="font-medium">{selectedClass.name}</span>
                          <Badge variant="outline">
                            {selectedClass.studentCount} students
                          </Badge>
                        </div>
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />



              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add any additional details about this assignment..."
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Instructions */}
              <FormField
                control={form.control}
                name="instructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instructions for Students (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., Read clearly and slowly. Pay attention to punctuation..."
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push(`/teacher/assignments/${assignmentId}`)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  <Save className="w-4 h-4 mr-2" />
                  {submitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
