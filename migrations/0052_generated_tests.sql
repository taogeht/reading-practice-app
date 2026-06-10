CREATE TABLE IF NOT EXISTS "generated_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generated_by" uuid,
	"school_id" uuid,
	"book_slug" varchar(50) DEFAULT 'family-friends-1' NOT NULL,
	"units" jsonb NOT NULL,
	"title" text NOT NULL,
	"document" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "generated_tests" ADD CONSTRAINT "generated_tests_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "generated_tests" ADD CONSTRAINT "generated_tests_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_generated_tests_generated_by" ON "generated_tests" USING btree ("generated_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_generated_tests_school" ON "generated_tests" USING btree ("school_id");
