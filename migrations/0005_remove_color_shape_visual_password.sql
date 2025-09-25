-- Remove legacy color/shape visual passwords in favor of animal/object options only
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visual_password_type') THEN
    -- Rehome any existing students using the color/shape option to a default animal password
    UPDATE "public"."students"
    SET
      visual_password_type = 'animal',
      visual_password_data = jsonb_build_object('animal', COALESCE(visual_password_data->>'animal', 'cat'))
    WHERE visual_password_type = 'color_shape';

    CREATE TYPE "public"."visual_password_type_new" AS ENUM ('animal', 'object');

    ALTER TABLE "public"."students"
    ALTER COLUMN "visual_password_type"
    TYPE "public"."visual_password_type_new"
    USING (
      CASE
        WHEN visual_password_type::text = 'color_shape' THEN 'animal'
        ELSE visual_password_type::text
      END
    )::"public"."visual_password_type_new";

    DROP TYPE "public"."visual_password_type";
    ALTER TYPE "public"."visual_password_type_new" RENAME TO "visual_password_type";
  END IF;
END
$$;
