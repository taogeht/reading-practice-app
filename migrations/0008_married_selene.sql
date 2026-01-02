CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'excused');--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"status" "attendance_status" DEFAULT 'present' NOT NULL,
	"notes" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"publisher" varchar(255),
	"isbn" varchar(50),
	"total_pages" integer,
	"grade_levels" integer[],
	"subject" varchar(100),
	"cover_image_url" varchar(500),
	"active" boolean DEFAULT true,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "class_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now(),
	"is_current" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "class_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"pages_completed" varchar(100),
	"lesson_notes" text,
	"homework_assigned" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "class_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_books" ADD CONSTRAINT "class_books_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_books" ADD CONSTRAINT "class_books_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_progress" ADD CONSTRAINT "class_progress_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_progress" ADD CONSTRAINT "class_progress_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_progress" ADD CONSTRAINT "class_progress_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attendance_class_id" ON "attendance_records" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "idx_attendance_student_id" ON "attendance_records" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_attendance_date" ON "attendance_records" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_attendance_record" ON "attendance_records" USING btree ("class_id","student_id","date");--> statement-breakpoint
CREATE INDEX "idx_books_active" ON "books" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_class_books_class_id" ON "class_books" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_class_book" ON "class_books" USING btree ("class_id","book_id");--> statement-breakpoint
CREATE INDEX "idx_class_progress_class_id" ON "class_progress" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "idx_class_progress_book_id" ON "class_progress" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_class_progress_date" ON "class_progress" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_class_schedules_class_id" ON "class_schedules" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_class_day" ON "class_schedules" USING btree ("class_id","day_of_week");