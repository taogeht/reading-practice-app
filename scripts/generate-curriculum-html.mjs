// Builds a single self-contained, styled HTML reference of a book's full
// curriculum from its per-unit JSON files in src/lib/curriculum/<slug>/.
//
// Usage:
//   node scripts/generate-curriculum-html.mjs [book-slug] [Title]
//   node scripts/generate-curriculum-html.mjs family-friends-2 "Family and Friends 2"
//
// Output: <slug>-curriculum.html at the repo root. No external assets — open
// it straight in a browser. Re-runnable; safe for books 3–5 as they're authored.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SLUG = process.argv[2] || 'family-friends-2';
const TITLE = process.argv[3] || 'Family and Friends 2';

const CURRICULUM_DIR = path.join(process.cwd(), 'src', 'lib', 'curriculum', SLUG);
const OUT = path.join(process.cwd(), `${SLUG}-curriculum.html`);

// Color names → swatch hex, so the `colors` word bank shows actual color chips.
const COLOR_HEX = {
  red: '#e23b3b', green: '#3aa655', blue: '#3b6fe2', yellow: '#f2c200',
  pink: '#f06ba8', purple: '#8a4fc4', black: '#2b2b2b', white: '#ffffff',
  brown: '#9b6a3f', orange: '#f08a24', gray: '#9aa0a6', grey: '#9aa0a6',
  blond: '#e6c373',
};

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

async function loadUnits() {
  const names = (await readdir(CURRICULUM_DIR)).filter((n) => /^unit-\d+\.json$/.test(n));
  const units = [];
  for (const n of names) {
    const json = JSON.parse(await readFile(path.join(CURRICULUM_DIR, n), 'utf-8'));
    units.push(json);
  }
  units.sort((a, b) => a.unit - b.unit);
  return units;
}

function chips(words, opts = {}) {
  if (!words || words.length === 0) return '';
  return `<div class="chips">${words
    .map((w) => {
      if (opts.color) {
        const hex = COLOR_HEX[String(w).toLowerCase()];
        const sw = hex ? `<span class="sw" style="background:${hex}"></span>` : '';
        return `<span class="chip">${sw}${esc(w)}</span>`;
      }
      return `<span class="chip">${esc(w)}</span>`;
    })
    .join('')}</div>`;
}

function wordBank(label, words, opts) {
  if (!words || words.length === 0) return '';
  return `<div class="bank"><span class="bank-label">${esc(label)}</span>${chips(words, opts)}</div>`;
}

function grammarBlock(patterns) {
  if (!patterns || patterns.length === 0) return '';
  const items = patterns
    .map((p) => {
      const ex = (p.examples || [])
        .map((e) => `<li>${esc(e)}</li>`)
        .join('');
      return `<div class="pattern">
        <div class="pattern-head">${esc(p.pattern)}</div>
        ${ex ? `<ul class="examples">${ex}</ul>` : ''}
      </div>`;
    })
    .join('');
  return `<div class="field">
    <h3 class="field-title">Grammar patterns <span class="count">${patterns.length}</span></h3>
    <div class="patterns">${items}</div>
  </div>`;
}

function phonicsBlock(ph) {
  if (!ph) return '';
  const fams = (ph.word_families || [])
    .map((f) => {
      const ws = (f.words || [])
        .map((w) => `<span class="chip phon">${w.emoji ? `<span class="emoji">${w.emoji}</span>` : ''}${esc(w.word)}</span>`)
        .join('');
      return `<div class="fam"><span class="fam-label">${esc(f.family)}</span><div class="chips">${ws}</div></div>`;
    })
    .join('');
  const chant = (ph.chant || []).length
    ? `<div class="chant">${ph.chant.map((l) => `<div class="chant-line">${esc(l)}</div>`).join('')}</div>`
    : '';
  return `<div class="field phonics">
    <h3 class="field-title">Phonics <span class="sound-badge">${esc(ph.sound)}</span></h3>
    ${ph.description ? `<p class="desc">${esc(ph.description)}</p>` : ''}
    ${fams ? `<div class="fams">${fams}</div>` : '<p class="muted">No word families (recognition only — no generated phonics questions).</p>'}
    ${chant ? `<div class="field-sub">Chant</div>${chant}` : ''}
  </div>`;
}

function keySentences(sents) {
  if (!sents || sents.length === 0) return '';
  return `<div class="field">
    <h3 class="field-title">Key sentences</h3>
    <ul class="key-sentences">${sents.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
  </div>`;
}

function unitSection(u) {
  const vocabWords = (u.vocabulary || []).map((v) => v.word);
  const banks = [
    wordBank('Vocabulary', vocabWords),
    wordBank('Verbs', u.verbs),
    wordBank('Adjectives', u.adjectives),
    wordBank('Numbers', u.numbers),
    wordBank('Colors', u.colors, { color: true }),
    wordBank('Prepositions', u.prepositions),
  ].join('');

  return `<section class="unit" id="unit-${u.unit}">
    <header class="unit-head">
      <span class="unit-num">${u.unit}</span>
      <h2 class="unit-topic">${esc(u.topic)}</h2>
      <a class="top-link" href="#top">↑ top</a>
    </header>
    <div class="unit-body">
      ${banks ? `<div class="field"><h3 class="field-title">Words</h3>${banks}</div>` : ''}
      ${grammarBlock(u.grammar_patterns)}
      ${keySentences(u.key_sentences)}
      ${phonicsBlock(u.phonics)}
    </div>
  </section>`;
}

function toc(units) {
  return `<nav class="toc">${units
    .map(
      (u) =>
        `<a class="toc-item" href="#unit-${u.unit}"><span class="toc-num">${u.unit}</span><span class="toc-topic">${esc(u.topic)}</span></a>`,
    )
    .join('')}</nav>`;
}

function page(units) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(TITLE)} — Curriculum Reference</title>
<style>
  :root {
    --bg: #f5f6f8;
    --card: #ffffff;
    --ink: #1f2430;
    --muted: #6b7280;
    --line: #e6e8ee;
    --accent: #4f46e5;
    --accent-soft: #eef0fd;
    --grammar: #0e7490;
    --grammar-soft: #e0f2f5;
    --phonics: #b45309;
    --phonics-soft: #fdf1e1;
    --key: #15803d;
    --key-soft: #e7f5ec;
    --radius: 14px;
    --shadow: 0 1px 2px rgba(16,24,40,.06), 0 4px 14px rgba(16,24,40,.06);
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink);
    background: var(--bg);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 940px; margin: 0 auto; padding: 0 20px 80px; }

  header.cover {
    background: linear-gradient(135deg, #4f46e5 0%, #7c5cf0 55%, #9d6ff0 100%);
    color: #fff;
    padding: 56px 20px 48px;
    text-align: center;
  }
  .cover h1 { margin: 0; font-size: 40px; letter-spacing: -.02em; font-weight: 800; }
  .cover .sub { margin-top: 8px; font-size: 17px; opacity: .92; font-weight: 500; }
  .cover .meta { margin-top: 18px; font-size: 13px; opacity: .85; }
  .cover .meta span { display: inline-block; padding: 4px 12px; background: rgba(255,255,255,.16); border-radius: 999px; margin: 0 4px; }

  .toc {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 10px; margin: 28px 0 36px;
  }
  .toc-item {
    display: flex; align-items: center; gap: 10px;
    background: var(--card); border: 1px solid var(--line); border-radius: 12px;
    padding: 10px 12px; text-decoration: none; color: var(--ink);
    box-shadow: var(--shadow); transition: transform .08s ease, border-color .08s ease;
  }
  .toc-item:hover { transform: translateY(-1px); border-color: var(--accent); }
  .toc-num {
    flex: none; width: 30px; height: 30px; border-radius: 8px;
    background: var(--accent-soft); color: var(--accent);
    display: grid; place-items: center; font-weight: 700; font-size: 14px;
  }
  .toc-topic { font-size: 14px; font-weight: 600; }

  .unit {
    background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
    box-shadow: var(--shadow); margin-bottom: 22px; overflow: hidden;
  }
  .unit-head {
    display: flex; align-items: center; gap: 14px;
    padding: 16px 22px; border-bottom: 1px solid var(--line);
    background: linear-gradient(0deg, #fafbff, #ffffff);
    position: relative;
  }
  .unit-num {
    flex: none; width: 40px; height: 40px; border-radius: 10px;
    background: var(--accent); color: #fff;
    display: grid; place-items: center; font-weight: 800; font-size: 18px;
  }
  .unit-topic { margin: 0; font-size: 21px; font-weight: 750; letter-spacing: -.01em; }
  .top-link { margin-left: auto; font-size: 12px; color: var(--muted); text-decoration: none; }
  .top-link:hover { color: var(--accent); }
  .unit-body { padding: 18px 22px 22px; }

  .field { margin-top: 18px; }
  .field:first-child { margin-top: 0; }
  .field-title {
    margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em;
    color: var(--muted); font-weight: 700; display: flex; align-items: center; gap: 8px;
  }
  .field-title .count {
    background: var(--accent-soft); color: var(--accent); font-size: 11px;
    padding: 1px 7px; border-radius: 999px; letter-spacing: 0;
  }
  .field-sub { margin: 12px 0 6px; font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }

  .bank { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
  .bank-label {
    flex: none; min-width: 96px; font-size: 12px; font-weight: 700; color: var(--muted);
    text-align: right; padding-top: 3px;
  }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: #f1f3f7; border: 1px solid #e7eaf1; color: #2b3140;
    padding: 3px 10px; border-radius: 999px; font-size: 13.5px; font-weight: 500;
  }
  .chip .sw { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(0,0,0,.15); display: inline-block; }
  .chip.phon { background: var(--phonics-soft); border-color: #f3e2c9; color: #7a4a08; }
  .chip .emoji { font-size: 14px; }

  .patterns { display: grid; gap: 10px; }
  .pattern { border: 1px solid var(--grammar-soft); border-left: 3px solid var(--grammar); border-radius: 10px; padding: 10px 14px; background: #fbfeff; }
  .pattern-head { font-weight: 700; color: var(--grammar); font-size: 15px; }
  .examples { margin: 8px 0 2px; padding-left: 18px; }
  .examples li { font-size: 14px; margin: 2px 0; color: #2b3140; }

  .key-sentences { margin: 0; padding-left: 18px; }
  .key-sentences li { font-size: 14.5px; margin: 4px 0; }
  .key-sentences li::marker { color: var(--key); }

  .phonics { border-top: 1px dashed var(--line); padding-top: 18px; }
  .sound-badge {
    background: var(--phonics-soft); color: var(--phonics); font-size: 12px;
    padding: 2px 10px; border-radius: 999px; letter-spacing: 0; font-weight: 700; text-transform: none;
  }
  .desc { margin: 0 0 10px; font-size: 14px; color: #444b59; }
  .fams { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 6px; }
  .fam { }
  .fam-label {
    display: inline-block; font-weight: 800; color: var(--phonics);
    font-size: 13px; margin-bottom: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .chant {
    background: var(--phonics-soft); border-radius: 10px; padding: 12px 16px;
    font-style: italic; color: #6b4410; font-size: 14px;
  }
  .chant-line { margin: 1px 0; }
  .muted { color: var(--muted); font-size: 13.5px; font-style: italic; }

  footer { text-align: center; color: var(--muted); font-size: 12.5px; padding: 24px 0 0; }
  @media (max-width: 560px) {
    .bank-label { text-align: left; min-width: 0; }
    .cover h1 { font-size: 30px; }
  }
</style>
</head>
<body>
<a id="top"></a>
<header class="cover">
  <h1>${esc(TITLE)}</h1>
  <div class="sub">Complete Curriculum Reference</div>
  <div class="meta">
    <span>${units.length} units (${units[0].unit}–${units[units.length - 1].unit})</span>
    <span>${SLUG}</span>
    <span>Generated ${dateStr}</span>
  </div>
</header>
<div class="wrap">
  ${toc(units)}
  ${units.map(unitSection).join('\n')}
  <footer>Generated from <code>src/lib/curriculum/${esc(SLUG)}/</code> — distilled vocabulary, grammar, key sentences &amp; phonics per unit.</footer>
</div>
</body>
</html>`;
}

const units = await loadUnits();
await writeFile(OUT, page(units), 'utf-8');
console.log(`Wrote ${OUT} (${units.length} units: ${units.map((u) => u.unit).join(', ')})`);
