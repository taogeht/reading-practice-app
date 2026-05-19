CREATE TABLE "student_avatars" (
	"student_id" uuid PRIMARY KEY NOT NULL,
	"character_type" varchar(20) NOT NULL,
	"equipped_items" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generation_status" varchar(20) DEFAULT 'css' NOT NULL,
	"base_asset_url" text,
	"reroll_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_avatars_character_type_known" CHECK ("character_type" IN ('human', 'animal', 'robot')),
	CONSTRAINT "student_avatars_generation_status_known" CHECK ("generation_status" IN ('css', 'pending', 'complete', 'failed')),
	CONSTRAINT "student_avatars_reroll_count_nonneg" CHECK ("reroll_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "student_avatars" ADD CONSTRAINT "student_avatars_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Phase 3 seed: cost the avatar reroll service reads from system_settings.
-- Admins can change this at runtime via Drizzle Studio or a settings page
-- without redeploying; the avatar service falls back to 20 if the row is
-- missing. ON CONFLICT keeps the migration idempotent.
INSERT INTO "system_settings" ("key", "value", "description")
VALUES ('reroll_cost_stars', '20'::jsonb, 'Stars charged to change avatar character type')
ON CONFLICT ("key") DO NOTHING;