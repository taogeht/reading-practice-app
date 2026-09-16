import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { count, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { vocabulary } from '@/lib/db/schema';
import { logError, logInfo } from '@/lib/logger';

const LEVEL_TO_BOOK_SLUG: Record<string, string> = {
  starter: 'family-friends-starter',
  grade1: 'family-friends-1',
  grade2: 'family-friends-2',
  grade3: 'family-friends-3',
  grade4: 'family-friends-4',
  grade5: 'family-friends-5',
};

type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'preposition'
  | 'conjunction'
  | 'interjection'
  | 'determiner'
  | 'other';

const FUNCTION_WORDS = new Set<string>([
  'a', 'an', 'the',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'do', 'does', 'did',
  'have', 'has', 'had',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'shall',
  'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'about', 'as',
  'and', 'or', 'but', 'so', 'if', 'because', 'that',
  'this', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their',
]);

const ARRAY_KEY_POS: Record<string, PartOfSpeech> = {
  verbs: 'verb',
  adjectives: 'adjective',
  numbers: 'other',
  colors: 'adjective',
  prepositions: 'preposition',
};

const WORD_OVERRIDES: Record<string, string> = {
  'the ocean': 'ocean',
};

const UNPICTURABLE_WORDS = new Set<string>([
  'one', 'two', 'three', 'four', 'five',
  'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
  'good', 'bad', 'nice', 'fine', 'okay',
  'many', 'much', 'more', 'less', 'most',
  'here', 'there', 'too', 'so', 'very',
  'now', 'then', 'soon', 'before', 'after',
  'first', 'last', 'next',
]);

function normaliseWord(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  return WORD_OVERRIDES[trimmed] ?? trimmed;
}

function shouldSkipMultiWord(w: string, pos: PartOfSpeech): boolean {
  if (!w.includes(' ')) return false;
  if (pos === 'verb' || pos === 'preposition' || pos === 'adverb') return true;
  return false;
}

interface UnitJson {
  unit: number;
  topic?: string;
  vocabulary?: Array<{ word: string }>;
  verbs?: string[];
  adjectives?: string[];
  numbers?: string[];
  colors?: string[];
  prepositions?: string[];
}

/**
 * Ensures that vocabulary rows for the specified curriculum level exist in the database.
 * If the level is missing or has fewer than 20 rows, automatically reads unit JSON files
 * from src/lib/curriculum/<slug>/ and upserts them into the vocabulary table.
 */
export async function ensureCurriculumVocabSeeded(afFLevel: string): Promise<boolean> {
  const bookSlug = LEVEL_TO_BOOK_SLUG[afFLevel];
  if (!bookSlug) return false;

  try {
    const existing = await db
      .select({ val: count() })
      .from(vocabulary)
      .where(eq(vocabulary.afFLevel, afFLevel as any));

    const rowCount = Number(existing[0]?.val ?? 0);
    if (rowCount >= 20) {
      return true;
    }

    const curriculumDir = path.join(process.cwd(), 'src/lib/curriculum', bookSlug);
    let filenames: string[];
    try {
      filenames = (await readdir(curriculumDir)).filter((f) => /^unit-\d+\.json$/.test(f));
    } catch {
      return false;
    }

    if (filenames.length === 0) return false;

    const unitList: UnitJson[] = [];
    for (const filename of filenames) {
      const content = await readFile(path.join(curriculumDir, filename), 'utf-8');
      unitList.push(JSON.parse(content));
    }
    unitList.sort((a, b) => a.unit - b.unit);

    const candidates: Array<{
      word: string;
      partOfSpeech: PartOfSpeech;
      afFLevel: any;
      afFUnit: number;
      isFunctionWord: boolean;
      isPicturable: boolean;
    }> = [];

    const seenWords = new Set<string>();

    for (const u of unitList) {
      const typedPosByWord = new Map<string, PartOfSpeech>();
      for (const [key, pos] of Object.entries(ARRAY_KEY_POS)) {
        const arr = (u as any)[key];
        if (!Array.isArray(arr)) continue;
        for (const raw of arr) {
          if (typeof raw !== 'string') continue;
          const w = normaliseWord(raw);
          if (w && !typedPosByWord.has(w)) typedPosByWord.set(w, pos);
        }
      }

      for (const item of u.vocabulary ?? []) {
        if (typeof item?.word !== 'string') continue;
        const w = normaliseWord(item.word);
        if (!w || seenWords.has(w)) continue;
        const pos = typedPosByWord.get(w) ?? 'noun';
        if (shouldSkipMultiWord(w, pos)) continue;
        seenWords.add(w);
        candidates.push({
          word: w,
          partOfSpeech: pos,
          afFLevel,
          afFUnit: u.unit,
          isFunctionWord: FUNCTION_WORDS.has(w),
          isPicturable: !UNPICTURABLE_WORDS.has(w),
        });
      }

      for (const [key, pos] of Object.entries(ARRAY_KEY_POS)) {
        const arr = (u as any)[key];
        if (!Array.isArray(arr)) continue;
        for (const raw of arr) {
          if (typeof raw !== 'string') continue;
          const w = normaliseWord(raw);
          if (!w || seenWords.has(w)) continue;
          if (shouldSkipMultiWord(w, pos)) continue;
          seenWords.add(w);
          candidates.push({
            word: w,
            partOfSpeech: pos,
            afFLevel,
            afFUnit: u.unit,
            isFunctionWord: FUNCTION_WORDS.has(w),
            isPicturable: !UNPICTURABLE_WORDS.has(w),
          });
        }
      }
    }

    if (candidates.length === 0) return false;

    // Chunk upserts in batches of 50
    const chunkSize = 50;
    for (let i = 0; i < candidates.length; i += chunkSize) {
      const chunk = candidates.slice(i, i + chunkSize);
      await db
        .insert(vocabulary)
        .values(chunk)
        .onConflictDoUpdate({
          target: vocabulary.word,
          set: {
            partOfSpeech: sql`COALESCE(${vocabulary.partOfSpeech}, EXCLUDED.part_of_speech)`,
            afFLevel: sql`COALESCE(${vocabulary.afFLevel}, EXCLUDED.af_f_level)`,
            afFUnit: sql`COALESCE(${vocabulary.afFUnit}, EXCLUDED.af_f_unit)`,
            isFunctionWord: sql`${vocabulary.isFunctionWord} OR EXCLUDED.is_function_word`,
            isPicturable: sql`COALESCE(${vocabulary.isPicturable}, EXCLUDED.is_picturable)`,
            isScaffold: sql`false`,
            updatedAt: sql`now()`,
          },
        });
    }

    logInfo(
      'auto-seeded curriculum vocabulary',
      `level=${afFLevel} book=${bookSlug} words=${candidates.length}`,
    );
    return true;
  } catch (err) {
    logError(err, `ensureCurriculumVocabSeeded failed for level ${afFLevel}`);
    return false;
  }
}
