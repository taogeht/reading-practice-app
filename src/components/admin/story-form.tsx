'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { GRADE_LEVELS_EXTENDED, formatGradeLevel } from "@/lib/grade-levels";

interface Story {
  id?: string;
  title: string;
  content: string;
  readingLevel?: string;
  gradeLevels: number[];
  author?: string;
  genre?: string;
  active: boolean;
}

interface StoryFormProps {
  story?: Story;
  onSave: (storyData: any) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export default function StoryForm({ story, onSave, onCancel, loading = false }: StoryFormProps) {
  const [formData, setFormData] = useState({
    title: story?.title || '',
    content: story?.content || '',
    readingLevel: story?.readingLevel || '',
    gradeLevels: story?.gradeLevels || [],
    author: story?.author || '',
    genre: story?.genre || '',
    active: story?.active ?? true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [gradeLevelInput, setGradeLevelInput] = useState('');

  const isEditing = !!story?.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (!formData.content.trim()) newErrors.content = 'Content is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});

    try {
      await onSave(formData);
    } catch (error) {
      console.error('Error saving story:', error);
    }
  };

  const handleChange = (field: string, value: string | boolean | number[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const addGradeLevel = () => {
    const grade = parseInt(gradeLevelInput);
    const validGrades = GRADE_LEVELS_EXTENDED.map(g => g.value);
    if (!isNaN(grade) && validGrades.includes(grade) && !formData.gradeLevels.includes(grade)) {
      const newGradeLevels = [...formData.gradeLevels, grade].sort((a, b) => a - b);
      handleChange('gradeLevels', newGradeLevels);
      setGradeLevelInput('');
    }
  };

  const removeGradeLevel = (grade: number) => {
    const newGradeLevels = formData.gradeLevels.filter(g => g !== grade);
    handleChange('gradeLevels', newGradeLevels);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-96 overflow-y-auto">
      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => handleChange('title', e.target.value)}
          className={errors.title ? 'border-red-500' : ''}
        />
        {errors.title && <p className="text-sm text-red-500 mt-1">{errors.title}</p>}
      </div>

      <div>
        <Label htmlFor="content">Content</Label>
        <textarea
          id="content"
          value={formData.content}
          onChange={(e) => handleChange('content', e.target.value)}
          className={`w-full min-h-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.content ? 'border-red-500' : ''
            }`}
          placeholder="Enter the story content..."
        />
        {errors.content && <p className="text-sm text-red-500 mt-1">{errors.content}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="author">Author</Label>
          <Input
            id="author"
            value={formData.author}
            onChange={(e) => handleChange('author', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="genre">Genre</Label>
          <Input
            id="genre"
            value={formData.genre}
            onChange={(e) => handleChange('genre', e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="readingLevel">Reading Level</Label>
        <Input
          id="readingLevel"
          value={formData.readingLevel}
          onChange={(e) => handleChange('readingLevel', e.target.value)}
          placeholder="e.g., Elementary, Middle School, High School"
        />
      </div>

      <div>
        <Label>Grade Levels</Label>
        <div className="flex flex-wrap gap-2 mt-2 mb-2">
          {GRADE_LEVELS_EXTENDED.map(grade => (
            <Button
              key={grade.value}
              type="button"
              variant={formData.gradeLevels.includes(grade.value) ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (formData.gradeLevels.includes(grade.value)) {
                  removeGradeLevel(grade.value);
                } else {
                  const newGradeLevels = [...formData.gradeLevels, grade.value].sort((a, b) => a - b);
                  handleChange('gradeLevels', newGradeLevels);
                }
              }}
            >
              {grade.shortLabel}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {formData.gradeLevels.map(grade => (
            <span
              key={grade}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
            >
              {formatGradeLevel(grade)}
              <button
                type="button"
                onClick={() => removeGradeLevel(grade)}
                className="text-blue-600 hover:text-blue-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="active"
          checked={formData.active}
          onCheckedChange={(checked) => handleChange('active', checked)}
        />
        <Label htmlFor="active">Active</Label>
      </div>

      <div className="flex space-x-2 pt-4">
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : isEditing ? 'Update Story' : 'Create Story'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}