CREATE TYPE "public"."passage_status" AS ENUM('draft', 'review', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."reading_question_type" AS ENUM('mcq_comprehension', 'vocab_matching', 'sequence_order');--> statement-breakpoint
CREATE TYPE "public"."reading_session_status" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "reading_passages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"reading_level" smallint NOT NULL,
	"target_vocab_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"page_count" smallint NOT NULL,
	"status" "passage_status" DEFAULT 'draft' NOT NULL,
	"generation_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"summary" text,
	"cover_image_key" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passage_id" uuid NOT NULL,
	"question_type" "reading_question_type" NOT NULL,
	"question_text" text NOT NULL,
	"order_index" smallint NOT NULL,
	"payload" jsonb NOT NULL,
	"vocab_word_id" uuid,
	"evidence_quote" text,
	"evidence_page_number" smallint,
	"difficulty" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passage_id" uuid NOT NULL,
	"page_number" smallint NOT NULL,
	"text" text NOT NULL,
	"image_key" text,
	"image_prompt_used" text,
	"tts_audio_key" text,
	"tts_voice" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_reading_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer_given" jsonb NOT NULL,
	"is_correct" boolean NOT NULL,
	"time_seconds" integer NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_reading_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"passage_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"pages_viewed" smallint DEFAULT 0 NOT NULL,
	"questions_answered" smallint DEFAULT 0 NOT NULL,
	"questions_correct" smallint DEFAULT 0 NOT NULL,
	"completion_status" "reading_session_status" DEFAULT 'in_progress' NOT NULL,
	"time_seconds_total" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_vocabulary_mastery" (
	"student_id" uuid NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"exposures" integer DEFAULT 0 NOT NULL,
	"successes" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone,
	"mastery_score" numeric(4, 3) DEFAULT '0' NOT NULL,
	"mastery_updated_at" timestamp with time zone,
	CONSTRAINT "student_vocabulary_mastery_student_id_vocabulary_id_pk" PRIMARY KEY("student_id","vocabulary_id")
);
--> statement-breakpoint
ALTER TABLE "reading_passages" ADD CONSTRAINT "reading_passages_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_questions" ADD CONSTRAINT "reading_questions_passage_id_reading_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."reading_passages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_questions" ADD CONSTRAINT "reading_questions_vocab_word_id_vocabulary_id_fk" FOREIGN KEY ("vocab_word_id") REFERENCES "public"."vocabulary"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_pages" ADD CONSTRAINT "story_pages_passage_id_reading_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."reading_passages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_reading_answers" ADD CONSTRAINT "student_reading_answers_session_id_student_reading_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."student_reading_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_reading_answers" ADD CONSTRAINT "student_reading_answers_question_id_reading_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."reading_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_reading_sessions" ADD CONSTRAINT "student_reading_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_reading_sessions" ADD CONSTRAINT "student_reading_sessions_passage_id_reading_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."reading_passages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_vocabulary_mastery" ADD CONSTRAINT "student_vocabulary_mastery_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_vocabulary_mastery" ADD CONSTRAINT "student_vocabulary_mastery_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_reading_passages_status_level" ON "reading_passages" USING btree ("status","reading_level");--> statement-breakpoint
CREATE INDEX "idx_reading_passages_status_active" ON "reading_passages" USING btree ("status","is_active");--> statement-breakpoint
CREATE INDEX "idx_reading_questions_passage_id" ON "reading_questions" USING btree ("passage_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_story_page" ON "story_pages" USING btree ("passage_id","page_number");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_session_question" ON "student_reading_answers" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE INDEX "idx_student_reading_answers_question_id" ON "student_reading_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_student_reading_sessions_recent" ON "student_reading_sessions" USING btree ("student_id","passage_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_student_reading_sessions_status" ON "student_reading_sessions" USING btree ("student_id","completion_status");