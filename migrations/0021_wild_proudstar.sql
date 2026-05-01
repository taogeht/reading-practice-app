CREATE TABLE "class_practice_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"unit" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "class_practice_units" ADD CONSTRAINT "class_practice_units_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_class_practice_unit" ON "class_practice_units" USING btree ("class_id","unit");--> statement-breakpoint
CREATE INDEX "idx_class_practice_units_class_id" ON "class_practice_units" USING btree ("class_id");--> statement-breakpoint
-- Backfill: every existing class gets every currently-available practice unit
-- so legacy classes don't lose practice access on first deploy of opt-in mode.
INSERT INTO "class_practice_units" ("class_id", "unit")
SELECT c.id, u.unit
FROM "classes" c
CROSS JOIN (VALUES (13)) AS u(unit)
ON CONFLICT ("class_id", "unit") DO NOTHING;