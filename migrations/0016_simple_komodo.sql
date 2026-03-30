CREATE TYPE "public"."media_type" AS ENUM('video', 'photo', 'audio');--> statement-breakpoint
CREATE TABLE "spelling_word_sentences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spelling_word_id" uuid NOT NULL,
	"grade_level" integer NOT NULL,
	"sentence" text NOT NULL,
	"answer" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "student_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"uploaded_by_id" uuid NOT NULL,
	"media_type" "media_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"file_key" varchar(500) NOT NULL,
	"file_url" varchar(500) NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"thumbnail_key" varchar(500),
	"duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "spelling_game_results" ADD COLUMN "activity_type" varchar(30) DEFAULT 'snowman';--> statement-breakpoint
ALTER TABLE "spelling_words" ADD COLUMN "mandarin_translation" varchar(100);--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "oup_email" varchar(255);--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "oup_password" varchar(255);--> statement-breakpoint
ALTER TABLE "spelling_word_sentences" ADD CONSTRAINT "spelling_word_sentences_spelling_word_id_spelling_words_id_fk" FOREIGN KEY ("spelling_word_id") REFERENCES "public"."spelling_words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_media" ADD CONSTRAINT "student_media_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_media" ADD CONSTRAINT "student_media_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_student_media_student_id" ON "student_media" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_student_media_uploaded_by" ON "student_media" USING btree ("uploaded_by_id");--> statement-breakpoint
CREATE INDEX "idx_student_media_created_at" ON "student_media" USING btree ("created_at");