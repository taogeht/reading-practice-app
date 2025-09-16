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
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const storySchema = z.object({
  title: z.string().min(1, "Story title is required"),
  content: z.string().min(1, "Story content is required"),
  author: z.string().optional(),
  genre: z.string().optional(),
  readingLevel: z.string().optional(),
  gradeLevels: z.array(z.number()).optional(),
});

type StoryFormData = z.infer<typeof storySchema>;

interface Story {
  id: string;
  title: string;
  content: string;
  readingLevel?: string | null;
  gradeLevels: number[];
  author?: string | null;
  genre?: string | null;
}

interface EditStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  story: Story;
  onSuccess?: () => void;
}

const READING_LEVELS = [
  'Pre-K', 'Kindergarten', '1st Grade', '2nd Grade', '3rd Grade',
  '4th Grade', '5th Grade', '6th Grade', '7th Grade', '8th Grade',
  'High School', 'Adult'
];

const GENRES = [
  'Adventure', 'Fantasy', 'Mystery', 'Science Fiction', 'Historical Fiction',
  'Realistic Fiction', 'Biography', 'Autobiography', 'Informational',
  'Poetry', 'Folktale', 'Fairy Tale', 'Fable', 'Legend', 'Myth'
];

export function EditStoryDialog({
  open,
  onOpenChange,
  story,
  onSuccess,
}: EditStoryDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [selectedGrades, setSelectedGrades] = useState<number[]>(story.gradeLevels || []);

  const form = useForm<StoryFormData>({
    resolver: zodResolver(storySchema),
    defaultValues: {
      title: story.title,
      content: story.content,
      author: story.author || "",
      genre: story.genre || "",
      readingLevel: story.readingLevel || "",
      gradeLevels: story.gradeLevels || [],
    },
  });

  // Update form when story changes
  useEffect(() => {
    form.reset({
      title: story.title,
      content: story.content,
      author: story.author || "",
      genre: story.genre || "",
      readingLevel: story.readingLevel || "",
      gradeLevels: story.gradeLevels || [],
    });
    setSelectedGrades(story.gradeLevels || []);
  }, [story, form]);

  const onSubmit = async (data: StoryFormData) => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/stories/${story.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          gradeLevels: selectedGrades,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update story');
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error updating story:', error);
      alert(error instanceof Error ? error.message : 'Failed to update story. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleGrade = (grade: number) => {
    setSelectedGrades(prev =>
      prev.includes(grade)
        ? prev.filter(g => g !== grade)
        : [...prev, grade].sort((a, b) => a - b)
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Story</DialogTitle>
          <DialogDescription>
            Update the story details and content
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Story Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter story title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Author */}
            <FormField
              control={form.control}
              name="author"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Author (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter author name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Genre */}
            <FormField
              control={form.control}
              name="genre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Genre (Optional)</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value === "none" ? "" : value)}
                    value={field.value || "none"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a genre" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No genre</SelectItem>
                      {GENRES.map((genre) => (
                        <SelectItem key={genre} value={genre}>
                          {genre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Reading Level */}
            <FormField
              control={form.control}
              name="readingLevel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reading Level (Optional)</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value === "none" ? "" : value)}
                    value={field.value || "none"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select reading level" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No reading level</SelectItem>
                      {READING_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Grade Levels */}
            <FormItem>
              <FormLabel>Grade Levels (Optional)</FormLabel>
              <FormDescription>
                Select which grade levels this story is appropriate for
              </FormDescription>
              <div className="flex flex-wrap gap-2 mt-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((grade) => (
                  <Badge
                    key={grade}
                    variant={selectedGrades.includes(grade) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleGrade(grade)}
                  >
                    Grade {grade}
                    {selectedGrades.includes(grade) && (
                      <X className="w-3 h-3 ml-1" />
                    )}
                  </Badge>
                ))}
              </div>
              {selectedGrades.length > 0 && (
                <div className="text-sm text-muted-foreground mt-2">
                  Selected: {selectedGrades.map(g => `Grade ${g}`).join(', ')}
                </div>
              )}
            </FormItem>

            {/* Content */}
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Story Content</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter the story content..."
                      className="min-h-[200px] resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Write the complete story text that students will read
                  </FormDescription>
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
                {submitting ? "Updating..." : "Update Story"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}