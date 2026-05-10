-- Cleanup pass: any in_progress session for (student, passage) where a
-- completed session already exists at the same or earlier started_at is
-- a spurious row from the StrictMode double-fire / rapid-click bug.
-- Mark it abandoned (preserve the row for analytics) so the partial
-- unique index below can be created without violation.
--
-- The `s2.started_at <= s1.started_at` predicate is deliberate: it
-- preserves the rare legitimate case of a kid hitting "Start over"
-- before a completed session existed (in_progress strictly older than
-- the completion). Only in_progress rows that were created AFTER a
-- completion are abandoned.
UPDATE student_reading_sessions s1
SET completion_status = 'abandoned',
    finished_at = COALESCE(s1.finished_at, s1.started_at)
WHERE s1.completion_status = 'in_progress'
  AND EXISTS (
    SELECT 1 FROM student_reading_sessions s2
    WHERE s2.student_id = s1.student_id
      AND s2.passage_id = s1.passage_id
      AND s2.completion_status = 'completed'
      AND s2.started_at <= s1.started_at
  );
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_one_in_progress_per_student_passage" ON "student_reading_sessions" USING btree ("student_id","passage_id") WHERE "student_reading_sessions"."completion_status" = 'in_progress';
