ALTER TABLE "classes" ADD COLUMN "slug" varchar(60);--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_slug_unique" UNIQUE("slug");