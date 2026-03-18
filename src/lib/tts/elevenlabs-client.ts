import { TTSGenerationOptions, TTSGenerationResult } from './client';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

const ELEVENLABS_VOICES = [
  {
    voice_id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Sarah - Confident',
    description: 'Mature, reassuring, confident. American accent.',
  },
  {
    voice_id: 'Xb7hH8MSUJpSbSDYk0k2',
    name: 'Alice - Educator',
    description: 'Clear, engaging educator voice. British accent.',
  },
  {
    voice_id: 'JBFqnCBsd6RMkjVDRZzb',
    name: 'George - Storyteller',
    description: 'Warm, captivating storyteller. British accent.',
  },
];

class ElevenLabsTtsClient {
  private apiKey: string | null = null;

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY || null;
    if (!this.apiKey) {
      console.warn('ELEVENLABS_API_KEY is not set. ElevenLabs TTS will be unavailable.');
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  getVoices() {
    return ELEVENLABS_VOICES;
  }

  async generateSpeech(options: TTSGenerationOptions): Promise<TTSGenerationResult> {
    if (!this.apiKey) {
      return { success: false, error: 'ElevenLabs API key is not configured.' };
    }

    if (!options.text || !options.text.trim()) {
      return { success: false, error: 'No text provided for synthesis.' };
    }

    const voiceId = options.voice_id || ELEVENLABS_VOICES[0].voice_id;

    try {
      const response = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: options.text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs API error:', response.status, errorText);
        return {
          success: false,
          error: `ElevenLabs API error: ${response.status} ${errorText}`,
        };
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      return {
        success: true,
        audioBuffer,
        contentType: 'audio/mpeg',
      };
    } catch (error) {
      console.error('ElevenLabs TTS error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'ElevenLabs TTS generation failed',
      };
    }
  }
}

export const elevenLabsTtsClient = new ElevenLabsTtsClient();
