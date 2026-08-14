-- Keep class login links viable after a cohort is promoted. The archived
-- source class points to the newly created class; login resolution follows
-- this chain until it reaches the current active class.
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "promoted_to_class_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "classes"
    ADD CONSTRAINT "classes_promoted_to_class_id_classes_id_fk"
    FOREIGN KEY ("promoted_to_class_id")
    REFERENCES "public"."classes"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_classes_promoted_to"
  ON "classes" ("promoted_to_class_id");
