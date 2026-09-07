'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  Loader2,
  Palette,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { READING_LEVELS } from '@/lib/reading/levels';

interface PageItem {
  id: string;
  pageNumber: number;
  text: string;
  sceneDescription: string;
}

interface CharacterItem {
  id: string;
  name: string;
  description: string;
}

type GenerationStep =
  | 'idle'
  | 'planning'
  | 'page_image'
  | 'uploads'
  | 'questions'
  | 'saving'
  | 'complete'
  | 'error';

interface GenerationProgressState {
  step: GenerationStep;
  message: string;
  currentPage?: number;
  totalPages?: number;
  passageId?: string;
  title?: string;
  error?: string;
}

export function CustomStoryForm() {
  const router = useRouter();

  // Basic Story Info
  const [title, setTitle] = useState('');
  const [readingLevelId, setReadingLevelId] = useState<number>(2);

  // Story Text Input Mode: 'paste' | 'pages'
  const [inputMode, setInputMode] = useState<'paste' | 'pages'>('paste');
  const [pastedStory, setPastedStory] = useState('');

  // Page List
  const [pages, setPages] = useState<PageItem[]>([
    {
      id: 'p-1',
      pageNumber: 1,
      text: '',
      sceneDescription: '',
    },
    {
      id: 'p-2',
      pageNumber: 2,
      text: '',
      sceneDescription: '',
    },
    {
      id: 'p-3',
      pageNumber: 3,
      text: '',
      sceneDescription: '',
    },
  ]);

  // Art Direction & Characters
  const [setting, setSetting] = useState('');
  const [characters, setCharacters] = useState<CharacterItem[]>([]);
  const [artPlanOpen, setArtPlanOpen] = useState(false);
  const [analyzingArt, setAnalyzingArt] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Options
  const [generateQuestions, setGenerateQuestions] = useState(true);

  // Generation execution state
  const [progress, setProgress] = useState<GenerationProgressState>({
    step: 'idle',
    message: '',
  });

  // ---- Story text parsing & page helpers ---------------------------------

  const handleSplitStory = () => {
    if (!pastedStory.trim()) return;

    // Split on double newlines or lines starting with Page X / ---
    const rawBlocks = pastedStory
      .split(/\n\s*\n|(?:\r?\n)(?=Page \d+:?)|---+/)
      .map((b) => b.trim())
      .filter(Boolean);

    if (rawBlocks.length === 0) return;

    const newPages: PageItem[] = rawBlocks.map((text, idx) => ({
      id: `p-${Date.now()}-${idx + 1}`,
      pageNumber: idx + 1,
      text,
      sceneDescription: '',
    }));

    setPages(newPages);
    setInputMode('pages');
  };

  const handleAddPage = () => {
    setPages((prev) => [
      ...prev,
      {
        id: `p-${Date.now()}-${prev.length + 1}`,
        pageNumber: prev.length + 1,
        text: '',
        sceneDescription: '',
      },
    ]);
  };

  const handleRemovePage = (index: number) => {
    if (pages.length <= 1) return;
    const updated = pages
      .filter((_, i) => i !== index)
      .map((p, i) => ({ ...p, pageNumber: i + 1 }));
    setPages(updated);
  };

  const handleMovePage = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === pages.length - 1)
    ) {
      return;
    }
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const updated = [...pages];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;

    setPages(updated.map((p, i) => ({ ...p, pageNumber: i + 1 })));
  };

  const handlePageTextChange = (index: number, text: string) => {
    setPages((prev) =>
      prev.map((p, i) => (i === index ? { ...p, text } : p)),
    );
  };

  const handleSceneDescriptionChange = (index: number, sceneDescription: string) => {
    setPages((prev) =>
      prev.map((p, i) => (i === index ? { ...p, sceneDescription } : p)),
    );
  };

  // ---- Character list helpers -------------------------------------------

  const handleAddCharacter = () => {
    setCharacters((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        name: '',
        description: '',
      },
    ]);
  };

  const handleRemoveCharacter = (id: string) => {
    setCharacters((prev) => prev.filter((c) => c.id !== id));
  };

  const handleCharacterChange = (
    id: string,
    field: 'name' | 'description',
    value: string,
  ) => {
    setCharacters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  };

  // ---- AI Art & Character Analyzer -------------------------------------

  const handleAutoDetectArt = async () => {
    // If user is in paste mode with un-split text, split first
    let pagesToUse = pages;
    if (inputMode === 'paste' && pastedStory.trim()) {
      const rawBlocks = pastedStory
        .split(/\n\s*\n|(?:\r?\n)(?=Page \d+:?)|---+/)
        .map((b) => b.trim())
        .filter(Boolean);
      if (rawBlocks.length > 0) {
        pagesToUse = rawBlocks.map((text, idx) => ({
          id: `p-${Date.now()}-${idx + 1}`,
          pageNumber: idx + 1,
          text,
          sceneDescription: '',
        }));
        setPages(pagesToUse);
      }
    }

    const validPages = pagesToUse.filter((p) => p.text.trim().length > 0);
    if (validPages.length === 0) {
      setPlanError('Please enter some story text first.');
      return;
    }

    setAnalyzingArt(true);
    setPlanError(null);

    try {
      const res = await fetch('/api/teacher/reading/plan-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          readingLevelId,
          pages: validPages.map((p) => ({
            pageNumber: p.pageNumber,
            text: p.text,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze story');
      }

      if (data.plan) {
        if (!title.trim() && data.plan.title) {
          setTitle(data.plan.title);
        }
        if (data.plan.setting) {
          setSetting(data.plan.setting);
        }
        if (Array.isArray(data.plan.characters)) {
          setCharacters(
            data.plan.characters.map((c: any, i: number) => ({
              id: `c-${i}`,
              name: c.name,
              description: c.description,
            })),
          );
        }
        if (Array.isArray(data.plan.pages)) {
          setPages((prev) =>
            prev.map((p) => {
              const matched = data.plan.pages.find(
                (dp: any) => dp.pageNumber === p.pageNumber,
              );
              return matched
                ? { ...p, sceneDescription: matched.sceneDescription }
                : p;
            }),
          );
        }
        setArtPlanOpen(true);
      }
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzingArt(false);
    }
  };

  // ---- Generation execution --------------------------------------------

  const handleGenerateBook = async () => {
    // If in paste mode, split into pages if not done
    let pagesToSubmit = pages;
    if (inputMode === 'paste' && pastedStory.trim()) {
      const rawBlocks = pastedStory
        .split(/\n\s*\n|(?:\r?\n)(?=Page \d+:?)|---+/)
        .map((b) => b.trim())
        .filter(Boolean);
      if (rawBlocks.length > 0) {
        pagesToSubmit = rawBlocks.map((text, idx) => ({
          id: `p-${idx + 1}`,
          pageNumber: idx + 1,
          text,
          sceneDescription: '',
        }));
        setPages(pagesToSubmit);
      }
    }

    const validPages = pagesToSubmit.filter((p) => p.text.trim().length > 0);
    if (validPages.length === 0) {
      alert('Please provide story text for at least one page.');
      return;
    }

    setProgress({
      step: 'planning',
      message: 'Connecting to generation pipeline...',
      totalPages: validPages.length,
    });

    try {
      const response = await fetch('/api/teacher/reading/generate-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          readingLevelId,
          pages: validPages.map((p) => ({
            pageNumber: p.pageNumber,
            text: p.text,
            sceneDescription: p.sceneDescription || undefined,
          })),
          characters:
            characters.length > 0
              ? characters
                  .filter((c) => c.name.trim())
                  .map((c) => ({ name: c.name.trim(), description: c.description.trim() }))
              : undefined,
          setting: setting.trim() || undefined,
          generateQuestions,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response stream received');
      }

      // Stream NDJSON progress events
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.step === 'error') {
              setProgress({
                step: 'error',
                message: event.error || 'Generation failed',
                error: event.error,
              });
              return;
            } else if (event.step === 'complete') {
              setProgress({
                step: 'complete',
                message: 'Book generation complete!',
                passageId: event.passageId,
                title: event.title,
              });
            } else if (event.step === 'page_image') {
              setProgress((prev) => ({
                ...prev,
                step: 'page_image',
                message: event.message,
                currentPage: event.pageNumber,
                totalPages: event.totalPages || validPages.length,
              }));
            } else {
              setProgress((prev) => ({
                ...prev,
                step: event.step,
                message: event.message,
              }));
            }
          } catch {
            // non-JSON chunk, skip
          }
        }
      }
    } catch (err) {
      setProgress({
        step: 'error',
        message: err instanceof Error ? err.message : 'Generation failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const isGenerating =
    progress.step !== 'idle' &&
    progress.step !== 'complete' &&
    progress.step !== 'error';

  // Calculate approximate percentage for the progress bar
  const calculateProgressPercent = () => {
    switch (progress.step) {
      case 'planning':
        return 15;
      case 'page_image': {
        const total = progress.totalPages || pages.length || 4;
        const current = progress.currentPage || 1;
        // Images account for 20% to 75%
        return Math.min(75, 20 + Math.round(((current - 0.5) / total) * 55));
      }
      case 'uploads':
        return 80;
      case 'questions':
        return 88;
      case 'saving':
        return 95;
      case 'complete':
        return 100;
      default:
        return 0;
    }
  };

  // ---- Render Completed State -------------------------------------------

  if (progress.step === 'complete' && progress.passageId) {
    return (
      <Card className="border-green-200 bg-green-50/50 shadow-sm">
        <CardContent className="py-10 text-center space-y-5">
          <div className="mx-auto w-14 h-14 bg-green-100 text-green-700 rounded-full flex items-center justify-center">
            <Check className="w-8 h-8 stroke-[2.5]" />
          </div>
          <div>
            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 mb-2">
              Ready for Review
            </Badge>
            <h3 className="text-2xl font-bold text-gray-900">
              &ldquo;{progress.title || title || 'Your Book'}&rdquo; has been created!
            </h3>
            <p className="text-gray-600 mt-1 max-w-md mx-auto">
              All page illustrations have been generated with consistent characters and watercolor styling. You can now review pages, edit text, generate voice narration, and publish it for students.
            </p>
          </div>

          <div className="flex justify-center gap-3 pt-2">
            <Button
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              onClick={() => router.push(`/teacher/reading/review/${progress.passageId}`)}
            >
              <BookOpen className="w-5 h-5 mr-2" />
              Open in Review Queue
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                setProgress({ step: 'idle', message: '' });
                setTitle('');
                setPastedStory('');
                setCharacters([]);
                setSetting('');
                setPages([
                  { id: 'p-1', pageNumber: 1, text: '', sceneDescription: '' },
                  { id: 'p-2', pageNumber: 2, text: '', sceneDescription: '' },
                ]);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Another Story
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Main Form --------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* 1. Basic Details Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <span>Story Details</span>
              </CardTitle>
              <CardDescription>
                Set the reading level and title for your custom story book.
              </CardDescription>
            </div>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              Consistent Image Engine
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Story Title <span className="text-gray-400 font-normal">(optional — AI can generate)</span>
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Leo and the Red Kite"
                disabled={isGenerating}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Target Reading Level
              </label>
              <select
                value={readingLevelId}
                onChange={(e) => setReadingLevelId(parseInt(e.target.value, 10))}
                disabled={isGenerating}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {READING_LEVELS.map((lvl) => (
                  <option key={lvl.id} value={lvl.id}>
                    Level {lvl.id} — {lvl.name} (AF&amp;F {lvl.targetAfFLevel})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Story Content Input Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" />
                <span>Story Pages</span>
              </CardTitle>
              <CardDescription>
                Provide the story text. Each page gets its own dedicated illustration.
              </CardDescription>
            </div>

            {/* Input mode toggle */}
            <div className="flex bg-gray-100 p-1 rounded-lg border text-xs font-medium">
              <button
                type="button"
                onClick={() => setInputMode('paste')}
                className={`px-3 py-1.5 rounded-md transition ${
                  inputMode === 'paste'
                    ? 'bg-white shadow-sm text-gray-900 font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Paste Full Story
              </button>
              <button
                type="button"
                onClick={() => setInputMode('pages')}
                className={`px-3 py-1.5 rounded-md transition ${
                  inputMode === 'pages'
                    ? 'bg-white shadow-sm text-gray-900 font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Page-by-Page Editor ({pages.length})
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {inputMode === 'paste' ? (
            <div className="space-y-3">
              <Textarea
                rows={8}
                value={pastedStory}
                onChange={(e) => setPastedStory(e.target.value)}
                disabled={isGenerating}
                placeholder={`Paste or write your full story here...\n\nExample:\nOnce upon a time, a little boy named Leo got a bright red kite.\n\nHe ran outside into the sunny park. The wind was blowing fast!\n\nLeo held the string tightly as the kite danced high into the blue sky.`}
                className="font-sans text-sm leading-relaxed"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Tip: Separate paragraphs with an empty line to automatically split them into pages.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleSplitStory}
                  disabled={!pastedStory.trim() || isGenerating}
                >
                  Split into Pages &rarr;
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {pages.map((page, index) => (
                <div
                  key={page.id}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                      <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs">
                        {page.pageNumber}
                      </span>
                      Page {page.pageNumber}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMovePage(index, 'up')}
                        disabled={index === 0 || isGenerating}
                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded"
                        title="Move page up"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMovePage(index, 'down')}
                        disabled={index === pages.length - 1 || isGenerating}
                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded"
                        title="Move page down"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePage(index)}
                        disabled={pages.length <= 1 || isGenerating}
                        className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30 rounded ml-1"
                        title="Delete page"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <Textarea
                    rows={2}
                    value={page.text}
                    onChange={(e) => handlePageTextChange(index, e.target.value)}
                    disabled={isGenerating}
                    placeholder={`Text for page ${page.pageNumber}...`}
                    className="bg-white text-sm"
                  />

                  {/* Scene art direction snippet (if planned) */}
                  {page.sceneDescription && (
                    <div className="text-xs bg-amber-50/70 border border-amber-200 rounded p-2.5 text-amber-900">
                      <span className="font-semibold block mb-0.5 flex items-center gap-1">
                        <Palette className="w-3 h-3 text-amber-700" /> Illustration Scene Direction:
                      </span>
                      <Input
                        value={page.sceneDescription}
                        onChange={(e) => handleSceneDescriptionChange(index, e.target.value)}
                        className="text-xs bg-white mt-1 h-8"
                        disabled={isGenerating}
                      />
                    </div>
                  )}
                </div>
              ))}

              <div className="flex justify-between items-center pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddPage}
                  disabled={isGenerating}
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Another Page
                </Button>
                <span className="text-xs text-gray-500">
                  {pages.length} {pages.length === 1 ? 'page' : 'pages'} total
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Consistent Character & Illustration Settings Card */}
      <Card className="border-indigo-100 bg-indigo-50/20">
        <CardHeader
          role="button"
          tabIndex={0}
          onClick={() => setArtPlanOpen((v) => !v)}
          className="cursor-pointer select-none pb-3"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setArtPlanOpen((v) => !v);
            }
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <span>Character &amp; Image Consistency</span>
                  {characters.length > 0 && (
                    <Badge variant="secondary" className="bg-indigo-100 text-indigo-800 text-xs">
                      {characters.length} {characters.length === 1 ? 'character' : 'characters'}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Preview or customize character appearance to ensure identical look on every page.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs h-8"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAutoDetectArt();
                }}
                disabled={analyzingArt || isGenerating}
              >
                {analyzingArt ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-indigo-600" />
                    Analyzing Story...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                    Auto-Detect Characters &amp; Scenes
                  </>
                )}
              </Button>
              {artPlanOpen ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </div>
          </div>
        </CardHeader>

        {artPlanOpen && (
          <CardContent className="space-y-5 pt-2">
            {planError && (
              <div className="text-sm bg-red-50 border border-red-200 text-red-700 p-3 rounded-md">
                {planError}
              </div>
            )}

            <div className="p-3 bg-white rounded-lg border border-indigo-100 text-xs text-gray-600 flex items-start gap-2">
              <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <strong>How Character Consistency Works:</strong> Page 1 is generated first to anchor the visual style. Its image buffer is then passed as a direct reference image for all subsequent pages, while repeating the character appearance sheet below in every prompt.
              </div>
            </div>

            {/* Story Setting */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Visual Setting / Environment
              </label>
              <Input
                value={setting}
                onChange={(e) => setSetting(e.target.value)}
                placeholder="e.g. Sunny city park with lush green trees, playground benches, and a wide blue sky"
                disabled={isGenerating}
                className="bg-white text-sm"
              />
            </div>

            {/* Character list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                  Story Characters (1-3)
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddCharacter}
                  disabled={characters.length >= 3 || isGenerating}
                  className="text-xs h-7 text-indigo-700 hover:text-indigo-900"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Character
                </Button>
              </div>

              {characters.length === 0 ? (
                <div className="p-4 text-center bg-white/70 border border-dashed rounded-lg text-xs text-gray-500">
                  No characters defined yet. Click &ldquo;Auto-Detect Characters &amp; Scenes&rdquo; above, or add them manually.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {characters.map((char) => (
                    <div
                      key={char.id}
                      className="p-3 bg-white rounded-lg border border-indigo-100 shadow-2xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <Input
                          value={char.name}
                          onChange={(e) =>
                            handleCharacterChange(char.id, 'name', e.target.value)
                          }
                          placeholder="Character Name (e.g. Leo)"
                          className="h-8 text-sm font-semibold max-w-[200px]"
                          disabled={isGenerating}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveCharacter(char.id)}
                          disabled={isGenerating}
                          className="text-gray-400 hover:text-red-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <Input
                        value={char.description}
                        onChange={(e) =>
                          handleCharacterChange(char.id, 'description', e.target.value)
                        }
                        placeholder="Appearance: age, hair, signature clothing (e.g. 7-year-old boy, curly brown hair, green striped shirt, blue shorts)"
                        className="h-8 text-xs text-gray-700"
                        disabled={isGenerating}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* 4. Options */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={generateQuestions}
              onChange={(e) => setGenerateQuestions(e.target.checked)}
              disabled={isGenerating}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
            />
            <div>
              <span className="text-sm font-medium text-gray-800">
                Generate reading comprehension questions
              </span>
              <p className="text-xs text-gray-500 mt-0.5">
                Automatically creates 2 multiple-choice questions and 1 sequence ordering question based on your story.
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* 5. Progress or Action Bar */}
      {isGenerating ? (
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="py-6 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-blue-900 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                {progress.message || 'Generating illustrated book...'}
              </span>
              <span className="text-xs font-mono text-blue-700">
                {calculateProgressPercent()}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-blue-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${calculateProgressPercent()}%` }}
              />
            </div>

            <div className="grid grid-cols-4 gap-2 text-center text-xs text-gray-500 pt-1">
              <div className={`p-2 rounded ${progress.step === 'planning' ? 'bg-blue-100 text-blue-800 font-semibold' : ''}`}>
                1. Plan Art
              </div>
              <div className={`p-2 rounded ${progress.step === 'page_image' ? 'bg-blue-100 text-blue-800 font-semibold' : ''}`}>
                2. Illustrations {progress.currentPage ? `(${progress.currentPage}/${progress.totalPages})` : ''}
              </div>
              <div className={`p-2 rounded ${progress.step === 'questions' ? 'bg-blue-100 text-blue-800 font-semibold' : ''}`}>
                3. Questions
              </div>
              <div className={`p-2 rounded ${progress.step === 'saving' ? 'bg-blue-100 text-blue-800 font-semibold' : ''}`}>
                4. Save to Library
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              Ready to create your illustrated book?
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Generates watercolor illustrations with character consistency across all pages.
            </p>
          </div>

          <Button
            size="lg"
            onClick={handleGenerateBook}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Generate Illustrated Book
          </Button>
        </div>
      )}

      {/* Error state alert */}
      {progress.step === 'error' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-start gap-3">
          <div className="p-1 bg-red-100 text-red-700 rounded-full shrink-0 mt-0.5">
            <RefreshCw className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold">Generation could not be completed</p>
            <p className="text-xs text-red-700">{progress.error || progress.message}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 text-xs bg-white border-red-300 text-red-800 hover:bg-red-50"
              onClick={handleGenerateBook}
            >
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
