CREATE TABLE "class_syllabus_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"pages" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "class_syllabus_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"title" varchar(255),
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "syllabus_url" varchar(500);--> statement-breakpoint
ALTER TABLE "class_syllabus_assignments" ADD CONSTRAINT "class_syllabus_assignments_week_id_class_syllabus_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."class_syllabus_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_syllabus_assignments" ADD CONSTRAINT "class_syllabus_assignments_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_syllabus_weeks" ADD CONSTRAINT "class_syllabus_weeks_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_syllabus_assignments_week_id" ON "class_syllabus_assignments" USING btree ("week_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_week_book" ON "class_syllabus_assignments" USING btree ("week_id","book_id");--> statement-breakpoint
CREATE INDEX "idx_syllabus_weeks_class_id" ON "class_syllabus_weeks" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_class_week" ON "class_syllabus_weeks" USING btree ("class_id","week_number");