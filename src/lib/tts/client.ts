import textToSpeech from '@google-cloud/text-to-speech';

export interface TTSVoice {
  voice_id: string;
  name: string;
  languageCode: string;
  ssmlGender: 'FEMALE' | 'MALE';
  description?: string;
  speakingRate?: number;
  pitch?: number;
  category?: string;
}

export interface TTSGenerationOptions {
  text: string;
  voice_id?: string;
  speakingRate?: number;
  pitch?: number;
}

export interface TTSGenerationResult {
  success: boolean;
  audioBuffer?: Buffer;
  error?: string;
  contentType?: string;
}

const { TextToSpeechClient } = textToSpeech;

const DEFAULT_VOICES: TTSVoice[] = [
  {
    voice_id: 'en-US-Neural2-F',
    name: 'Warm Narrator (US Female)',
    languageCode: 'en-US',
    ssmlGender: 'FEMALE',
    description: 'Clear, expressive female voice well suited for read-along stories.',
    speakingRate: 1.0,
    pitch: 0,
    category: 'narration',
  },
  {
    voice_id: 'en-US-Neural2-D',
    name: 'Confident Narrator (US Male)',
    languageCode: 'en-US',
    ssmlGender: 'MALE',
    description: 'Calm and confident male narration voice for educational content.',
    speakingRate: 1.0,
    pitch: 0,
    category: 'narration',
  },
  {
    voice_id: 'en-GB-Neural2-A',
    name: 'UK Narrator (Female)',
    languageCode: 'en-GB',
    ssmlGender: 'FEMALE',
    description: 'British English voice with friendly classroom tone.',
    speakingRate: 1.0,
    pitch: 0,
    category: 'narration',
  },
];

class GoogleTtsClient {
  private client: textToSpeech.TextToSpeechClient | null = null;
  private configured = false;

  constructor() {
    const projectId = process.env.GOOGLE_TTS_PROJECT_ID;
    const clientEmail = process.env.GOOGLE_TTS_CLIENT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_TTS_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKeyRaw) {
      console.warn(
        'Google Cloud TTS credentials are not fully configured. Set GOOGLE_TTS_PROJECT_ID, GOOGLE_TTS_CLIENT_EMAIL, and GOOGLE_TTS_PRIVATE_KEY.',
      );
      return;
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

    try {
      this.client = new TextToSpeechClient({
        projectId,
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
        },
      });
      this.configured = true;
    } catch (error) {
      console.error('Failed to initialise Google Cloud TTS client:', error);
      this.client = null;
      this.configured = false;
    }
  }

  isConfigured() {
    return this.configured && this.client !== null;
  }

  getVoices(): TTSVoice[] {
    return DEFAULT_VOICES;
  }

  private resolveVoice(voiceId?: string): TTSVoice {
    if (voiceId) {
      const match = DEFAULT_VOICES.find((voice) => voice.voice_id === voiceId);
      if (match) {
        return match;
      }
    }
    return DEFAULT_VOICES[0];
  }

  async generateSpeech(options: TTSGenerationOptions): Promise<TTSGenerationResult> {
    if (!this.client) {
      return {
        success: false,
        error:
          'Google Cloud Text-to-Speech is not configured. Please provide GOOGLE_TTS_PROJECT_ID, GOOGLE_TTS_CLIENT_EMAIL, and GOOGLE_TTS_PRIVATE_KEY.',
      };
    }

    if (!options.text || !options.text.trim()) {
      return {
        success: false,
        error: 'No text provided for synthesis.',
      };
    }

    try {
      const voice = this.resolveVoice(options.voice_id);

      const [response] = await this.client.synthesizeSpeech({
        input: { text: options.text },
        voice: {
          languageCode: voice.languageCode,
          name: voice.voice_id,
          ssmlGender: voice.ssmlGender,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: options.speakingRate ?? voice.speakingRate ?? 1.0,
          pitch: options.pitch ?? voice.pitch ?? 0,
        },
      });

      const audioContent = response.audioContent;

      if (!audioContent) {
        return {
          success: false,
          error: 'No audio content returned from Google Cloud Text-to-Speech.',
        };
      }

      const audioBuffer = Buffer.isBuffer(audioContent)
        ? audioContent
        : typeof audioContent === 'string'
          ? Buffer.from(audioContent, 'base64')
          : Buffer.from(audioContent);

      return {
        success: true,
        audioBuffer,
        contentType: 'audio/mpeg',
      };
    } catch (error) {
      console.error('Google Cloud TTS error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Google Cloud TTS generation failed',
      };
    }
  }

  async generateBatchSpeech(
    texts: Array<{ id: string; text: string; voice_id?: string }>,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<Array<{ id: string; result: TTSGenerationResult }>> {
    const results: Array<{ id: string; result: TTSGenerationResult }> = [];

    for (let index = 0; index < texts.length; index++) {
      const item = texts[index];
      const result = await this.generateSpeech({
        text: item.text,
        voice_id: item.voice_id,
      });

      results.push({ id: item.id, result });

      if (onProgress) {
        onProgress(index + 1, texts.length);
      }
    }

    return results;
  }

  async checkQuota(textLength: number): Promise<{
    hasQuota: boolean;
    remainingChars: number;
    requiredChars: number;
  }> {
    return {
      hasQuota: true,
      remainingChars: Number.POSITIVE_INFINITY,
      requiredChars: textLength,
    };
  }
}

export const googleTtsClient = new GoogleTtsClient();
