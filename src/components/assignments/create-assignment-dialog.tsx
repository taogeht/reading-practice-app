"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { BookOpen, Users, Volume2, VolumeX } from "lucide-react";
import type { StoryTtsAudio } from "@/types/story";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const assignmentSchema = z.object({
  title: z.string().min(1, "Assignment title is required"),
  description: z.string().optional(),
  storyId: z.string().min(1, "Please select a story"),
  classId: z.string().min(1, "Please select a class"),
  instructions: z.string().optional(),
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

interface CreateAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateAssignmentDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateAssignmentDialogProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<AssignmentFormData>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      title: "",
      description: "",
      storyId: "",
      classId: "",
      instructions: "",
    },
  });

  // Load stories and classes when dialog opens
  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [storiesResponse, classesResponse] = await Promise.all([
        fetch('/api/stories'),
        fetch('/api/classes'),
      ]);

      if (storiesResponse.ok) {
        const storiesData = await storiesResponse.json();
        setStories(storiesData.stories || []);
      }

      if (classesResponse.ok) {
        const classesData = await classesResponse.json();
        setClasses(classesData.classes || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: AssignmentFormData) => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to create assignment');
      }

      const result = await response.json();
      
      // Reset form and close dialog
      form.reset();
      onOpenChange(false);
      onSuccess?.();
      
    } catch (error) {
      console.error('Error creating assignment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedStory = stories.find(story => story.id === form.watch('storyId'));
  const selectedClass = classes.find(cls => cls.id === form.watch('classId'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Assignment</DialogTitle>
          <DialogDescription>
            Assign a story to your students for reading practice
          </DialogDescription>
        </DialogHeader>

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
                      {loading ? (
                        <SelectItem value="loading" disabled>Loading stories...</SelectItem>
                      ) : stories.length === 0 ? (
                        <SelectItem value="none" disabled>No stories available</SelectItem>
                      ) : (
                        stories.map((story) => (
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
                        ))
                      )}
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
                      {loading ? (
                        <SelectItem value="loading" disabled>Loading classes...</SelectItem>
                      ) : classes.length === 0 ? (
                        <SelectItem value="none" disabled>No classes available</SelectItem>
                      ) : (
                        classes.map((cls) => (
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
                        ))
                      )}
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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Assignment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
