CREATE TABLE "spelling_game_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"spelling_word_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"won" boolean NOT NULL,
	"wrong_guesses" integer DEFAULT 0 NOT NULL,
	"guessed_letters" jsonb,
	"time_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "spelling_game_results" ADD CONSTRAINT "spelling_game_results_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spelling_game_results" ADD CONSTRAINT "spelling_game_results_spelling_word_id_spelling_words_id_fk" FOREIGN KEY ("spelling_word_id") REFERENCES "public"."spelling_words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spelling_game_results" ADD CONSTRAINT "spelling_game_results_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_game_results_student_id" ON "spelling_game_results" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_game_results_word_id" ON "spelling_game_results" USING btree ("spelling_word_id");--> statement-breakpoint
CREATE INDEX "idx_game_results_class_id" ON "spelling_game_results" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "idx_game_results_class_word" ON "spelling_game_results" USING btree ("class_id","spelling_word_id");