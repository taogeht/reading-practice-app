"use client";

import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { BookOpen, Volume2, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const storySchema = z.object({
  title: z.string().min(1, "Story title is required"),
  content: z.string().min(10, "Story content must be at least 10 characters"),
  author: z.string().optional(),
  genre: z.string().optional(),
  readingLevel: z.string().optional(),
  gradeLevels: z.array(z.number()).default([]),
  generateTTS: z.boolean().default(false),
});

type StoryFormData = z.infer<typeof storySchema>;

interface CreateStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateStoryDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateStoryDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [selectedGrades, setSelectedGrades] = useState<number[]>([]);

  const form = useForm<StoryFormData>({
    resolver: zodResolver(storySchema),
    defaultValues: {
      title: "",
      content: "",
      author: "",
      genre: "",
      readingLevel: "",
      gradeLevels: [],
      generateTTS: false,
    },
  });

  const readingLevels = ["Beginning", "Intermediate", "Advanced"];
  const genres = ["Fairy Tale", "Fiction", "Non-fiction", "Poetry", "Science", "History"];
  const grades = [1, 2, 3, 4, 5];

  const handleGradeToggle = (grade: number) => {
    const updatedGrades = selectedGrades.includes(grade)
      ? selectedGrades.filter((g) => g !== grade)
      : [...selectedGrades, grade].sort();

    setSelectedGrades(updatedGrades);
    form.setValue("gradeLevels", updatedGrades);
  };

  const onSubmit = async (data: StoryFormData) => {
    setSubmitting(true);
    try {
      const response = await fetch('/api/stories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          gradeLevels: selectedGrades,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create story');
      }

      const result = await response.json();

      // Reset form and close dialog
      form.reset();
      setSelectedGrades([]);
      onOpenChange(false);
      onSuccess?.();

    } catch (error) {
      console.error('Error creating story:', error);
      // You might want to show a toast notification here
      alert(error instanceof Error ? error.message : 'Failed to create story. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    form.reset();
    setSelectedGrades([]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) resetForm();
        onOpenChange(newOpen);
      }}
    >
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Create New Story
          </DialogTitle>
          <DialogDescription>
            Add a new reading story for your students to practice with
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Story Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Story Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., The Little Red Hen"
                      {...field}
                    />
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
                    <Input
                      placeholder="e.g., Traditional Folk Tale"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Genre and Reading Level */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="genre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Genre (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a genre" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {genres.map((genre) => (
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

              <FormField
                control={form.control}
                name="readingLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reading Level (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select reading level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {readingLevels.map((level) => (
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
            </div>

            {/* Grade Levels */}
            <div>
              <FormLabel>Target Grade Levels (Optional)</FormLabel>
              <div className="flex flex-wrap gap-2 mt-2">
                {grades.map((grade) => (
                  <Badge
                    key={grade}
                    variant={selectedGrades.includes(grade) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => handleGradeToggle(grade)}
                  >
                    Grade {grade}
                    {selectedGrades.includes(grade) && (
                      <X className="w-3 h-3 ml-1" />
                    )}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Click grade levels to select/deselect
              </p>
            </div>

            {/* Story Content */}
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Story Content</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Once upon a time..."
                      className="min-h-[200px] resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Write the complete story text that students will read aloud
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* TTS Generation Option */}
            <FormField
              control={form.control}
              name="generateTTS"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base flex items-center gap-2">
                      <Volume2 className="w-4 h-4" />
                      Generate Audio (TTS)
                    </FormLabel>
                    <FormDescription>
                      Automatically create audio narration for this story
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
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
                {submitting ? "Creating..." : "Create Story"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}