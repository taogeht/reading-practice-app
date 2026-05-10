ALTER TABLE "story_pages" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "story_pages" ADD COLUMN "edited_by" uuid;--> statement-breakpoint
ALTER TABLE "story_pages" ADD CONSTRAINT "story_pages_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;