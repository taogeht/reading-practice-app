CREATE TABLE "passage_page_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passage_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attempt_number" smallint NOT NULL,
	"audio_url" varchar(500) NOT NULL,
	"file_size_bytes" bigint,
	"audio_duration_seconds" numeric(5, 2),
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transcript" text,
	"letter_grade" varchar(2),
	"accuracy_score" numeric(5, 2),
	"wpm_score" numeric(5, 2),
	"analysis_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD CONSTRAINT "passage_page_recordings_passage_id_reading_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."reading_passages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD CONSTRAINT "passage_page_recordings_page_id_story_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."story_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD CONSTRAINT "passage_page_recordings_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_passage_page_recordings_unique_attempt" ON "passage_page_recordings" USING btree ("page_id","student_id","attempt_number");--> statement-breakpoint
CREATE INDEX "idx_passage_page_recordings_student_recent" ON "passage_page_recordings" USING btree ("student_id","submitted_at");--> statement-breakpoint
CREATE INDEX "idx_passage_page_recordings_passage_student" ON "passage_page_recordings" USING btree ("passage_id","student_id");