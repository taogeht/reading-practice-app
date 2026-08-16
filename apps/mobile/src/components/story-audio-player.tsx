import { useEffect, useState } from 'react';
import type { MobileStoryAudio } from '@starling-rise/contracts';
import { useQuery } from '@tanstack/react-query';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getCachedAudio } from '@/media/audio-cache';
import { PrimaryButton } from '@/components/primary-button';
import { colors, radii, spacing, type } from '@/theme/tokens';

function formatTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function CachedAudioControls({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || 0;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: false,
      interruptionMode: 'doNotMix',
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    });
  }, []);

  function togglePlayback() {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (duration > 0 && status.currentTime >= duration)) {
      void player.seekTo(0).then(() => player.play());
      return;
    }
    player.play();
  }

  return (
    <View style={styles.controls}>
      <PrimaryButton
        accessibilityHint="Plays or pauses the story narration"
        label={status.playing ? 'Pause story  暫停故事' : 'Listen to story  聽故事'}
        onPress={togglePlayback}
      />
      <View
        accessible
        accessibilityLabel={`${formatTime(status.currentTime)} of ${formatTime(duration)}`}
        style={styles.timeline}
      >
        <View style={styles.track}>
          <View style={[styles.progress, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.time}>
          {formatTime(status.currentTime)} / {formatTime(duration)}
        </Text>
      </View>
      {status.error && (
        <Text accessibilityRole="alert" style={styles.error}>
          Audio stopped unexpectedly. Please try again. 音訊播放失敗，請再試一次。
        </Text>
      )}
    </View>
  );
}

export function StoryAudioPlayer({ voices }: { voices: MobileStoryAudio[] }) {
  const [selectedId, setSelectedId] = useState(voices[0]?.id ?? '');
  const selected = voices.find((voice) => voice.id === selectedId) ?? voices[0];
  const audio = useQuery({
    queryKey: ['story-audio', selected?.id, selected?.url],
    queryFn: () => getCachedAudio(`story-${selected.id}`, selected.url),
    enabled: Boolean(selected),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  if (!selected) {
    return (
      <View style={styles.unavailable}>
        <Text style={styles.unavailableTitle}>Narration is not ready yet</Text>
        <Text style={styles.unavailableBody}>故事音訊尚未準備好，你仍然可以先閱讀故事。</Text>
      </View>
    );
  }

  return (
    <View style={styles.player}>
      <View>
        <Text style={styles.heading}>Listen first</Text>
        <Text accessibilityLanguage="zh-Hant" style={styles.headingZh}>先聽故事</Text>
      </View>

      {voices.length > 1 && (
        <View accessibilityRole="radiogroup" style={styles.voiceRow}>
          {voices.map((voice, index) => {
            const selectedVoice = voice.id === selected.id;
            const label = voice.label ?? `Voice ${index + 1}`;
            return (
              <Pressable
                accessibilityLabel={`${label}. ${selectedVoice ? 'Selected' : 'Not selected'}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedVoice }}
                key={voice.id}
                onPress={() => setSelectedId(voice.id)}
                style={({ pressed }) => [
                  styles.voice,
                  selectedVoice && styles.voiceSelected,
                  pressed && styles.voicePressed,
                ]}
              >
                <Text style={[styles.voiceText, selectedVoice && styles.voiceTextSelected]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {audio.isPending ? (
        <View accessibilityLabel="Preparing story audio" style={styles.loading}>
          <View style={styles.loadingLine} />
          <View style={[styles.loadingLine, styles.loadingLineShort]} />
        </View>
      ) : audio.isError ? (
        <View style={styles.errorBlock}>
          <Text accessibilityRole="alert" style={styles.error}>
            We couldn't prepare this audio. 請檢查網路後再試一次。
          </Text>
          <PrimaryButton
            label="Try audio again  再試一次"
            onPress={() => void audio.refetch()}
            secondary
          />
        </View>
      ) : (
        <CachedAudioControls key={audio.data} uri={audio.data} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  player: { gap: spacing.md },
  heading: { color: colors.ink, fontSize: type.title, fontWeight: '900' },
  headingZh: { color: colors.leaf, fontSize: type.label, fontWeight: '700', marginTop: spacing.xs },
  voiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  voice: {
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  voiceSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  voicePressed: { opacity: 0.82 },
  voiceText: { color: colors.ink, fontSize: type.small, fontWeight: '800' },
  voiceTextSelected: { color: colors.white },
  controls: { gap: spacing.md },
  timeline: { gap: spacing.sm },
  track: { backgroundColor: colors.line, borderRadius: radii.pill, height: 8, overflow: 'hidden' },
  progress: { backgroundColor: colors.sun, borderRadius: radii.pill, height: 8 },
  time: { color: colors.muted, fontSize: type.small, fontVariant: ['tabular-nums'], textAlign: 'right' },
  loading: { gap: spacing.sm, paddingVertical: spacing.md },
  loadingLine: { backgroundColor: colors.sky, borderRadius: radii.pill, height: 18, width: '100%' },
  loadingLineShort: { width: '48%' },
  errorBlock: { gap: spacing.md },
  error: { color: colors.coral, fontSize: type.label, lineHeight: 22 },
  unavailable: { backgroundColor: '#F6E8BA', borderRadius: radii.md, gap: spacing.xs, padding: spacing.md },
  unavailableTitle: { color: colors.ink, fontSize: type.body, fontWeight: '800' },
  unavailableBody: { color: colors.muted, fontSize: type.label, lineHeight: 22 },
});
