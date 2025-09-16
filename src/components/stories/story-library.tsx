"use client";

import { useState, useEffect } from "react";
import { StoryCard } from "./story-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, Plus, Volume2, VolumeX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  creatorFirstName?: string | null;
  creatorLastName?: string | null;
}

interface StoryLibraryProps {
  onStorySelect?: (story: Story) => void;
  showCreateButton?: boolean;
  variant?: 'grid' | 'list' | 'compact';
  filter?: {
    readingLevel?: string;
    gradeLevel?: number;
    hasAudio?: boolean;
  };
  selectable?: boolean;
  archivedOnly?: boolean;
}

export function StoryLibrary({
  onStorySelect,
  showCreateButton = false,
  variant = 'grid',
  filter,
  selectable = true,
  archivedOnly = false,
}: StoryLibraryProps) {
  const [stories, setStories] = useState<Story[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReadingLevel, setSelectedReadingLevel] = useState<string>('all');
  const [selectedGradeLevel, setSelectedGradeLevel] = useState<string>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [audioFilter, setAudioFilter] = useState<string>('all'); // 'true', 'false', or 'all'
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const readingLevels = ['Beginning', 'Intermediate', 'Advanced'];
  const grades = [1, 2, 3, 4, 5];
  const genres = ['Fairy Tale', 'Fiction', 'Non-fiction', 'Poetry', 'Science', 'History'];

  useEffect(() => {
    fetchStories();
  }, [
    currentPage,
    searchTerm,
    selectedReadingLevel,
    selectedGradeLevel,
    selectedGenre,
    audioFilter,
    filter
  ]);

  const fetchStories = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '12',
      });

      if (searchTerm) params.append('search', searchTerm);
      if (selectedReadingLevel && selectedReadingLevel !== 'all') params.append('readingLevel', selectedReadingLevel);
      if (selectedGradeLevel && selectedGradeLevel !== 'all') params.append('gradeLevel', selectedGradeLevel);
      if (selectedGenre && selectedGenre !== 'all') params.append('genre', selectedGenre);
      if (audioFilter && audioFilter !== 'all') params.append('hasAudio', audioFilter);
      
      // Apply external filter props
      if (filter?.readingLevel) params.append('readingLevel', filter.readingLevel);
      if (filter?.gradeLevel) params.append('gradeLevel', filter.gradeLevel.toString());
      if (filter?.hasAudio !== undefined) params.append('hasAudio', filter.hasAudio.toString());

      // Add archived filter
      if (archivedOnly) {
        params.append('archivedOnly', 'true');
      }

      const response = await fetch(`/api/stories?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch stories');
      }

      const data = await response.json();
      setStories(data.stories);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Error fetching stories:', error);
      setStories([]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedReadingLevel('all');
    setSelectedGradeLevel('all');
    setSelectedGenre('all');
    setAudioFilter('all');
    setCurrentPage(1);
  };

  const hasActiveFilters = !!(
    searchTerm ||
    (selectedReadingLevel && selectedReadingLevel !== 'all') ||
    (selectedGradeLevel && selectedGradeLevel !== 'all') ||
    (selectedGenre && selectedGenre !== 'all') ||
    (audioFilter && audioFilter !== 'all')
  );

  const getGridClassName = () => {
    switch (variant) {
      case 'compact':
        return 'grid grid-cols-1 gap-2';
      case 'list':
        return 'space-y-3';
      case 'grid':
      default:
        return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
    }
  };

  if (isLoading && stories.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          {showCreateButton && (
            <div className="h-10 w-32 bg-muted animate-pulse rounded" />
          )}
        </div>
        <div className={getGridClassName()}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-6 bg-muted animate-pulse rounded w-3/4" />
                <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 bg-muted animate-pulse rounded" />
                  <div className="h-4 bg-muted animate-pulse rounded w-5/6" />
                  <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Story Library</h2>
          <p className="text-muted-foreground">
            {stories.length} {stories.length === 1 ? 'story' : 'stories'} available
          </p>
        </div>
        {showCreateButton && (
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Story
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search stories by title..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            className="shrink-0"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-2">
                {[searchTerm, selectedReadingLevel, selectedGradeLevel, selectedGenre, audioFilter]
                  .filter(Boolean).length}
              </Badge>
            )}
          </Button>
        </div>

        {isFiltersOpen && (
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Reading Level</label>
                  <Select value={selectedReadingLevel} onValueChange={setSelectedReadingLevel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any level</SelectItem>
                      {readingLevels.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Grade Level</label>
                  <Select value={selectedGradeLevel} onValueChange={setSelectedGradeLevel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any grade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any grade</SelectItem>
                      {grades.map((grade) => (
                        <SelectItem key={grade} value={grade.toString()}>
                          Grade {grade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Genre</label>
                  <Select value={selectedGenre} onValueChange={setSelectedGenre}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any genre" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any genre</SelectItem>
                      {genres.map((genre) => (
                        <SelectItem key={genre} value={genre}>
                          {genre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Audio</label>
                  <Select value={audioFilter} onValueChange={setAudioFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any</SelectItem>
                      <SelectItem value="true">
                        <div className="flex items-center">
                          <Volume2 className="w-4 h-4 mr-2" />
                          Has Audio
                        </div>
                      </SelectItem>
                      <SelectItem value="false">
                        <div className="flex items-center">
                          <VolumeX className="w-4 h-4 mr-2" />
                          No Audio
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {hasActiveFilters && (
                <div className="mt-4 pt-4 border-t">
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear All Filters
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Stories Grid */}
      {stories.length === 0 && !isLoading ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No stories found</h3>
              <p>Try adjusting your search terms or filters</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className={getGridClassName()}>
            {stories.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                onSelect={onStorySelect}
                isSelectable={selectable}
                variant={variant === 'compact' ? 'compact' : 'default'}
                showAudioControls={true}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                disabled={currentPage === 1 || isLoading}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Previous
              </Button>
              <span className="px-4 py-2 text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                disabled={currentPage === totalPages || isLoading}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}