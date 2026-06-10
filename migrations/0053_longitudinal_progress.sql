CREATE TABLE IF NOT EXISTS "academic_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"start_date" date,
	"end_date" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_reading_level_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"level" varchar(50) NOT NULL,
	"changed_by_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "term_id" uuid;
--> statement-breakpoint
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_reading_level_history" ADD CONSTRAINT "student_reading_level_history_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_reading_level_history" ADD CONSTRAINT "student_reading_level_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_term_school_name" ON "academic_terms" USING btree ("school_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_academic_terms_school_current" ON "academic_terms" USING btree ("school_id","is_current");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reading_level_history_student_time" ON "student_reading_level_history" USING btree ("student_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_one_current_term_per_school" ON "academic_terms" USING btree ("school_id") WHERE "is_current";
--> statement-breakpoint
INSERT INTO "student_reading_level_history" ("student_id", "level", "changed_by_user_id", "note", "created_at")
SELECT s."id", s."reading_level", NULL, 'Backfilled from profile', COALESCE(s."updated_at", now())
FROM "students" s
WHERE s."reading_level" IS NOT NULL AND s."reading_level" <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "student_reading_level_history" h WHERE h."student_id" = s."id"
  );
