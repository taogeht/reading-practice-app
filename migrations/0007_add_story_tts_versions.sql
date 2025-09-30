ALTER TABLE "stories"
ADD COLUMN IF NOT EXISTS "tts_audio" jsonb;

UPDATE "stories"
SET "tts_audio" = CASE
  WHEN "tts_audio_url" IS NOT NULL THEN jsonb_build_array(jsonb_strip_nulls(
    jsonb_build_object(
      'id', gen_random_uuid(),
      'url', "tts_audio_url",
      'durationSeconds', "tts_audio_duration_seconds",
      'generatedAt', "tts_generated_at",
      'voiceId', "eleven_labs_voice_id"
    )
  ))
  ELSE '[]'::jsonb
END
WHERE "tts_audio" IS NULL;

ALTER TABLE "stories"
DROP COLUMN IF EXISTS "tts_audio_url",
DROP COLUMN IF EXISTS "tts_audio_duration_seconds",
DROP COLUMN IF EXISTS "tts_generated_at",
DROP COLUMN IF EXISTS "eleven_labs_voice_id";
