ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "can_manage_spelling_lists" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "can_manage_assignments" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "can_generate_practice_questions" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "can_use_sunny_preview" boolean DEFAULT false NOT NULL;
