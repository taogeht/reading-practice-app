-- Which migrations are actually present? Paste into Railway's query console
-- (or psql) when you don't want to run the TypeScript checker.
--
-- The Drizzle journal is unreliable in this repo (older migrations went in via
-- db:push and hand-run scripts, which record nothing), so this inspects the
-- schema for the objects each migration creates.
--
-- Read-only.

WITH expected(migration, kind, obj) AS (VALUES
  ('0050 multibook practice units',  'column', 'class_practice_units.book_slug'),
  ('0050 multibook practice units',  'rel',    'unique_class_practice_book_unit'),
  ('0051 teacher capabilities',      'column', 'teachers.can_manage_spelling_lists'),
  ('0051 teacher capabilities',      'column', 'teachers.can_manage_assignments'),
  ('0051 teacher capabilities',      'column', 'teachers.can_generate_practice_questions'),
  ('0051 teacher capabilities',      'column', 'teachers.can_use_sunny_preview'),
  ('0052 generated tests',           'rel',    'generated_tests'),
  ('0052 generated tests',           'rel',    'idx_generated_tests_school'),
  ('0053 longitudinal progress',     'rel',    'academic_terms'),
  ('0053 longitudinal progress',     'rel',    'student_reading_level_history'),
  ('0053 longitudinal progress',     'column', 'classes.term_id'),
  ('0053 longitudinal progress',     'rel',    'uniq_one_current_term_per_school'),
  ('0054 gradebook',                 'rel',    'gradebook_tests'),
  ('0054 gradebook',                 'rel',    'gradebook_scores'),
  ('0054 gradebook',                 'rel',    'unique_gradebook_test_student'),
  ('0055 hot indexes',               'rel',    'idx_classes_teacher'),
  ('0055 hot indexes',               'rel',    'idx_classes_school'),
  ('0055 hot indexes',               'rel',    'idx_classes_term'),
  ('0055 hot indexes',               'rel',    'idx_class_enrollments_student'),
  ('0056 class promotion lineage',   'column', 'classes.promoted_to_class_id'),
  ('0056 class promotion lineage',   'rel',    'idx_classes_promoted_to'),
  ('0057 mobile auth foundation',    'rel',    'mobile_refresh_sessions'),
  ('0057 mobile auth foundation',    'rel',    'auth_rate_limits'),
  ('0057 mobile auth foundation',    'rel',    'idx_mobile_refresh_sessions_token_hash')
),
resolved AS (
  SELECT
    e.migration,
    e.obj,
    CASE e.kind
      -- tables and indexes both live in pg_class, so to_regclass covers both
      WHEN 'rel' THEN to_regclass('public.' || e.obj) IS NOT NULL
      WHEN 'column' THEN EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name  = split_part(e.obj, '.', 1)
          AND c.column_name = split_part(e.obj, '.', 2)
      )
    END AS found
  FROM expected e
)
SELECT
  migration,
  CASE
    WHEN bool_and(found)     THEN 'APPLIED'
    WHEN bool_or(found)      THEN 'PARTIAL'   -- script died midway; investigate
    ELSE                          'MISSING'
  END AS status,
  count(*) FILTER (WHERE found) || '/' || count(*) AS objects,
  string_agg(obj, ', ') FILTER (WHERE NOT found)   AS absent
FROM resolved
GROUP BY migration
ORDER BY migration;
