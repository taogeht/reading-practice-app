CREATE TABLE "student_progression" (
	"student_id" uuid PRIMARY KEY NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"current_level" integer DEFAULT 1 NOT NULL,
	"current_streak_days" integer DEFAULT 0 NOT NULL,
	"longest_streak_days" integer DEFAULT 0 NOT NULL,
	"last_activity_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_unlocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"unlock_type" varchar(20) NOT NULL,
	"unlock_key" varchar(60) NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"event_type" varchar(40) NOT NULL,
	"source_id" uuid,
	"points" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "leaderboard_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "student_progression" ADD CONSTRAINT "student_progression_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_unlocks" ADD CONSTRAINT "student_unlocks_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_xp_events" ADD CONSTRAINT "student_xp_events_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_student_unlock" ON "student_unlocks" USING btree ("student_id","unlock_type","unlock_key");--> statement-breakpoint
CREATE INDEX "idx_student_unlocks_student" ON "student_unlocks" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_student_xp_events_student_time" ON "student_xp_events" USING btree ("student_id","created_at");