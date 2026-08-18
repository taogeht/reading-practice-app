-- Persist exact generation work and a renewable lease so queued/running jobs
-- can be resumed safely after the long-running Node process restarts.
ALTER TABLE "reading_generation_jobs"
  ADD COLUMN IF NOT EXISTS "work_items" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "reading_generation_jobs"
  ADD COLUMN IF NOT EXISTS "skip_images" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "reading_generation_jobs"
  ADD COLUMN IF NOT EXISTS "lease_token" uuid;
--> statement-breakpoint
ALTER TABLE "reading_generation_jobs"
  ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "reading_generation_jobs"
  ADD COLUMN IF NOT EXISTS "runner_attempts" smallint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "reading_generation_jobs"
  ADD COLUMN IF NOT EXISTS "last_error" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reading_generation_jobs_claim"
  ON "reading_generation_jobs" ("status", "lease_expires_at");
--> statement-breakpoint
ALTER TABLE "reading_passages"
  ADD COLUMN IF NOT EXISTS "generation_job_id" uuid;
--> statement-breakpoint
ALTER TABLE "reading_passages"
  ADD COLUMN IF NOT EXISTS "generation_work_item_index" smallint;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_reading_passages_unique_generation_work_item"
  ON "reading_passages" ("generation_job_id", "generation_work_item_index")
  WHERE "generation_job_id" IS NOT NULL;
