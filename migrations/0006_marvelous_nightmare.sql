CREATE TABLE "spelling_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"week_number" integer,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "spelling_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spelling_list_id" uuid NOT NULL,
	"word" varchar(100) NOT NULL,
	"audio_url" varchar(500),
	"order_index" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "tts_audio" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "spelling_lists" ADD CONSTRAINT "spelling_lists_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spelling_words" ADD CONSTRAINT "spelling_words_spelling_list_id_spelling_lists_id_fk" FOREIGN KEY ("spelling_list_id") REFERENCES "public"."spelling_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_spelling_lists_class_id" ON "spelling_lists" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "idx_spelling_lists_active" ON "spelling_lists" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_spelling_words_list_id" ON "spelling_words" USING btree ("spelling_list_id");--> statement-breakpoint
CREATE INDEX "idx_spelling_words_order" ON "spelling_words" USING btree ("spelling_list_id","order_index");--> statement-breakpoint
ALTER TABLE "stories" DROP COLUMN "tts_audio_url";--> statement-breakpoint
ALTER TABLE "stories" DROP COLUMN "tts_audio_duration_seconds";--> statement-breakpoint
ALTER TABLE "stories" DROP COLUMN "tts_generated_at";--> statement-breakpoint
ALTER TABLE "stories" DROP COLUMN "eleven_labs_voice_id";