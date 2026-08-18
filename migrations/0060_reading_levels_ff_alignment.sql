-- Renumber reading levels onto Family and Friends 1-5.
--
-- The ladder used to start at a "Starter" rung, so level 2 meant Grade 1,
-- level 3 meant Grade 2, and so on. Levels now map 1:1 onto FF1-FF5, which
-- shifts every existing row down one. Without this, a passage written from
-- Grade 1 vocabulary would be served as Grade 2 material and benched against
-- Grade 2 fluency norms.
--
-- UNLIKE the other migrations in this directory, this one is NOT naturally
-- idempotent: re-running the UPDATE would shift the data a second time. The
-- ledger table below makes it safe to re-run — the shift executes only if this
-- migration id has not been recorded.
CREATE TABLE IF NOT EXISTS "data_migrations" (
  "id" text PRIMARY KEY,
  "applied_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "data_migrations" WHERE "id" = '0060_reading_levels_ff_alignment'
  ) THEN
    -- Descending order is not required (no unique constraint on the column),
    -- but the guard means this block runs exactly once either way.
    UPDATE "reading_passages"
       SET "reading_level" = "reading_level" - 1
     WHERE "reading_level" >= 2;

    UPDATE "reading_generation_jobs"
       SET "reading_level_id" = "reading_level_id" - 1
     WHERE "reading_level_id" >= 2;

    INSERT INTO "data_migrations" ("id") VALUES ('0060_reading_levels_ff_alignment');
  END IF;
END $$;
