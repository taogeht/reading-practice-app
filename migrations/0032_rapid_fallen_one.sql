CREATE TYPE "public"."af_f_level" AS ENUM('starter', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6');--> statement-breakpoint
CREATE TYPE "public"."cefr_level" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2');--> statement-breakpoint
CREATE TYPE "public"."part_of_speech" AS ENUM('noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection', 'determiner', 'other');--> statement-breakpoint
CREATE TABLE "vocabulary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word" text NOT NULL,
	"part_of_speech" "part_of_speech" NOT NULL,
	"af_f_level" "af_f_level",
	"af_f_unit" smallint,
	"cefr_level" "cefr_level",
	"example_sentence" text,
	"mandarin_translation" text,
	"introduces_phonics_pattern" text,
	"is_function_word" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_word_unique" UNIQUE("word")
);
--> statement-breakpoint
CREATE INDEX "idx_vocabulary_aff_level_unit" ON "vocabulary" USING btree ("af_f_level","af_f_unit");--> statement-breakpoint
CREATE INDEX "idx_vocabulary_cefr" ON "vocabulary" USING btree ("cefr_level");