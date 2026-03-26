import { AssemblyAI } from 'assemblyai';
import speech from '@google-cloud/speech';

export type SttProvider = 'assemblyai' | 'google';

export interface TranscriptionResult {
    success: boolean;
    transcript?: string;
    confidence?: number;
    error?: string;
    provider?: SttProvider;
}

// --- AssemblyAI ---

class AssemblyAIClient {
    private client: AssemblyAI | null = null;
    private configured = false;

    constructor() {
        const apiKey = process.env.ASSEMBLYAI_API_KEY;
        if (!apiKey) {
            console.warn('[STT] ASSEMBLYAI_API_KEY not configured.');
            return;
        }
        try {
            this.client = new AssemblyAI({ apiKey });
            this.configured = true;
        } catch (error) {
            console.error('[STT] Failed to init AssemblyAI client:', error);
        }
    }

    get isConfigured(): boolean {
        return this.configured;
    }

    async transcribeFromUrl(audioUrl: string): Promise<TranscriptionResult> {
        if (!this.client) return { success: false, error: 'AssemblyAI not configured' };

        try {
            console.log('[STT] Starting AssemblyAI transcription from URL');
            const transcript = await this.client.transcripts.transcribe({
                audio_url: audioUrl,
                speech_models: ['universal-3-pro'],
            } as any);

            if (transcript.status === 'error') {
                console.error(`[STT] AssemblyAI error: ${transcript.error}`);
                return { success: false, error: transcript.error || 'Transcription failed', provider: 'assemblyai' };
            }

            const text = transcript.text || '';
            const confidence = transcript.confidence ?? 0;
            console.log(`[STT] AssemblyAI done: ${text.length} chars, confidence=${confidence.toFixed(3)}`);
            return { success: true, transcript: text, confidence, provider: 'assemblyai' };
        } catch (error: any) {
            console.error('[STT] AssemblyAI error:', error.message || error);
            return { success: false, error: error.message || 'Transcription failed', provider: 'assemblyai' };
        }
    }
}

// --- Google Cloud STT ---

class GoogleSttClient {
    private client: speech.SpeechClient | null = null;
    private configured = false;

    constructor() {
        const projectId = process.env.GOOGLE_TTS_PROJECT_ID;
        const clientEmail = process.env.GOOGLE_TTS_CLIENT_EMAIL;
        const privateKeyRaw = process.env.GOOGLE_TTS_PRIVATE_KEY;

        if (!projectId || !clientEmail || !privateKeyRaw) {
            console.warn('[STT] Google Cloud credentials not configured.');
            return;
        }

        const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

        try {
            this.client = new speech.SpeechClient({
                projectId,
                credentials: { client_email: clientEmail, private_key: privateKey },
            });
            this.configured = true;
        } catch (error) {
            console.error('[STT] Failed to init Google STT client:', error);
        }
    }

    get isConfigured(): boolean {
        return this.configured;
    }

    async transcribe(audioBuffer: Buffer, mimeType: string): Promise<TranscriptionResult> {
        if (!this.client) return { success: false, error: 'Google STT not configured' };

        try {
            const encoding = this.getEncoding(mimeType);
            const audioContent = audioBuffer.toString('base64');
            const audioSizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(2);
            console.log(`[STT] Starting Google transcription: ${audioSizeMB} MB, encoding=${encoding}`);

            const [operation] = await this.client.longRunningRecognize({
                config: {
                    encoding,
                    languageCode: 'en-US',
                    enableAutomaticPunctuation: true,
                    audioChannelCount: 1,
                    model: 'latest_long',
                },
                audio: { content: audioContent },
            });

            const [response] = await operation.promise();

            if (!response.results || response.results.length === 0) {
                return { success: true, transcript: '', confidence: 0, provider: 'google' };
            }

            const transcript = response.results
                .map((r) => r.alternatives?.[0]?.transcript || '')
                .join(' ')
                .trim();
            const confidence = response.results[0]?.alternatives?.[0]?.confidence ?? 0;

            console.log(`[STT] Google done: ${transcript.length} chars, confidence=${confidence.toFixed(3)}`);
            return { success: true, transcript, confidence, provider: 'google' };
        } catch (error: any) {
            console.error('[STT] Google STT error:', error.message || error);
            return { success: false, error: error.message || 'Transcription failed', provider: 'google' };
        }
    }

    private getEncoding(mimeType: string): string {
        const mime = mimeType.toLowerCase().split(';')[0].trim();
        switch (mime) {
            case 'audio/wav':
            case 'audio/x-wav':
                return 'LINEAR16';
            case 'audio/mp3':
            case 'audio/mpeg':
                return 'MP3';
            case 'audio/ogg':
                return 'OGG_OPUS';
            case 'audio/webm':
                return 'WEBM_OPUS';
            case 'audio/mp4':
            case 'audio/m4a':
            case 'audio/x-m4a':
                return 'MP3';
            default:
                return 'WEBM_OPUS';
        }
    }
}

// --- Unified exports ---

export const assemblyAIClient = new AssemblyAIClient();
export const googleSttClient = new GoogleSttClient();

/** Convenience: check if a given provider is configured */
export function isProviderConfigured(provider: SttProvider): boolean {
    return provider === 'google' ? googleSttClient.isConfigured : assemblyAIClient.isConfigured;
}

/** Legacy default — still used by the isConfigured check in the route */
export const sttClient = assemblyAIClient;
