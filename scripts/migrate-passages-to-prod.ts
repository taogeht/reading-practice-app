// One-shot migration: copy reading-feature data from a local DB to a
// prod DB. Designed for the post-launch case where dev has accumulated
// `npm run test:passage` rows that you want to seed prod with so the
// student library isn't empty on day one.
//
// What gets copied:
//   - vocabulary           — entire table. Required because passages
//     reference vocab UUIDs inside JSONB payloads (targetVocabIds +
//     vocab_matching pair vocabIds), and prod's vocabulary table is
//     assumed empty. Copying verbatim keeps UUIDs aligned so payloads
//     don't need rewriting.
//   - reading_passages     — only WHERE status='review' AND is_active=true.
//     Drafts (skip-images test artifacts) and any rejected passages
//     (status='archived') stay local.
//   - story_pages          — every page belonging to the copied passages.
//   - reading_questions    — every question belonging to the copied passages.
//
// What does NOT get copied:
//   - student_reading_sessions / student_reading_answers — local test
//     artifacts; kids on prod will create their own from scratch.
//   - student_vocabulary_mastery — derived data; will recompute when
//     the first kid completes a passage.
//   - users / students / teachers / classes — separate concern.
//
// Image assets: this script assumes dev + prod share one R2 bucket
// (the user confirmed). Image keys in the JSONB payloads stay valid
// without copying R2 objects. If the buckets diverge later, an R2
// bucket-to-bucket copy would be a separate step.
//
// Idempotency: ON CONFLICT DO NOTHING on every INSERT, so re-running
// is safe. Vocab conflicts on `word`; reading_passages on `id`;
// story_pages on the (passage_id, page_number) unique index;
// reading_questions on `id`.
//
// Usage:
//   PROD_DATABASE_URL=postgres://... npm run migrate:passages
//   PROD_DATABASE_URL=postgres://... npm run migrate:passages -- --write
//
// The DATABASE_URL from .env.local provides the local source. The
// PROD_DATABASE_URL env var must be supplied at the command line —
// intentionally not loaded from .env.local so a stray run doesn't
// hit prod by accident.

import './_bootstrap-env';
import pg from 'pg';

const WRITE = process.argv.includes('--write');
const LOCAL_URL = process.env.DATABASE_URL;
const PROD_URL = process.env.PROD_DATABASE_URL;

if (!LOCAL_URL) {
  console.error('DATABASE_URL must be set (loaded from .env.local).');
  process.exit(1);
}
if (!PROD_URL) {
  console.error(
    'PROD_DATABASE_URL must be supplied at the command line. Refusing to run.',
  );
  console.error(
    'Example: PROD_DATABASE_URL=postgres://... npm run migrate:passages',
  );
  process.exit(1);
}
if (LOCAL_URL === PROD_URL) {
  console.error(
    'DATABASE_URL and PROD_DATABASE_URL are identical. Refusing to copy a DB onto itself.',
  );
  process.exit(1);
}

const localPool = new pg.Pool({ connectionString: LOCAL_URL });
const prodPool = new pg.Pool({ connectionString: PROD_URL });

interface Passage {
  id: string;
  title: string;
  reading_level: number;
  target_vocab_ids: unknown;
  page_count: number;
  status: string;
  generation_meta: unknown;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  summary: string | null;
  cover_image_key: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

async function main() {
  console.log(`Mode: ${WRITE ? 'WRITE' : 'DRY-RUN'}`);
  console.log(`local: ${redact(LOCAL_URL!)}`);
  console.log(`prod : ${redact(PROD_URL!)}`);
  console.log('');

  // ---------- Pre-flight ----------
  await preflight();

  // ---------- Phase 1: vocabulary ----------
  const vocabRows = (
    await localPool.query<{
      id: string;
      word: string;
      part_of_speech: string;
      af_f_level: string | null;
      af_f_unit: number | null;
      cefr_level: string | null;
      example_sentence: string | null;
      mandarin_translation: string | null;
      introduces_phonics_pattern: string | null;
      is_function_word: boolean;
      is_scaffold: boolean;
      is_core_vocabulary: boolean;
      is_picturable: boolean;
      created_at: Date;
      updated_at: Date;
    }>(`SELECT * FROM vocabulary ORDER BY word`)
  ).rows;
  console.log(`vocabulary on local: ${vocabRows.length} rows`);

  const prodVocabBefore = (
    await prodPool.query<{ n: string }>(`SELECT COUNT(*) AS n FROM vocabulary`)
  ).rows[0]!.n;
  console.log(`vocabulary on prod (before): ${prodVocabBefore} rows`);

  if (WRITE && vocabRows.length > 0) {
    // Bulk insert; Postgres handles up to ~65k parameters per query, so
    // 367 rows × 14 cols = 5138 params — comfortably under the limit.
    const cols = [
      'id', 'word', 'part_of_speech', 'af_f_level', 'af_f_unit', 'cefr_level',
      'example_sentence', 'mandarin_translation', 'introduces_phonics_pattern',
      'is_function_word', 'is_scaffold', 'is_core_vocabulary', 'is_picturable',
      'created_at', 'updated_at',
    ];
    const placeholders: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;
    for (const r of vocabRows) {
      const rowParams = cols.map(() => `$${paramIdx++}`);
      placeholders.push(`(${rowParams.join(', ')})`);
      values.push(
        r.id, r.word, r.part_of_speech, r.af_f_level, r.af_f_unit, r.cefr_level,
        r.example_sentence, r.mandarin_translation, r.introduces_phonics_pattern,
        r.is_function_word, r.is_scaffold, r.is_core_vocabulary, r.is_picturable,
        r.created_at, r.updated_at,
      );
    }
    const sql = `
      INSERT INTO vocabulary (${cols.join(', ')})
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (word) DO NOTHING
    `;
    const result = await prodPool.query(sql, values);
    console.log(`  inserted ${result.rowCount} vocabulary rows (rest skipped on word-conflict)`);
  } else if (!WRITE) {
    console.log(`  [dry-run] would insert up to ${vocabRows.length} vocabulary rows`);
  }
  console.log('');

  // ---------- Phase 2: reading_passages (status='review' AND is_active) ----------
  const passages = (
    await localPool.query<Passage>(
      `SELECT * FROM reading_passages
       WHERE status = 'review' AND is_active = true
       ORDER BY created_at`,
    )
  ).rows;
  console.log(`passages on local (status='review' AND is_active): ${passages.length}`);
  if (passages.length === 0) {
    console.log('Nothing to migrate. Exiting.');
    process.exit(0);
  }
  for (const p of passages.slice(0, 8)) {
    console.log(`  ${p.id}  L${p.reading_level}  "${p.title}"`);
  }
  if (passages.length > 8) console.log(`  …and ${passages.length - 8} more`);

  if (WRITE) {
    const cols = [
      'id', 'title', 'reading_level', 'target_vocab_ids', 'page_count', 'status',
      'generation_meta', 'reviewed_by', 'reviewed_at', 'summary',
      'cover_image_key', 'is_active', 'created_at', 'updated_at',
    ];
    const placeholders: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;
    for (const r of passages) {
      const rowParams = cols.map(() => `$${paramIdx++}`);
      placeholders.push(`(${rowParams.join(', ')})`);
      values.push(
        r.id, r.title, r.reading_level, r.target_vocab_ids, r.page_count, r.status,
        r.generation_meta, r.reviewed_by, r.reviewed_at, r.summary,
        r.cover_image_key, r.is_active, r.created_at, r.updated_at,
      );
    }
    const result = await prodPool.query(
      `INSERT INTO reading_passages (${cols.join(', ')})
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (id) DO NOTHING`,
      values,
    );
    console.log(`  inserted ${result.rowCount} reading_passages rows`);
  } else {
    console.log(`  [dry-run] would insert up to ${passages.length} passage rows`);
  }
  console.log('');

  const passageIds = passages.map((p) => p.id);

  // ---------- Phase 3: story_pages ----------
  const pages = (
    await localPool.query<{
      id: string;
      passage_id: string;
      page_number: number;
      text: string;
      image_key: string | null;
      image_prompt_used: string | null;
      tts_audio_key: string | null;
      tts_voice: string | null;
      edited_at: Date | null;
      edited_by: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM story_pages WHERE passage_id = ANY($1::uuid[]) ORDER BY passage_id, page_number`,
      [passageIds],
    )
  ).rows;
  console.log(`story_pages to copy: ${pages.length}`);

  if (WRITE && pages.length > 0) {
    const cols = [
      'id', 'passage_id', 'page_number', 'text', 'image_key', 'image_prompt_used',
      'tts_audio_key', 'tts_voice', 'edited_at', 'edited_by', 'created_at', 'updated_at',
    ];
    // Chunk to keep parameter count safely below 65535.
    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < pages.length; i += CHUNK) {
      const chunk = pages.slice(i, i + CHUNK);
      const placeholders: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;
      for (const r of chunk) {
        const rowParams = cols.map(() => `$${paramIdx++}`);
        placeholders.push(`(${rowParams.join(', ')})`);
        values.push(
          r.id, r.passage_id, r.page_number, r.text, r.image_key, r.image_prompt_used,
          r.tts_audio_key, r.tts_voice, r.edited_at, r.edited_by, r.created_at, r.updated_at,
        );
      }
      const result = await prodPool.query(
        `INSERT INTO story_pages (${cols.join(', ')})
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (passage_id, page_number) DO NOTHING`,
        values,
      );
      inserted += result.rowCount ?? 0;
    }
    console.log(`  inserted ${inserted} story_pages rows`);
  } else if (!WRITE) {
    console.log(`  [dry-run] would insert up to ${pages.length} story_pages rows`);
  }
  console.log('');

  // ---------- Phase 4: reading_questions ----------
  const questions = (
    await localPool.query<{
      id: string;
      passage_id: string;
      question_type: string;
      question_text: string;
      order_index: number;
      payload: unknown;
      vocab_word_id: string | null;
      evidence_quote: string | null;
      evidence_page_number: number | null;
      difficulty: number | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM reading_questions WHERE passage_id = ANY($1::uuid[]) ORDER BY passage_id, order_index`,
      [passageIds],
    )
  ).rows;
  console.log(`reading_questions to copy: ${questions.length}`);

  if (WRITE && questions.length > 0) {
    const cols = [
      'id', 'passage_id', 'question_type', 'question_text', 'order_index',
      'payload', 'vocab_word_id', 'evidence_quote', 'evidence_page_number',
      'difficulty', 'created_at', 'updated_at',
    ];
    const placeholders: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;
    for (const r of questions) {
      const rowParams = cols.map(() => `$${paramIdx++}`);
      placeholders.push(`(${rowParams.join(', ')})`);
      values.push(
        r.id, r.passage_id, r.question_type, r.question_text, r.order_index,
        r.payload, r.vocab_word_id, r.evidence_quote, r.evidence_page_number,
        r.difficulty, r.created_at, r.updated_at,
      );
    }
    const result = await prodPool.query(
      `INSERT INTO reading_questions (${cols.join(', ')})
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (id) DO NOTHING`,
      values,
    );
    console.log(`  inserted ${result.rowCount} reading_questions rows`);
  } else if (!WRITE) {
    console.log(`  [dry-run] would insert up to ${questions.length} reading_questions rows`);
  }
  console.log('');

  // ---------- Phase 5: verification ----------
  if (WRITE) {
    await verifyVocabReferences(passageIds);
  } else {
    console.log('[dry-run] skipping verification — no rows inserted to verify against');
  }

  await localPool.end();
  await prodPool.end();
  process.exit(0);
}

async function preflight() {
  // Confirm prod has the reading-feature schema. Probing the partial
  // unique index from migration 0038 is the cheapest "0033-0038
  // applied" check — if 0038 ran, all earlier ones did too.
  const indexCheck = await prodPool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = 'idx_one_in_progress_per_student_passage'
     ) AS exists`,
  );
  if (!indexCheck.rows[0]?.exists) {
    console.error(
      'Pre-flight FAILED: prod is missing idx_one_in_progress_per_student_passage.',
    );
    console.error('Run `npm run db:migrate` against prod first to apply migrations 0033-0038.');
    process.exit(1);
  }
  console.log('Pre-flight: prod has migrations 0033-0038 applied  ✓');

  // Snapshot of how much data already exists on prod so the user
  // can see whether re-runs are no-ops vs. picking up new rows.
  const existing = await prodPool.query<{ table_name: string; n: string }>(
    `SELECT 'reading_passages' AS table_name, COUNT(*)::text AS n FROM reading_passages
     UNION ALL SELECT 'story_pages', COUNT(*)::text FROM story_pages
     UNION ALL SELECT 'reading_questions', COUNT(*)::text FROM reading_questions
     ORDER BY table_name`,
  );
  console.log('prod row counts (before):');
  for (const r of existing.rows) {
    console.log(`  ${r.table_name.padEnd(20)} ${r.n}`);
  }
  console.log('');
}

async function verifyVocabReferences(passageIds: string[]) {
  // Ensure every UUID a copied passage references in JSONB resolves
  // against prod's vocabulary table. This catches the "prod's vocab
  // had a few rows already with different UUIDs and ON CONFLICT
  // skipped the dev replacements" failure mode.
  console.log('Verifying vocab UUID references resolve on prod…');

  // Pull every targetVocabIds element and every vocab_matching pair
  // vocabId from the copied passages, in one round trip.
  const refsResult = await prodPool.query<{ vocab_id: string }>(
    `WITH targets AS (
       SELECT jsonb_array_elements_text(target_vocab_ids) AS vocab_id
       FROM reading_passages
       WHERE id = ANY($1::uuid[])
     ),
     pairs AS (
       SELECT pair->>'vocabId' AS vocab_id
       FROM reading_questions q,
            jsonb_array_elements(q.payload->'pairs') AS pair
       WHERE q.passage_id = ANY($1::uuid[])
         AND q.question_type = 'vocab_matching'
     )
     SELECT DISTINCT vocab_id FROM (
       SELECT vocab_id FROM targets WHERE vocab_id IS NOT NULL
       UNION ALL
       SELECT vocab_id FROM pairs WHERE vocab_id IS NOT NULL
     ) refs
     WHERE NOT EXISTS (
       SELECT 1 FROM vocabulary v WHERE v.id::text = refs.vocab_id
     )`,
    [passageIds],
  );
  if (refsResult.rows.length === 0) {
    console.log('  ✓ every JSONB-embedded vocab UUID resolves on prod');
    return;
  }
  console.log(`  ✗ ${refsResult.rows.length} vocab UUIDs are referenced but not present on prod:`);
  for (const r of refsResult.rows.slice(0, 10)) {
    console.log(`    ${r.vocab_id}`);
  }
  if (refsResult.rows.length > 10) {
    console.log(`    …and ${refsResult.rows.length - 10} more`);
  }
  console.log('');
  console.log(
    '  These passages will render with broken vocab on prod until the missing rows are inserted.',
  );
  console.log(
    '  Most likely cause: prod\'s vocabulary table had rows already, ON CONFLICT (word) DO',
  );
  console.log(
    '  NOTHING skipped them, so dev\'s UUIDs were never installed. Either (a) wipe prod\'s',
  );
  console.log(
    '  vocabulary table and re-run, or (b) accept that affected passages will misrender.',
  );
}

function redact(url: string): string {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
