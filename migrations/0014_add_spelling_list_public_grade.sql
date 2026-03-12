ALTER TABLE "spelling_lists" ADD COLUMN "grade_level" integer;--> statement-breakpoint
ALTER TABLE "spelling_lists" ADD COLUMN "is_public" boolean DEFAULT false;--> statement-breakpoint
CREATE INDEX "idx_spelling_lists_is_public" ON "spelling_lists" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "idx_spelling_lists_grade_level" ON "spelling_lists" USING btree ("grade_level");