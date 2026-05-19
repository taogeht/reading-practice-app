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
CREATE UNIQUE INDEX "unique_student_item" ON "student_inventory" USING btree ("student_id","item_id");