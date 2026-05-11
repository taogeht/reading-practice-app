CREATE TYPE "public"."reading_generation_job_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "reading_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"parent_job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reading_level_id" smallint NOT NULL,
	"count_requested" smallint NOT NULL,
	"overrides_used" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_vocab_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "reading_generation_job_status" DEFAULT 'queued' NOT NULL,
	"passages_succeeded" smallint DEFAULT 0 NOT NULL,
	"passages_failed" smallint DEFAULT 0 NOT NULL,
	"passages_results" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reading_generation_jobs" ADD CONSTRAINT "reading_generation_jobs_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_reading_generation_jobs_teacher_recent" ON "reading_generation_jobs" USING btree ("teacher_id","created_at");