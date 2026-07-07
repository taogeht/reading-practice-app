-- Hot-path indexes (2026-07 audit): classes had zero FK indexes despite
-- accessibleClassIds() filtering on teacher_id on nearly every teacher/admin
-- request, and class_enrollments' classId-led composite can't serve the
-- WHERE student_id = ? lookups every student page runs.
CREATE INDEX IF NOT EXISTS "idx_classes_teacher" ON "classes" ("teacher_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_classes_school" ON "classes" ("school_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_classes_term" ON "classes" ("term_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_class_enrollments_student" ON "class_enrollments" ("student_id");
