ALTER TABLE "classes"
ADD COLUMN IF NOT EXISTS "rollover_from_class_id" uuid REFERENCES "classes"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_classes_teacher_name_year"
ON "classes" ("teacher_id", "name", "academic_year")
WHERE "academic_year" IS NOT NULL;
