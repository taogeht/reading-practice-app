CREATE TABLE IF NOT EXISTS "gradebook_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"test_type" varchar(40) DEFAULT 'quiz' NOT NULL,
	"test_date" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gradebook_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"score" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gradebook_tests" ADD CONSTRAINT "gradebook_tests_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gradebook_tests" ADD CONSTRAINT "gradebook_tests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gradebook_scores" ADD CONSTRAINT "gradebook_scores_test_id_gradebook_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."gradebook_tests"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gradebook_scores" ADD CONSTRAINT "gradebook_scores_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_gradebook_test_student" ON "gradebook_scores" USING btree ("test_id","student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gradebook_scores_student" ON "gradebook_scores" USING btree ("student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gradebook_tests_class_date" ON "gradebook_tests" USING btree ("class_id","test_date");
