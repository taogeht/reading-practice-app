-- Granular student daily activity and time tracking.
--
-- Durable daily rollup storing active seconds per student, per day (in Asia/Taipei),
-- per activity category ('reading', 'spelling', 'assignment', 'practice', 'general').
-- Also adds current_activity_type and current_activity_label to session for real-time
-- "doing what right now" visibility for teachers.

CREATE TABLE IF NOT EXISTS "student_daily_activity" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "student_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "activity_type" varchar(32) NOT NULL,
  "seconds_active" integer DEFAULT 0 NOT NULL,
  "last_context_label" varchar(255),
  "last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_student_daily_activity"
  ON "student_daily_activity" ("student_id", "date", "activity_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_student_daily_activity_lookup"
  ON "student_daily_activity" ("student_id", "date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_student_daily_activity_date"
  ON "student_daily_activity" ("date");
--> statement-breakpoint
ALTER TABLE "session"
  ADD COLUMN IF NOT EXISTS "current_activity_type" varchar(32),
  ADD COLUMN IF NOT EXISTS "current_activity_label" varchar(255);
