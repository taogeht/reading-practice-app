ALTER TABLE "class_practice_units" ADD COLUMN IF NOT EXISTS "book_slug" varchar(50) DEFAULT 'family-friends-1' NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "unique_class_practice_unit";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_class_practice_book_unit" ON "class_practice_units" ("class_id","book_slug","unit");
