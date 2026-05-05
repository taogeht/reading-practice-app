ALTER TABLE "recordings" ADD COLUMN "teacher_reply_audio_url" varchar(500);--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "teacher_reply_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "teacher_reply_uploaded_at" timestamp with time zone;