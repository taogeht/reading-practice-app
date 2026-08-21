-- Create the 2026-2027 grade-1 and grade-3 classes.
--
-- 3B is new: there was no grade-3 class at all, which blocked importing the
-- Family and Friends 3 spelling curriculum (the importer targets active
-- classes by grade level).
--
-- 1B is a second class with the same name as the 2025-2026 one, which is fine:
-- `classes` is unique on slug, not name, so 1b-2025-2026 and 1b-2026-2027
-- coexist. The old one stays archived with its lists intact.
--
-- Both derive school, teacher and term from the existing 2B rather than
-- hardcoding UUIDs, so this file is correct against local and prod alike.
-- Note the 2025-2026 classes predate the term model and have term_id NULL;
-- these join the 2026-2027 term the way 2B does.
--
-- Students are NOT enrolled here. Moving children between classes is a
-- separate, deliberate step.

CREATE TABLE IF NOT EXISTS "data_migrations" (
  "id" text PRIMARY KEY,
  "applied_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "data_migrations" WHERE "id" = '2026-08-21-classes-2026-2027'
  ) THEN

    INSERT INTO classes (name, grade_level, academic_year, slug, school_id, teacher_id, term_id, active)
    SELECT '3B', 3, c.academic_year, '3b-2026-2027', c.school_id, c.teacher_id, c.term_id, true
      FROM classes c
     WHERE c.slug = '2b-2026-2027'
    ON CONFLICT (slug) DO NOTHING;

    INSERT INTO classes (name, grade_level, academic_year, slug, school_id, teacher_id, term_id, active)
    SELECT '1B', 1, c.academic_year, '1b-2026-2027', c.school_id, c.teacher_id, c.term_id, true
      FROM classes c
     WHERE c.slug = '2b-2026-2027'
    ON CONFLICT (slug) DO NOTHING;

    INSERT INTO "data_migrations" ("id") VALUES ('2026-08-21-classes-2026-2027');
  END IF;
END $$;

-- Confirmation.
SELECT name, grade_level, academic_year, slug, active
  FROM classes
 WHERE slug IN ('1b-2026-2027', '3b-2026-2027')
 ORDER BY grade_level;
