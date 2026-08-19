// Converts a printable spelling-list HTML file into the structured
// spelling.json that lives beside the unit curriculum in
// src/lib/curriculum/<book-slug>/.
//
// WHY: the HTML is the artifact teachers print. It is not a data source — you
// cannot translate it, import it, or diff it usefully. This lifts the same
// content into JSON so the importer, the translator, and code review all work
// against one reviewable file. The HTML stays as-is.
//
// Idempotent and safe to re-run: existing translations in the target file are
// carried over by (unit, test, word) so re-converting after an HTML edit never
// discards translation work.
//
// Usage:
//   npm run convert:spelling -- --html=family-friends-2-spelling-list.html --book=family-friends-2
//   npm run convert:spelling -- --html=... --book=... --write

import * as fs from 'node:fs';
import * as path from 'node:path';

const ARGS = process.argv.slice(2);
const WRITE = ARGS.includes('--write');

function arg(name: string): string | undefined {
  return ARGS.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

export interface SpellingWordEntry {
  word: string;
  /** Traditional Mandarin (zh-Hant). Filled by translate-spelling-curriculum. */
  zh: string | null;
}

export interface SpellingTest {
  /** 1 = theme vocabulary, 2 = phonics pattern (mirrors the printed sheet). */
  index: number;
  focus: string;
  words: SpellingWordEntry[];
}

export interface SpellingUnit {
  unit: number;
  title: string;
  topic: string;
  tests: SpellingTest[];
}

export interface SpellingCurriculum {
  bookSlug: string;
  generatedFrom: string;
  unitCount: number;
  testCount: number;
  uniqueWordCount: number;
  units: SpellingUnit[];
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&nbsp;': ' ', '&middot;': '·', '&rsquo;': '’', '&lsquo;': '‘',
  '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
};

function decode(raw: string): string {
  return raw
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function parse(html: string, bookSlug: string, source: string): SpellingCurriculum {
  const blocks = html.split('<div class="unit">').slice(1);
  if (blocks.length === 0) throw new Error('No <div class="unit"> blocks found — is this a spelling-list HTML?');

  const units: SpellingUnit[] = blocks.map((block) => {
    const heading = /<span class="n">UNIT (\d+)<\/span>\s*([^<]*)/.exec(block);
    if (!heading) throw new Error('A unit block has no "UNIT n" heading');
    const topic = /<p class="topic">([^<]*)<\/p>/.exec(block);

    const tests: SpellingTest[] = [];
    const testRe = /<div class="test [ab]">[\s\S]*?<span class="lbl">([^<]*)<\/span><span class="focus">([^<]*)<\/span>[\s\S]*?<div class="words">([\s\S]*?)<\/div>/g;
    let m: RegExpExecArray | null;
    while ((m = testRe.exec(block)) !== null) {
      const label = decode(m[1]!);
      const index = Number(/(\d+)/.exec(label)?.[1] ?? tests.length + 1);
      const words = [...m[3]!.matchAll(/<span>([^<]*)<\/span>/g)].map((w) => ({
        word: decode(w[1]!).toLowerCase(),
        zh: null as string | null,
      }));
      if (words.length === 0) throw new Error(`Unit ${heading[1]} ${label} has no words`);
      tests.push({ index, focus: decode(m[2]!), words });
    }
    if (tests.length === 0) throw new Error(`Unit ${heading[1]} has no tests`);

    return {
      unit: Number(heading[1]),
      title: decode(heading[2]!),
      topic: topic ? decode(topic[1]!) : '',
      tests,
    };
  });

  const allWords = units.flatMap((u) => u.tests.flatMap((t) => t.words.map((w) => w.word)));
  return {
    bookSlug,
    generatedFrom: source,
    unitCount: units.length,
    testCount: units.reduce((n, u) => n + u.tests.length, 0),
    uniqueWordCount: new Set(allWords).size,
    units,
  };
}

/** Carry existing translations across a re-convert, keyed by unit/test/word. */
function preserveTranslations(next: SpellingCurriculum, targetPath: string): number {
  if (!fs.existsSync(targetPath)) return 0;
  const prev = JSON.parse(fs.readFileSync(targetPath, 'utf-8')) as SpellingCurriculum;
  const byKey = new Map<string, string>();
  for (const u of prev.units ?? []) {
    for (const t of u.tests ?? []) {
      for (const w of t.words ?? []) {
        if (w.zh) byKey.set(`${u.unit}:${t.index}:${w.word}`, w.zh);
      }
    }
  }
  let carried = 0;
  for (const u of next.units) {
    for (const t of u.tests) {
      for (const w of t.words) {
        const zh = byKey.get(`${u.unit}:${t.index}:${w.word}`);
        if (zh) { w.zh = zh; carried++; }
      }
    }
  }
  return carried;
}

function main(): void {
  const htmlPath = arg('html');
  const bookSlug = arg('book');
  if (!htmlPath || !bookSlug) {
    throw new Error('Both --html=<file> and --book=<slug> are required.');
  }

  const html = fs.readFileSync(path.resolve(process.cwd(), htmlPath), 'utf-8');
  const curriculum = parse(html, bookSlug, path.basename(htmlPath));

  const targetDir = path.resolve(process.cwd(), 'src/lib/curriculum', bookSlug);
  if (!fs.existsSync(targetDir)) {
    throw new Error(`No curriculum directory for "${bookSlug}" at ${targetDir}`);
  }
  const targetPath = path.join(targetDir, 'spelling.json');
  const carried = preserveTranslations(curriculum, targetPath);

  console.log(`Parsed ${curriculum.unitCount} units, ${curriculum.testCount} tests, ${curriculum.uniqueWordCount} unique words.`);
  const perTest = curriculum.units.flatMap((u) => u.tests.map((t) => t.words.length));
  console.log(`Words per test: ${Math.min(...perTest)}–${Math.max(...perTest)}`);
  if (carried > 0) console.log(`Carried over ${carried} existing translation(s).`);

  if (!WRITE) {
    console.log(`\n[dry-run] Would write ${targetPath}`);
    console.log('Re-run with --write to save.');
    return;
  }
  fs.writeFileSync(targetPath, `${JSON.stringify(curriculum, null, 2)}\n`);
  console.log(`\nWrote ${targetPath}`);
}

main();
