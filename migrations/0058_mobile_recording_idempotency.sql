-- Native uploads may be retried after the device loses a response. Keep the
-- learner-generated operation ID so one local recording can create at most one
-- database attempt.
ALTER TABLE "recordings"
  ADD COLUMN IF NOT EXISTS "client_operation_id" varchar(64);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_recordings_unique_client_operation"
  ON "recordings" ("student_id", "client_operation_id")
  WHERE "client_operation_id" IS NOT NULL;
