ALTER TABLE "assignments" ADD COLUMN "recording_mode" varchar(20) DEFAULT 'teacher_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "transcript" text;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "analysis_json" jsonb;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "letter_grade" varchar(2);