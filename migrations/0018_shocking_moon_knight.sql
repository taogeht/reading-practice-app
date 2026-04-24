CREATE TABLE "practice_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"selected_answer" varchar(100) NOT NULL,
	"is_correct" boolean NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "practice_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit" integer NOT NULL,
	"question_type" varchar(30) DEFAULT 'fill_blank_mcq' NOT NULL,
	"prompt" text NOT NULL,
	"correct_answer" varchar(100) NOT NULL,
	"distractors" jsonb NOT NULL,
	"grade_level" integer DEFAULT 1,
	"generated_by" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"times_served" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_question_id_practice_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."practice_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_questions" ADD CONSTRAINT "practice_questions_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_practice_attempts_student_id" ON "practice_attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_practice_attempts_question_id" ON "practice_attempts" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_practice_questions_unit_active" ON "practice_questions" USING btree ("unit","active");--> statement-breakpoint
CREATE INDEX "idx_practice_questions_type" ON "practice_questions" USING btree ("question_type");