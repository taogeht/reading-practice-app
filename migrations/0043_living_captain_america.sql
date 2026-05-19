CREATE TABLE "class_shop_items" (
	"class_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "class_shop_items_class_id_item_id_pk" PRIMARY KEY("class_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid,
	"type" varchar(30) NOT NULL,
	"category" varchar(30) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"star_cost" integer NOT NULL,
	"character_type" varchar(20),
	"asset_type" varchar(10) DEFAULT 'css' NOT NULL,
	"asset_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"min_level" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_items_star_cost_positive" CHECK ("star_cost" > 0),
	CONSTRAINT "shop_items_type_known" CHECK ("type" IN ('avatar_cosmetic', 'collectible')),
	CONSTRAINT "shop_items_asset_type_known" CHECK ("asset_type" IN ('css', 'image')),
	CONSTRAINT "shop_items_character_type_known" CHECK ("character_type" IS NULL OR "character_type" IN ('human', 'animal', 'robot'))
);
--> statement-breakpoint
CREATE TABLE "student_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_shop_items" ADD CONSTRAINT "class_shop_items_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_shop_items" ADD CONSTRAINT "class_shop_items_item_id_shop_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."shop_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_items" ADD CONSTRAINT "shop_items_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_inventory" ADD CONSTRAINT "student_inventory_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_inventory" ADD CONSTRAINT "student_inventory_item_id_shop_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."shop_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_class_shop_items_class" ON "class_shop_items" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "idx_shop_items_school_active_sort" ON "shop_items" USING btree ("school_id","is_active","sort_order");--> statement-breakpoint
CREATE INDEX "idx_shop_items_type_category" ON "shop_items" USING btree ("type","category");--> statement-breakpoint
CREATE INDEX "idx_student_inventory_student_time" ON "student_inventory" USING btree ("student_id","acquired_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_student_item" ON "student_inventory" USING btree ("student_id","item_id");--> statement-breakpoint
-- Phase 2 seed: 13 starter shop items + 3 starter scenes. school_id NULL means
-- built-in (available to every school). Each row is guarded by NOT EXISTS on
-- (school_id IS NULL, type, category, name) so the migration is safe to re-run
-- and never duplicates rows. To update prices/copy later, edit
-- scripts/seed-shop-items.ts and re-run that script — it does upsert-on-natural-key.
INSERT INTO "shop_items" ("type", "category", "name", "description", "star_cost", "asset_type", "asset_data", "sort_order")
SELECT v.type, v.category, v.name, v.description, v.star_cost, v.asset_type, v.asset_data::jsonb, v.sort_order
FROM (VALUES
    ('avatar_cosmetic', 'hat',        'Party Hat',         'Time to celebrate!',                 8,  'css', '{"emoji":"🎉","color":"#FF6B6B","layer":"hat"}',         10),
    ('avatar_cosmetic', 'hat',        'Wizard Hat',        'Pure magic.',                        15,  'css', '{"emoji":"🧙","color":"#7B68EE","layer":"hat"}',         20),
    ('avatar_cosmetic', 'hat',        'Crown',             'For the top student.',               25,  'css', '{"emoji":"👑","color":"#FFD700","layer":"hat"}',         30),
    ('avatar_cosmetic', 'accessory',  'Rainbow Scarf',     'Very cozy.',                         10,  'css', '{"emoji":"🌈","color":"#FF9999","layer":"accessory"}',   10),
    ('avatar_cosmetic', 'accessory',  'Star Glasses',      'See the world differently.',         12,  'css', '{"emoji":"⭐","color":"#FFE066","layer":"accessory"}',   20),
    ('avatar_cosmetic', 'background', 'Space',             'To infinity!',                       20,  'css', '{"emoji":"🚀","color":"#1a1a2e","layer":"background"}',  10),
    ('avatar_cosmetic', 'background', 'Garden',            'Fresh and green.',                   20,  'css', '{"emoji":"🌸","color":"#d4edda","layer":"background"}',  20),
    ('collectible',     'sticker',    'Gold Star',         'The classic.',                        5,  'css', '{"emoji":"⭐","color":"#FFD700","layer":"collectible"}', 10),
    ('collectible',     'sticker',    'Rainbow',           'Bright and happy.',                   5,  'css', '{"emoji":"🌈","color":"#FF9999","layer":"collectible"}', 20),
    ('collectible',     'trophy',     'Reading Trophy',    'For bookworms.',                     15,  'css', '{"emoji":"📚","color":"#8B4513","layer":"collectible"}', 30),
    ('collectible',     'trophy',     'Quiz Champion',     'Ace every question.',                15,  'css', '{"emoji":"🏆","color":"#FFD700","layer":"collectible"}', 40),
    ('collectible',     'pet',        'Baby Dragon',       'Friendly fire.',                     20,  'css', '{"emoji":"🐉","color":"#90EE90","layer":"collectible"}', 50),
    ('collectible',     'pet',        'Lucky Cat',         'Good fortune ahead.',                20,  'css', '{"emoji":"🐱","color":"#FFB347","layer":"collectible"}', 60),
    ('avatar_cosmetic', 'scene',      'Cozy Classroom',    'A bright, cheerful classroom full of books and color.', 25, 'css', '{"emoji":"🏫","color":"#FFE5B4","layer":"background","scene_prompt":"a cozy cartoon classroom scene, colorful desks, books on shelves, big windows with sunshine, alphabet posters on walls, plants, cheerful and bright"}', 100),
    ('avatar_cosmetic', 'scene',      'Outer Space',       'Floating among the stars!',          30,  'css', '{"emoji":"🚀","color":"#0d1b2a","layer":"background","scene_prompt":"a cute cartoon outer space scene, colorful planets, stars, a small rocket ship, nebula clouds in purples and blues, fun and adventurous, kid-friendly"}', 110),
    ('avatar_cosmetic', 'scene',      'Enchanted Forest',  'Magical trees and glowing mushrooms.', 30, 'css', '{"emoji":"🌲","color":"#1a472a","layer":"background","scene_prompt":"a cute cartoon enchanted forest scene, tall colorful trees, glowing mushrooms, fireflies, soft magical light beams, friendly and whimsical, kid-friendly"}', 120)
) AS v(type, category, name, description, star_cost, asset_type, asset_data, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM "shop_items" existing
    WHERE existing.school_id IS NULL
      AND existing.type = v.type
      AND existing.category = v.category
      AND existing.name = v.name
);