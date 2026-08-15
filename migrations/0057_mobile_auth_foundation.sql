-- Native-app refresh credentials are separate from short-lived access sessions.
-- Only a one-way hash of each refresh token is stored.
CREATE TABLE IF NOT EXISTS "mobile_refresh_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "access_session_id" varchar(255),
  "token_hash" varchar(64) NOT NULL,
  "platform" varchar(20) NOT NULL,
  "device_name" varchar(100),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "mobile_refresh_sessions"
    ADD CONSTRAINT "mobile_refresh_sessions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "mobile_refresh_sessions"
    ADD CONSTRAINT "mobile_refresh_sessions_access_session_id_session_id_fk"
    FOREIGN KEY ("access_session_id") REFERENCES "public"."session"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_mobile_refresh_sessions_token_hash"
  ON "mobile_refresh_sessions" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mobile_refresh_sessions_user"
  ON "mobile_refresh_sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mobile_refresh_sessions_expires"
  ON "mobile_refresh_sessions" ("expires_at");
--> statement-breakpoint

-- Authentication throttling must be shared across processes. Keys contain a
-- SHA-256 digest rather than raw student, token, or network identifiers.
CREATE TABLE IF NOT EXISTS "auth_rate_limits" (
  "key_hash" varchar(64) PRIMARY KEY NOT NULL,
  "failure_count" integer DEFAULT 0 NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL,
  "locked_until" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
