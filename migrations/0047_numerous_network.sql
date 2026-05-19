ALTER TABLE "passage_page_recordings" ADD COLUMN "wcpm" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "total_words" integer;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "correct_words" integer;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "long_pause_count" integer;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "intrusion_pause_count" integer;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "pause_at_punctuation_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "avg_pause_ms" integer;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "substitution_count" integer;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "omission_count" integer;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "insertion_count" integer;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "self_correction_count" integer;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "esl_wcpm_band" varchar(20);--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "native_wcpm_band" varchar(20);--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "passage_level" smallint;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "phrasing_score" smallint;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "smoothness_score" smallint;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "pace_score" smallint;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "fluency_score" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "fluency_version" integer;--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD COLUMN "teacher_summary" text;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "wcpm" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "total_words" integer;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "correct_words" integer;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "long_pause_count" integer;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "intrusion_pause_count" integer;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "pause_at_punctuation_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "avg_pause_ms" integer;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "substitution_count" integer;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "omission_count" integer;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "insertion_count" integer;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "self_correction_count" integer;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "esl_wcpm_band" varchar(20);--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "native_wcpm_band" varchar(20);--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "passage_level" smallint;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "phrasing_score" smallint;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "smoothness_score" smallint;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "pace_score" smallint;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "fluency_score" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "fluency_version" integer;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "teacher_summary" text;--> statement-breakpoint
-- Fluency band + prosody score CHECK constraints. Applied to both recording
-- tables. Match the enum values produced by src/lib/grading/fluency/* — any
-- new band/score range needs an ALTER TABLE here too.
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_esl_wcpm_band_known" CHECK ("esl_wcpm_band" IS NULL OR "esl_wcpm_band" IN ('concern','developing','on_target','above_target'));--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_native_wcpm_band_known" CHECK ("native_wcpm_band" IS NULL OR "native_wcpm_band" IN ('concern','developing','on_target','above_target'));--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_phrasing_score_range" CHECK ("phrasing_score" IS NULL OR ("phrasing_score" BETWEEN 1 AND 4));--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_smoothness_score_range" CHECK ("smoothness_score" IS NULL OR ("smoothness_score" BETWEEN 1 AND 4));--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_pace_score_range" CHECK ("pace_score" IS NULL OR ("pace_score" BETWEEN 1 AND 4));--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD CONSTRAINT "ppr_esl_wcpm_band_known" CHECK ("esl_wcpm_band" IS NULL OR "esl_wcpm_band" IN ('concern','developing','on_target','above_target'));--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD CONSTRAINT "ppr_native_wcpm_band_known" CHECK ("native_wcpm_band" IS NULL OR "native_wcpm_band" IN ('concern','developing','on_target','above_target'));--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD CONSTRAINT "ppr_phrasing_score_range" CHECK ("phrasing_score" IS NULL OR ("phrasing_score" BETWEEN 1 AND 4));--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD CONSTRAINT "ppr_smoothness_score_range" CHECK ("smoothness_score" IS NULL OR ("smoothness_score" BETWEEN 1 AND 4));--> statement-breakpoint
ALTER TABLE "passage_page_recordings" ADD CONSTRAINT "ppr_pace_score_range" CHECK ("pace_score" IS NULL OR ("pace_score" BETWEEN 1 AND 4));