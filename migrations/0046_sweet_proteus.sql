ALTER TABLE "student_avatars" ADD COLUMN "background_item_id" uuid;--> statement-breakpoint
ALTER TABLE "student_avatars" ADD COLUMN "snapshot_url" text;--> statement-breakpoint
ALTER TABLE "student_avatars" ADD CONSTRAINT "student_avatars_background_item_id_shop_items_id_fk" FOREIGN KEY ("background_item_id") REFERENCES "public"."shop_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Phase 6 data migration: convert legacy equipped_items shape
--   from: { "hat": "uuid", "background": "uuid", ... }
--   to:   { "items": [ { itemId, category, x, y, scale, rotation, zIndex } ], "character": { x,y,scale,rotation,zIndex } }
-- The 'background' slot is hoisted into the new background_item_id column.
-- All other slot keys (hat/outfit/accessory) become items at default
-- center positions; the canvas will render them in a sensible default layout
-- the first time the student opens the editor. Rows that are already in the
-- new shape (have an "items" key) are skipped.
UPDATE "student_avatars" sa SET
  "background_item_id" = (
    CASE WHEN sa."equipped_items" ? 'background' AND jsonb_typeof(sa."equipped_items"->'background') = 'string'
      THEN (sa."equipped_items"->>'background')::uuid
      ELSE NULL
    END
  ),
  "equipped_items" = jsonb_build_object(
    'items', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'itemId', sub.value,
          'category', sub.key,
          'x', 0.5,
          'y', 0.5,
          'scale', 1.0,
          'rotation', 0,
          'zIndex', sub.idx
        ) ORDER BY sub.idx
      )
      FROM (
        SELECT key, value, (row_number() OVER ())::int AS idx
        FROM jsonb_each_text(sa."equipped_items")
        WHERE key <> 'background' AND value IS NOT NULL
      ) sub),
      '[]'::jsonb
    ),
    'character', jsonb_build_object('x', 0.5, 'y', 0.6, 'scale', 1.0, 'rotation', 0, 'zIndex', 0)
  )
WHERE NOT (sa."equipped_items" ? 'items');