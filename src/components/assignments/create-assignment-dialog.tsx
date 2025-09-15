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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CalendarIcon, BookOpen, Users, Volume2, VolumeX } from "lucide-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const assignmentSchema = z.object({
  title: z.string().min(1, "Assignment title is required"),
  description: z.string().optional(),
  storyId: z.string().min(1, "Please select a story"),
  classId: z.string().min(1, "Please select a class"),
  dueDate: z.date().optional(),
  maxAttempts: z.number().min(1).max(10).default(3),
  instructions: z.string().optional(),
});

type AssignmentFormData = z.infer<typeof assignmentSchema>;

interface Story {
  id: string;
  title: string;
  readingLevel?: string | null;
  gradeLevels: number[];
  ttsAudioUrl?: string | null;
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
      maxAttempts: 3,
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
        body: JSON.stringify({
          ...data,
          dueAt: data.dueDate?.toISOString(),
        }),
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
                                {story.ttsAudioUrl ? (
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
                        {selectedStory.ttsAudioUrl ? (
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

            {/* Due Date */}
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Due Date (Optional)</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a due date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date < new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    When do you want students to complete this assignment?
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Max Attempts */}
            <FormField
              control={form.control}
              name="maxAttempts"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Maximum Attempts</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    How many times can students submit recordings for this assignment?
                  </FormDescription>
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