ALTER TABLE "spelling_words" ADD COLUMN "image_url" varchar(500);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "login_token" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_login_token_unique" UNIQUE("login_token");