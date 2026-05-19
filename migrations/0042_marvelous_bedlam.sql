CREATE TABLE "star_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"direction" varchar(10) NOT NULL,
	"source_type" varchar(30) NOT NULL,
	"source_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_star_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "student_progression" ADD COLUMN "stars_balance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_progression" ADD COLUMN "stars_lifetime" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_progression" ADD CONSTRAINT "stars_balance_nonneg" CHECK ("stars_balance" >= 0);--> statement-breakpoint
ALTER TABLE "star_transactions" ADD CONSTRAINT "star_tx_amount_nonzero" CHECK ("amount" <> 0);--> statement-breakpoint
ALTER TABLE "teacher_star_grants" ADD CONSTRAINT "teacher_grant_amount_positive" CHECK ("amount" > 0);--> statement-breakpoint
ALTER TABLE "star_transactions" ADD CONSTRAINT "star_transactions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_star_grants" ADD CONSTRAINT "teacher_star_grants_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_star_grants" ADD CONSTRAINT "teacher_star_grants_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_star_tx_student_created" ON "star_transactions" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_grants_teacher_created" ON "teacher_star_grants" USING btree ("teacher_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_grants_student" ON "teacher_star_grants" USING btree ("student_id");