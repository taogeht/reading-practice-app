CREATE TABLE "base_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_type" varchar(20) NOT NULL,
	"variant_index" integer NOT NULL,
	"name" varchar(60) NOT NULL,
	"personality" text NOT NULL,
	"asset_url" text,
	"generation_prompt" text,
	"generation_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "base_characters_character_type_known" CHECK ("character_type" IN ('human', 'animal', 'robot')),
	CONSTRAINT "base_characters_generation_status_known" CHECK ("generation_status" IN ('pending', 'generating', 'complete', 'failed')),
	CONSTRAINT "base_characters_variant_index_positive" CHECK ("variant_index" > 0)
);
--> statement-breakpoint
ALTER TABLE "student_avatars" ADD COLUMN "character_id" uuid;--> statement-breakpoint
ALTER TABLE "student_avatars" ADD CONSTRAINT "student_avatars_character_id_base_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."base_characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_character_variant" ON "base_characters" USING btree ("character_type","variant_index");--> statement-breakpoint
INSERT INTO "base_characters" ("character_type", "variant_index", "name", "personality") VALUES
('human', 1, 'Sunny', 'cheerful and energetic, big smile, warm orange tones'),
('human', 2, 'Nova', 'cool and confident, determined expression, blue and silver tones'),
('human', 3, 'Pip', 'shy and curious, gentle expression, soft green and yellow tones'),
('animal', 1, 'Blaze', 'a bold lion cub, fierce but friendly, golden and red tones'),
('animal', 2, 'Mochi', 'a soft round bunny, calm and sweet, pastel pink and white tones'),
('animal', 3, 'Zap', 'an electric little fox, mischievous grin, yellow and purple tones'),
('robot', 1, 'Bolt', 'a sturdy cheerful robot, big round eyes, blue and silver tones'),
('robot', 2, 'Glitch', 'a quirky glitchy robot, one eye bigger than the other, green and black tones'),
('robot', 3, 'Sparky', 'a tiny energetic robot, always wiggling, red and gold tones');