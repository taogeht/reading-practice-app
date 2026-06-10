import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getBook } from './books';
import { type TestDocument, type TestItem, type TestSection } from './test-types';
import { r2Client } from '@/lib/storage/r2-client';

// Standalone HTML for the printable test, rendered to PDF by headless Chromium.
// Self-contained: real print CSS inline, every image inlined as a base64 data
// URI (the renderer has no session, so it can't fetch the auth-gated /api/images
// proxy). This is the server-side equivalent of the on-screen React print view.

const PART_LETTERS = 'ABCDEFGH'.split('');

// Inline speaker glyph — an SVG (not the 🔊 emoji) so it renders without an
// emoji font in the container.
const SPEAKER = `<svg class="speaker" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a7 7 0 0 1 0 14.14"></path></svg>`;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Stable order for circle-the-word choices — same hash the React view uses, so
// the screen and the PDF agree.
function seededOrder(itemId: string, words: string[]): string[] {
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  };
  return [...words].sort((a, b) => hash(itemId + a) - hash(itemId + b));
}

function blank(prompt: string, kind: 'short' | 'long'): string {
  const cls = kind === 'long' ? 'blank-long' : 'blank-short';
  return esc(prompt)
    .split('____')
    .join(`<span class="${cls}">&nbsp;</span>`);
}

function formatAnswer(item: TestItem): string {
  if (item.correctAnswer === 'true') return 'True';
  if (item.correctAnswer === 'false') return 'False';
  return item.correctAnswer;
}

function mimeForExt(name: string): string {
  const ext = (name.split('.').pop() || 'png').toLowerCase();
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}

// Inlines an image reference as a base64 data URI (the renderer has no session,
// so it can't fetch URLs). Handles both Gemini scenes served from R2
// (/api/images/<key>) and book picture-dictionary art served statically from
// public/ (/images/...). Returns '' on any miss so a broken image never sinks
// the whole render.
async function imageDataUri(imageUrl: string | null | undefined): Promise<string> {
  if (!imageUrl) return '';

  const apiMarker = '/api/images/';
  const apiIdx = imageUrl.indexOf(apiMarker);
  if (apiIdx !== -1) {
    const key = imageUrl.slice(apiIdx + apiMarker.length);
    const obj = await r2Client.getObjectBuffer(key);
    if (!obj) return '';
    return `data:${obj.contentType || 'image/png'};base64,${obj.buffer.toString('base64')}`;
  }

  // Static book art under public/ (e.g. /images/unit-13/bed.png).
  if (imageUrl.startsWith('/images/') || imageUrl.startsWith('images/')) {
    try {
      const abs = path.join(process.cwd(), 'public', imageUrl.replace(/^\//, ''));
      const buf = await readFile(abs);
      return `data:${mimeForExt(imageUrl)};base64,${buf.toString('base64')}`;
    } catch {
      return '';
    }
  }
  return '';
}

function itemBody(
  item: TestItem,
  type: TestSection['type'],
  imgFor: (p: string) => string,
): string {
  const choices = seededOrder(item.id, [item.correctAnswer, ...item.distractors])
    .map((c) => `<span>${esc(c)}</span>`)
    .join('');

  switch (type) {
    case 'circle_word':
      return `<div>${blank(item.prompt, 'short')}</div><div class="choices">${choices}</div>`;
    case 'write_word':
      return `<div>${blank(item.prompt, 'long')}</div>`;
    case 'true_false':
      return `<div class="tf-row"><span>${esc(item.prompt)}</span><span class="tf">True&nbsp;&nbsp;/&nbsp;&nbsp;False</span></div>`;
    case 'unscramble':
      return `<div>${(item.tokens ?? []).map((t) => `<span class="token">${esc(t)}</span>`).join('')}</div><div class="writeline"></div>`;
    case 'listen_circle_word':
      return `<div class="listen">${SPEAKER}<div class="choices">${choices}</div></div>`;
    case 'listen_true_false':
      return `<div class="listen">${SPEAKER}<span class="tf">True&nbsp;&nbsp;/&nbsp;&nbsp;False</span></div>`;
    // Book picture-dictionary art. picture_write/picture_match render the single
    // picture via the thumb block; listen_picture lays the choice pictures in a row.
    case 'picture_write':
      return `<div class="writeline"></div>`;
    case 'picture_match':
      return `<div class="choices">${choices}</div>`;
    case 'listen_picture': {
      const pics = (item.pictureChoices ?? [])
        .map((c) => {
          const uri = imgFor(c.image);
          return uri ? `<img class="pic-choice" src="${uri}" alt="" />` : '';
        })
        .join('');
      return `<div class="listen">${SPEAKER}<div class="pic-row">${pics}</div></div>`;
    }
    default:
      return '';
  }
}

const STYLE = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111827; font-size: 13pt; line-height: 1.5; }
  .header { border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .title { font-size: 17pt; font-weight: 700; margin: 0 0 4px; }
  .subtitle { font-size: 10pt; color: #4b5563; }
  .namebox { font-size: 11pt; text-align: right; white-space: nowrap; }
  .namebox div { margin-bottom: 10px; }
  .part { margin-bottom: 18px; }
  .part-title { font-weight: 700; margin: 0 0 8px; }
  .item { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 14px; page-break-inside: avoid; }
  .num { font-weight: 700; min-width: 20px; }
  .thumb { width: 90px; height: 90px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 6px; flex: 0 0 auto; background: #fff; }
  .body { flex: 1; }
  .blank-short { display: inline-block; min-width: 54px; border-bottom: 1px solid #111827; }
  .blank-long { display: inline-block; min-width: 140px; border-bottom: 1px solid #111827; }
  .choices { display: flex; flex-wrap: wrap; gap: 6px 26px; margin-top: 6px; }
  .tf-row { display: flex; gap: 24px; align-items: center; }
  .tf { white-space: nowrap; }
  .token { display: inline-block; border: 1px solid #d1d5db; border-radius: 4px; padding: 1px 8px; margin: 0 8px 4px 0; font-size: 11pt; }
  .writeline { border-bottom: 1px solid #111827; height: 20px; margin-top: 6px; }
  .listen { display: flex; align-items: center; gap: 12px; }
  .speaker { width: 16px; height: 16px; color: #374151; flex: 0 0 auto; }
  .pic-row { display: flex; gap: 16px; flex-wrap: wrap; }
  .pic-choice { width: 84px; height: 84px; object-fit: contain; border: 1px solid #d1d5db; border-radius: 8px; background: #fff; padding: 4px; }
  .answer-key { page-break-before: always; border-top: 2px solid #111827; padding-top: 16px; }
  .answer-key h2 { margin: 0 0 10px; }
  .answer-grid { columns: 3; column-gap: 24px; font-size: 11pt; }
  .answer-grid div { break-inside: avoid; margin-bottom: 3px; }
  .answer-grid .an { color: #6b7280; font-weight: 700; margin-right: 6px; }
`;

export type TestForHtml = {
  title: string;
  bookSlug: string;
  units: number[];
  document: TestDocument;
};

export async function renderTestHtml(test: TestForHtml): Promise<string> {
  const book = getBook(test.bookSlug);
  const unitsLabel = [...test.units].sort((a, b) => a - b).join(', ');

  // Inline every distinct image up front (parallel), keyed by its url/path —
  // item pictures (Gemini scenes or single book pics) AND picture-choice art.
  const allItems = test.document.sections.flatMap((s) => s.items);
  const refs = new Set<string>();
  for (const it of allItems) {
    if (it.imageUrl) refs.add(it.imageUrl);
    for (const c of it.pictureChoices ?? []) refs.add(c.image);
  }
  const dataUris = new Map<string, string>();
  await Promise.all(
    [...refs].map(async (ref) => {
      const uri = await imageDataUri(ref);
      if (uri) dataUris.set(ref, uri);
    }),
  );
  const imgFor = (p: string) => dataUris.get(p) ?? '';

  let n = 0;
  const numbered = test.document.sections.map((section) => ({
    section,
    items: section.items.map((item) => ({ item, number: ++n })),
  }));

  const sectionsHtml = numbered
    .map(({ section, items }, si) => {
      const rows = items
        .map(({ item, number }) => {
          const thumbUri = item.imageUrl ? imgFor(item.imageUrl) : '';
          const thumb = thumbUri ? `<img class="thumb" src="${thumbUri}" alt="" />` : '';
          return `<div class="item"><span class="num">${number}.</span>${thumb}<div class="body">${itemBody(item, section.type, imgFor)}</div></div>`;
        })
        .join('');
      return `<div class="part"><div class="part-title">Part ${PART_LETTERS[si] ?? si + 1} — ${esc(section.instruction)}</div>${rows}</div>`;
    })
    .join('');

  const answerHtml = numbered
    .flatMap(({ items }) =>
      items.map(
        ({ item, number }) =>
          `<div><span class="an">${number}.</span>${esc(formatAnswer(item))}</div>`,
      ),
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>${STYLE}</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">${esc(test.title)}</div>
      <div class="subtitle">${esc(book?.title ?? test.bookSlug)} · Unit${test.units.length > 1 ? 's' : ''} ${esc(unitsLabel)}</div>
    </div>
    <div class="namebox">
      <div>Name: ____________</div>
      <div>Date: ____________</div>
    </div>
  </div>
  ${sectionsHtml}
  <div class="answer-key">
    <h2>Answer Key</h2>
    <div class="answer-grid">${answerHtml}</div>
  </div>
</body>
</html>`;
}
