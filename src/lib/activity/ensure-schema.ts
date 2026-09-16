import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

let schemaEnsured = false;
let schemaPromise: Promise<void> | null = null;

/**
 * Idempotently ensures the student_daily_activity table and session columns exist.
 * Uses CREATE TABLE IF NOT EXISTS and ALTER TABLE ADD COLUMN IF NOT EXISTS.
 * Runs once per process lifetime; safe and additive.
 */
export async function ensureStudentDailyActivitySchema(): Promise<void> {
    if (schemaEnsured) return;
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        try {
            await db.execute(sql`
                CREATE TABLE IF NOT EXISTS "student_daily_activity" (
                    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
                    "student_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
                    "date" date NOT NULL,
                    "activity_type" varchar(32) NOT NULL,
                    "seconds_active" integer DEFAULT 0 NOT NULL,
                    "last_context_label" varchar(255),
                    "last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
                    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
                    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
                );

                CREATE UNIQUE INDEX IF NOT EXISTS "uq_student_daily_activity"
                    ON "student_daily_activity" ("student_id", "date", "activity_type");

                CREATE INDEX IF NOT EXISTS "idx_student_daily_activity_lookup"
                    ON "student_daily_activity" ("student_id", "date");

                CREATE INDEX IF NOT EXISTS "idx_student_daily_activity_date"
                    ON "student_daily_activity" ("date");

                ALTER TABLE "session"
                    ADD COLUMN IF NOT EXISTS "current_activity_type" varchar(32),
                    ADD COLUMN IF NOT EXISTS "current_activity_label" varchar(255);
            `);
            schemaEnsured = true;
        } catch (err) {
            console.warn('[ensureStudentDailyActivitySchema] Notice: Auto-migration check encountered:', err);
        } finally {
            schemaPromise = null;
        }
    })();

    return schemaPromise;
}
