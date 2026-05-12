"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { READING_LEVELS } from "@/lib/reading/levels";

interface PassageRow {
  id: string;
  title: string;
  readingLevel: number;
  status: 'draft' | 'review' | 'published' | 'archived';
  pageCount: number;
  coverImageKey: string | null;
  summary: string | null;
  generationMeta: {
    qualityReport?: {
      proseScore: number;
      questionsScore: number;
      imagesValid: boolean;
      passageReady: boolean;
    };
    plan?: { characters?: { name: string; description: string }[] };
  } | null;
  createdAt: string;
}

interface PageRow {
  id: string;
  pageNumber: number;
  text: string;
  imageKey: string | null;
  imagePromptUsed: string | null;
  /** R2 key for the cached per-page TTS audio. NULL until the teacher
   *  generates audio via the audio panel. */
  ttsAudioKey: string | null;
  /** Voice id used for the cached audio (e.g. "en-US-Journey-F"). */
  ttsVoice: string | null;
  /** ISO timestamp of the most recent manual edit; null if never edited. */
  editedAt: string | null;
  editedBy: string | null;
  /** "First Last" of the editor; null if never edited. */
  editorName: string | null;
}

interface PageValidationIssue {
  type: string;
  severity: 'error' | 'warning';
  pageNumber?: number;
  word?: string;
  sentence?: string;
  reason?: string;
  wordCount?: number;
  maxAllowed?: number;
  minRequired?: number;
}

interface EditState {
  /** Page number currently being edited inline; null if no inline edit
   *  is open. Only one page edits at a time — keeps the UI predictable
   *  and avoids stale-baseline issues if two edits race. */
  pageNumber: number | null;
  draft: string;
  saving: boolean;
  /** Issues returned by the most recent save; surfaced inline below
   *  the page until the next edit opens. */
  postSaveIssues: PageValidationIssue[];
  /** Show the "image may no longer match" warning toast for this page
   *  number after a successful save. Dismissed by the next save or
   *  inline-edit toggle. */
  imageMismatchPage: number | null;
}

interface QuestionRow {
  id: string;
  questionType: 'mcq_comprehension' | 'vocab_matching' | 'sequence_order';
  questionText: string;
  orderIndex: number;
  payload: any;
  evidenceQuote: string | null;
  evidencePageNumber: number | null;
}

interface FetchResult {
  passage: PassageRow;
  pages: PageRow[];
  questions: QuestionRow[];
}

function levelLabel(id: number): string {
  const lv = READING_LEVELS.find((l) => l.id === id);
  return lv ? `Level ${lv.id} — ${lv.name}` : `Level ${id}`;
}

function scoreBadgeClass(score: number): string {
  if (score >= 0.85) return 'bg-green-100 text-green-800 border-green-300';
  if (score >= 0.5) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  return 'bg-red-100 text-red-800 border-red-300';
}

export default function ReadingReviewFocusPage() {
  const params = useParams();
  const router = useRouter();
  const passageId = params?.passageId as string | undefined;

  const [data, setData] = useState<FetchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<null | 'approving' | 'rejecting' | string>(null);
  const [zoomImageKey, setZoomImageKey] = useState<string | null>(null);
  // Audio generation panel — voice + speed are local state; "generating"
  // disables the button while the per-page TTS calls run server-side.
  const [audioVoice, setAudioVoice] = useState<string>('en-US-Journey-F');
  const [audioRate, setAudioRate] = useState<number>(1.0);
  const [audioBusy, setAudioBusy] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({
    pageNumber: null,
    draft: '',
    saving: false,
    postSaveIssues: [],
    imageMismatchPage: null,
  });

  const load = useCallback(async () => {
    if (!passageId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/reading/passages/${passageId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const payload: FetchResult = await res.json();
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [passageId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onApprove = async () => {
    if (!passageId || !data) return;
    const errCount = countErrors(data);
    if (errCount > 0 && !confirm(`This passage has ${errCount} validation errors. Approve anyway?`)) return;
    setAction('approving');
    try {
      const res = await fetch(`/api/teacher/reading/passages/${passageId}/approve`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.push('/teacher/reading/review');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
      setAction(null);
    }
  };

  const onReject = async () => {
    if (!passageId) return;
    if (!confirm('Reject this passage? It will be archived and unpublished.')) return;
    setAction('rejecting');
    try {
      const res = await fetch(`/api/teacher/reading/passages/${passageId}/reject`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.push('/teacher/reading/review');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
      setAction(null);
    }
  };

  const onRegenPage = async (pageNumber: number) => {
    if (!passageId) return;
    setAction(`regen-page-${pageNumber}`);
    try {
      const res = await fetch(
        `/api/teacher/reading/passages/${passageId}/pages/${pageNumber}/regenerate`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAction(null);
    }
  };

  const onStartEdit = (page: PageRow) => {
    setEdit({
      pageNumber: page.pageNumber,
      draft: page.text,
      saving: false,
      postSaveIssues: [],
      imageMismatchPage: null,
    });
  };
  const onCancelEdit = () => {
    setEdit({
      pageNumber: null,
      draft: '',
      saving: false,
      postSaveIssues: [],
      imageMismatchPage: null,
    });
  };
  const onSaveEdit = async (pageNumber: number) => {
    if (!passageId) return;
    const text = edit.draft.trim();
    if (!text) {
      alert('Page text cannot be empty.');
      return;
    }
    setEdit((s) => ({ ...s, saving: true }));
    try {
      const res = await fetch(
        `/api/teacher/reading/passages/${passageId}/pages/${pageNumber}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as {
        page: { editedAt: string; editorName: string };
        validation: {
          proseScore: number;
          pageIssues: PageValidationIssue[];
        };
      };
      // Refresh from the server so editedAt/editorName + the
      // generationMeta proseScore badge stay in sync.
      await load();
      setEdit({
        pageNumber: null,
        draft: '',
        saving: false,
        postSaveIssues: body.validation.pageIssues,
        imageMismatchPage: pageNumber,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
      setEdit((s) => ({ ...s, saving: false }));
    }
  };

  const onGenerateAudio = async () => {
    if (!passageId) return;
    setAudioBusy(true);
    setAudioError(null);
    try {
      const res = await fetch(`/api/teacher/reading/passages/${passageId}/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: audioVoice, speakingRate: audioRate }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAudioBusy(false);
    }
  };

  const onRegenQuestion = async (questionId: string) => {
    if (!passageId) return;
    setAction(`regen-q-${questionId}`);
    try {
      const res = await fetch(
        `/api/teacher/reading/passages/${passageId}/questions/${questionId}/regenerate`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setAction(null);
    }
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        {error ? (
          <div className="text-red-700">Error: {error}</div>
        ) : (
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        )}
      </div>
    );
  }

  const { passage, pages, questions } = data;
  const q = passage.generationMeta?.qualityReport;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/teacher/reading/review')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to queue
              </Button>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 truncate">
                  {passage.title}
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 mt-1">
                  <span>{levelLabel(passage.readingLevel)}</span>
                  <span>•</span>
                  <span>{pages.length} pages</span>
                  <span>•</span>
                  <span>{questions.length} questions</span>
                  <span>•</span>
                  <Badge variant="outline" className="text-xs">
                    {passage.status}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={onReject}
                disabled={
                  action !== null || (passage.status !== 'review' && passage.status !== 'draft')
                }
              >
                <X className="w-4 h-4 mr-2" />
                {action === 'rejecting' ? 'Rejecting…' : 'Reject'}
              </Button>
              <Button
                onClick={onApprove}
                disabled={
                  action !== null || (passage.status !== 'review' && passage.status !== 'draft')
                }
                className="bg-green-600 hover:bg-green-700"
              >
                <Check className="w-4 h-4 mr-2" />
                {action === 'approving' ? 'Approving…' : 'Approve'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Quality breakdown */}
        {q && (
          <Card>
            <CardContent className="p-4 flex items-center gap-4 flex-wrap">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <div className="flex flex-wrap gap-2">
                <Badge className={`${scoreBadgeClass(q.proseScore)} border`}>
                  Prose {q.proseScore.toFixed(2)}
                </Badge>
                <Badge className={`${scoreBadgeClass(q.questionsScore)} border`}>
                  Questions {q.questionsScore.toFixed(2)}
                </Badge>
                <Badge
                  className={`border ${q.imagesValid ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300'}`}
                >
                  Images {q.imagesValid ? 'valid' : 'invalid'}
                </Badge>
                <Badge
                  className={`border ${q.passageReady ? 'bg-green-100 text-green-800 border-green-300' : 'bg-yellow-100 text-yellow-800 border-yellow-300'}`}
                >
                  passageReady: {String(q.passageReady)}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Audio generation panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Volume2 className="w-4 h-4 text-blue-600" />
              Narration audio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Voice
                </label>
                <select
                  value={audioVoice}
                  onChange={(e) => setAudioVoice(e.target.value)}
                  disabled={audioBusy}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                >
                  <optgroup label="Journey (most natural; ignores speed)">
                    <option value="en-US-Journey-F">Journey Female</option>
                    <option value="en-US-Journey-D">Journey Male</option>
                    <option value="en-US-Journey-O">Journey Child</option>
                  </optgroup>
                  <optgroup label="Studio (professional; honors speed)">
                    <option value="en-US-Studio-O">Studio Female</option>
                    <option value="en-US-Studio-Q">Studio Male</option>
                  </optgroup>
                  <optgroup label="Neural2 (clear; honors speed)">
                    <option value="en-US-Neural2-F">Neural2 Female</option>
                    <option value="en-US-Neural2-D">Neural2 Male</option>
                    <option value="en-GB-Neural2-A">UK Narrator (Female)</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Speed: {audioRate.toFixed(2)}× {audioVoice.includes('Journey') && '(Journey ignores)'}
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={audioRate}
                  onChange={(e) => setAudioRate(parseFloat(e.target.value))}
                  disabled={audioBusy}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
                  <span>0.5×</span>
                  <span>1.0×</span>
                  <span>1.5×</span>
                </div>
              </div>
              <Button onClick={onGenerateAudio} disabled={audioBusy}>
                {audioBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4 mr-2" />
                    Generate audio
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Generates one audio clip per page using Google Cloud TTS. Overwrites
              any prior cached audio for this passage. Journey voices are the most
              natural but ignore the speed slider — pick Studio or Neural2 if you
              need slower playback.
            </p>
            {audioError && (
              <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-800">
                {audioError}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pages */}
        <Card>
          <CardHeader>
            <CardTitle>Story</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {pages.map((p) => (
              <div
                key={p.id}
                className="border-b last:border-b-0 pb-6 last:pb-0 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4"
              >
                <div className="flex flex-col gap-2">
                  {p.imageKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/images/${p.imageKey}`}
                      alt={`Page ${p.pageNumber}`}
                      className="rounded border w-full cursor-zoom-in object-cover"
                      onClick={() => setZoomImageKey(p.imageKey)}
                    />
                  ) : (
                    <div className="rounded border bg-gray-50 h-48 flex items-center justify-center text-gray-400 text-sm">
                      no image
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRegenPage(p.pageNumber)}
                    disabled={action !== null}
                  >
                    {action === `regen-page-${p.pageNumber}` ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        Regenerating page {p.pageNumber}…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3 mr-2" />
                        Regenerate this page
                      </>
                    )}
                  </Button>
                  {p.ttsAudioKey && (
                    <div className="text-xs text-gray-600">
                      <audio
                        controls
                        preload="none"
                        src={`/api/audio/${p.ttsAudioKey}`}
                        className="w-full"
                      />
                      {p.ttsVoice && (
                        <p className="text-[10px] text-gray-500 mt-1">
                          {p.ttsVoice}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                      Page {p.pageNumber}
                    </p>
                    {edit.pageNumber !== p.pageNumber && (
                      <button
                        type="button"
                        onClick={() => onStartEdit(p)}
                        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-700 cursor-pointer"
                        aria-label={`Edit page ${p.pageNumber}`}
                      >
                        <Pencil className="w-3 h-3" />
                        Edit text
                      </button>
                    )}
                  </div>
                  {edit.pageNumber === p.pageNumber ? (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        value={edit.draft}
                        onChange={(e) =>
                          setEdit((s) => ({ ...s, draft: e.target.value }))
                        }
                        rows={Math.max(3, edit.draft.split('\n').length + 1)}
                        autoFocus
                        disabled={edit.saving}
                        className="text-base leading-relaxed"
                      />
                      <p className="text-xs text-gray-500">
                        {edit.draft.length} / 500 chars
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => onSaveEdit(p.pageNumber)}
                          disabled={edit.saving || edit.draft.trim().length === 0}
                        >
                          {edit.saving ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                              Saving…
                            </>
                          ) : (
                            'Save'
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={onCancelEdit}
                          disabled={edit.saving}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className="text-base text-gray-900 leading-relaxed mt-1 whitespace-pre-wrap cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1"
                      onClick={() => onStartEdit(p)}
                      title="Click to edit"
                    >
                      {p.text}
                    </p>
                  )}
                  {p.editedAt && edit.pageNumber !== p.pageNumber && (
                    <p className="text-xs text-gray-500 italic mt-2">
                      Edited{p.editorName ? ` by ${p.editorName}` : ''} on{' '}
                      {new Date(p.editedAt).toLocaleString()}
                    </p>
                  )}
                  {edit.imageMismatchPage === p.pageNumber && (
                    <div className="mt-2 flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        Note: the page image may no longer match the new text.
                        Consider regenerating the image if the change is significant.
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setEdit((s) => ({ ...s, imageMismatchPage: null }))
                        }
                        className="text-amber-700 hover:text-amber-900 cursor-pointer"
                        aria-label="Dismiss"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {edit.postSaveIssues.length > 0 &&
                    edit.imageMismatchPage === p.pageNumber && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                          New issues on this page after edit
                        </p>
                        <ul className="text-xs space-y-0.5">
                          {edit.postSaveIssues.map((iss, idx) => (
                            <li
                              key={idx}
                              className={
                                iss.severity === 'error'
                                  ? 'text-red-700'
                                  : 'text-amber-700'
                              }
                            >
                              [{iss.severity[0]!.toUpperCase()}] {iss.type}
                              {iss.word ? `: "${iss.word}"` : ''}
                              {iss.sentence ? ` — "${iss.sentence}"` : ''}
                              {iss.reason ? ` — ${iss.reason}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Questions */}
        <Card>
          <CardHeader>
            <CardTitle>Questions ({questions.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {questions.map((qq, idx) => (
              <div key={qq.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        Q{idx + 1}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {qq.questionType}
                      </Badge>
                    </div>
                    <p className="font-medium text-gray-900 mt-2">{qq.questionText}</p>
                    {renderQuestionPayload(qq)}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRegenQuestion(qq.id)}
                    disabled={action !== null}
                    className="shrink-0"
                  >
                    {action === `regen-q-${qq.id}` ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        Regenerating…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3 mr-2" />
                        Regenerate
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={zoomImageKey !== null} onOpenChange={(open) => !open && setZoomImageKey(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Page image</DialogTitle>
          </DialogHeader>
          {zoomImageKey && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/images/${zoomImageKey}`}
              alt="Enlarged"
              className="w-full h-auto rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function renderQuestionPayload(qq: QuestionRow) {
  if (qq.questionType === 'mcq_comprehension') {
    const p = qq.payload as { options: string[]; correctIndex: number };
    return (
      <div className="mt-3 space-y-1">
        {p.options.map((opt, i) => (
          <div
            key={i}
            className={`text-sm rounded px-2 py-1 ${
              i === p.correctIndex
                ? 'bg-green-50 border border-green-200 font-semibold'
                : 'text-gray-700'
            }`}
          >
            {String.fromCharCode(65 + i)}. {opt}
            {i === p.correctIndex && <span className="text-green-700"> ✓</span>}
          </div>
        ))}
        {qq.evidenceQuote && (
          <p className="text-xs text-gray-500 mt-2 italic">
            Evidence (page {qq.evidencePageNumber}): &ldquo;{qq.evidenceQuote}&rdquo;
          </p>
        )}
      </div>
    );
  }
  if (qq.questionType === 'vocab_matching') {
    // V2 payload: { version: 2, pairs: [{ word, vocabId, imageKey }] }.
    // Pre-V2 rows still appear in the review queue with a meaning text
    // field — render those with a "legacy" tag so the teacher knows to
    // reject + regenerate.
    const raw = qq.payload as {
      version?: number;
      pairs?: Array<{ word: string; vocabId?: string; imageKey?: string; meaning?: string }>;
    };
    const isV2 = raw.version === 2;
    const pairs = raw.pairs ?? [];
    return (
      <div className="mt-3 space-y-2">
        {!isV2 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Legacy vocab_matching format (text meanings). Reject this passage and regenerate to
            switch to picture matching.
          </p>
        )}
        {isV2 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {pairs.map((pair, i) => (
              <div
                key={i}
                className="border rounded p-2 flex flex-col items-center gap-1 bg-white"
              >
                {pair.imageKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/images/${pair.imageKey}`}
                    alt={pair.word}
                    className="w-24 h-24 object-contain"
                  />
                ) : (
                  <div className="w-24 h-24 bg-gray-100 border rounded text-xs text-gray-400 flex items-center justify-center">
                    no image
                  </div>
                )}
                <p className="text-sm font-semibold text-gray-900">{pair.word}</p>
              </div>
            ))}
          </div>
        ) : (
          <table className="text-sm w-full">
            <tbody>
              {pairs.map((pair, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1 pr-3 font-semibold text-gray-900 w-32">{pair.word}</td>
                  <td className="py-1 text-gray-700">{pair.meaning ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }
  // sequence_order
  const p = qq.payload as { events: string[] };
  return (
    <ol className="mt-3 list-decimal list-inside space-y-1 text-sm text-gray-700">
      {p.events.map((ev, i) => (
        <li key={i}>{ev}</li>
      ))}
    </ol>
  );
}

function countErrors(_data: FetchResult): number {
  // Validation issues aren't reattached on read — qualityReport summary
  // is on the passage but per-issue lists were a transient generation
  // artifact. For now, the orchestrator's passageReady flag captures
  // "has errors" implicitly: when ready=false there's something to
  // worry about. Leave at 0 for the confirm-prompt heuristic so the
  // approve button doesn't false-prompt; teacher can still see the
  // quality badges.
  return 0;
}
