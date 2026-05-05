CREATE TABLE "class_weekly_recaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"pages_covered" text,
	"vocabulary" text,
	"spelling_test_info" text,
	"grammar_test_info" text,
	"homework" text,
	"behavior_format" varchar(20) DEFAULT 'checklist' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_weekly_recap_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recap_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"behavior_ratings" jsonb,
	"teacher_comment" text,
	"parent_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_weekly_recaps" ADD CONSTRAINT "class_weekly_recaps_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_weekly_recaps" ADD CONSTRAINT "class_weekly_recaps_created_by_teachers_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_weekly_recap_entries" ADD CONSTRAINT "student_weekly_recap_entries_recap_id_class_weekly_recaps_id_fk" FOREIGN KEY ("recap_id") REFERENCES "public"."class_weekly_recaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_weekly_recap_entries" ADD CONSTRAINT "student_weekly_recap_entries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_class_weekly_recaps_class_id" ON "class_weekly_recaps" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_class_weekly_recap" ON "class_weekly_recaps" USING btree ("class_id","week_number");--> statement-breakpoint
CREATE INDEX "idx_class_weekly_recaps_status" ON "class_weekly_recaps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_student_weekly_recap_entries_recap_id" ON "student_weekly_recap_entries" USING btree ("recap_id");--> statement-breakpoint
CREATE INDEX "idx_student_weekly_recap_entries_student_id" ON "student_weekly_recap_entries" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_recap_student" ON "student_weekly_recap_entries" USING btree ("recap_id","student_id");