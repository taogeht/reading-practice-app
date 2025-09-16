/**
 * ElevenLabs API client for text-to-speech generation
 */

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  description?: string;
}

export interface TTSGenerationOptions {
  text: string;
  voice_id?: string;
  model_id?: string;
  voice_settings?: {
    stability: number;
    similarity_boost: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
}

export interface TTSGenerationResult {
  success: boolean;
  audioBuffer?: ArrayBuffer;
  error?: string;
  contentType?: string;
}

class ElevenLabsClient {
  private apiKey: string;
  private baseUrl = 'https://api.elevenlabs.io/v1';

  constructor() {
    this.apiKey = process.env.ELEVEN_LABS_API_KEY || '';
    
    if (!this.apiKey) {
      console.warn('ELEVEN_LABS_API_KEY is not set. ElevenLabs functionality will be disabled.');
    }
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<ElevenLabsVoice[]> {
    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // If unauthorized, return default voices for demo purposes
          console.warn('ElevenLabs API key lacks voices_read permission. Using default voices.');
          return [
            {
              voice_id: 'pqHfZKP75CvOlQylNhV4',
              name: 'Bill',
              category: 'professional',
              description: 'Male voice for story narration'
            },
            {
              voice_id: 'tnSpp4vdxKPjI9w0GnoV',
              name: 'Sarah',
              category: 'professional', 
              description: 'Female voice for story narration'
            }
          ];
        }
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      // Always return only our two configured voices
      return [
        {
          voice_id: 'pqHfZKP75CvOlQylNhV4',
          name: 'Bill',
          category: 'professional',
          description: 'Male voice for story narration'
        },
        {
          voice_id: 'tnSpp4vdxKPjI9w0GnoV',
          name: 'Sarah',
          category: 'professional',
          description: 'Female voice for story narration'
        }
      ];
    } catch (error) {
      console.error('Error fetching voices:', error);
      // Return default voices as fallback
      return [
        {
          voice_id: 'pqHfZKP75CvOlQylNhV4',
          name: 'Bill',
          category: 'professional',
          description: 'Male voice for story narration'
        },
        {
          voice_id: 'tnSpp4vdxKPjI9w0GnoV',
          name: 'Sarah',
          category: 'professional',
          description: 'Female voice for story narration'
        }
      ];
    }
  }

  /**
   * Generate speech from text
   */
  async generateSpeech(options: TTSGenerationOptions): Promise<TTSGenerationResult> {
    try {
      const voiceId = options.voice_id || process.env.ELEVEN_LABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Default voice
      
      const requestBody = {
        text: options.text,
        model_id: options.model_id || 'eleven_monolingual_v1',
        voice_settings: options.voice_settings || {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
        },
      };

      const response = await fetch(`${this.baseUrl}/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs TTS error: ${response.status} - ${errorText}`);
      }

      const audioBuffer = await response.arrayBuffer();
      
      return {
        success: true,
        audioBuffer,
        contentType: 'audio/mpeg',
      };
    } catch (error) {
      console.error('Error generating speech:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'TTS generation failed',
      };
    }
  }

  /**
   * Generate TTS for multiple texts in batch
   */
  async generateBatchSpeech(
    texts: Array<{ id: string; text: string; voice_id?: string }>,
    onProgress?: (completed: number, total: number) => void
  ): Promise<Array<{ id: string; result: TTSGenerationResult }>> {
    const results: Array<{ id: string; result: TTSGenerationResult }> = [];
    
    for (let i = 0; i < texts.length; i++) {
      const item = texts[i];
      
      try {
        const result = await this.generateSpeech({
          text: item.text,
          voice_id: item.voice_id,
        });
        
        results.push({ id: item.id, result });
        
        if (onProgress) {
          onProgress(i + 1, texts.length);
        }
        
        // Add small delay to avoid rate limiting
        if (i < texts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        results.push({
          id: item.id,
          result: {
            success: false,
            error: error instanceof Error ? error.message : 'TTS generation failed',
          },
        });
      }
    }
    
    return results;
  }

  /**
   * Get user subscription info
   */
  async getUserSubscription(): Promise<{
    character_count: number;
    character_limit: number;
    can_extend_character_limit: boolean;
    allowed_to_extend_character_limit: boolean;
    next_character_count_reset_unix: number;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/user/subscription`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // If unauthorized, return default subscription info for demo
          console.warn('ElevenLabs API key lacks user_read permission. Using default quota.');
          return {
            character_count: 0,
            character_limit: 10000, // Default free tier limit
            can_extend_character_limit: false,
            allowed_to_extend_character_limit: false,
            next_character_count_reset_unix: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days from now
          };
        }
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching subscription:', error);
      // Return default subscription info as fallback
      return {
        character_count: 0,
        character_limit: 10000,
        can_extend_character_limit: false,
        allowed_to_extend_character_limit: false,
        next_character_count_reset_unix: Date.now() + (30 * 24 * 60 * 60 * 1000)
      };
    }
  }

  /**
   * Estimate character count for text
   */
  estimateCharacterCount(text: string): number {
    // ElevenLabs counts characters including spaces and punctuation
    return text.length;
  }

  /**
   * Check if we have enough quota for text generation
   */
  async checkQuota(textLength: number): Promise<{
    hasQuota: boolean;
    remainingChars: number;
    requiredChars: number;
  }> {
    try {
      const subscription = await this.getUserSubscription();
      const remainingChars = subscription.character_limit - subscription.character_count;
      
      return {
        hasQuota: remainingChars >= textLength,
        remainingChars,
        requiredChars: textLength,
      };
    } catch (error) {
      // If we can't check quota, assume we have it
      return {
        hasQuota: true,
        remainingChars: Infinity,
        requiredChars: textLength,
      };
    }
  }
}

// Create singleton instance
export const elevenLabsClient = new ElevenLabsClient();

// Export function to get user subscription (for use in API routes)
export async function getUserSubscription() {
  return await elevenLabsClient.getUserSubscription();
}