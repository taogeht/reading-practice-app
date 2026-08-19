-- Scheduled release for spelling lists.
--
-- A year of curriculum spelling is 32 lists per class. The student endpoint
-- returns every active list, so importing a year would expose all 32 at once
-- and let a student jump to week 30 in week 1. `active` could not be reused for
-- this: it is the archive flag, and marking future weeks inactive would put
-- them in the archive view.
--
-- NULL means "visible now", so every pre-existing list keeps its current
-- behaviour and this migration is a no-op for them.
ALTER TABLE "spelling_lists"
  ADD COLUMN IF NOT EXISTS "available_from" timestamp with time zone;
--> statement-breakpoint
-- Backs the student-facing lookup: class + active + release window.
CREATE INDEX IF NOT EXISTS "idx_spelling_lists_available_from"
  ON "spelling_lists" ("class_id", "available_from");
