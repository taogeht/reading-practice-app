import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { mobileApi, MobileApiError } from '@/api/client';
import { PrimaryButton } from '@/components/primary-button';
import {
  loadPendingRecording,
  removePendingRecording,
  savePendingRecording,
  type PendingRecording,
} from '@/recording/pending-recording';
import { colors, radii, spacing, type } from '@/theme/tokens';

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof MobileApiError) {
    if (error.status === 413) return 'This recording is too large. 請重新錄製較短的音訊。';
    if (error.status === 400) return `${error.message} 請重新錄製後再試一次。`;
  }
  return 'We couldn’t send your recording. It is safe on this device—please try again. 錄音已保存在裝置上，請再試一次。';
}

function PendingPlayback({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

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
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) {
      void player.seekTo(0).then(() => player.play());
      return;
    }
    player.play();
  }

  return (
    <View style={styles.reviewPlayer}>
      <PrimaryButton
        accessibilityHint="Plays or pauses your recording"
        label={status.playing ? 'Pause my reading  暫停' : 'Listen to my reading  聽聽看'}
        onPress={togglePlayback}
        secondary
      />
      <Text style={styles.timeText}>
        {formatTime(status.currentTime)} / {formatTime(status.duration)}
      </Text>
      {status.error && (
        <Text accessibilityRole="alert" style={styles.error}>
          We couldn’t play this recording. 請重新錄製。
        </Text>
      )}
    </View>
  );
}

export function AssignmentRecorder({
  assignmentId,
  attempts,
  maxAttempts,
  maxRecordingSeconds,
  completed,
}: {
  assignmentId: string;
  attempts: number;
  maxAttempts: number;
  maxRecordingSeconds: number;
  completed: boolean;
}) {
  const queryClient = useQueryClient();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const stoppingRef = useRef(false);
  const [loadingPending, setLoadingPending] = useState(true);
  const [pending, setPending] = useState<PendingRecording | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submittedAttempt, setSubmittedAttempt] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void loadPendingRecording(assignmentId)
      .then((recording) => {
        if (active) setPending(recording);
      })
      .finally(() => {
        if (active) setLoadingPending(false);
      });
    return () => {
      active = false;
      if (recorder.isRecording) void recorder.stop();
    };
  }, [assignmentId, recorder]);

  const stopRecording = useCallback(async () => {
    if (!recorder.isRecording || stoppingRef.current) return;
    stoppingRef.current = true;
    setLocalError(null);
    const durationSeconds = Math.max(
      0.1,
      recorder.currentTime,
      recorderState.durationMillis / 1000,
    );
    try {
      await recorder.stop();
      if (!recorder.uri) throw new Error('The recorder did not create an audio file.');
      const saved = await savePendingRecording({
        assignmentId,
        sourceUri: recorder.uri,
        durationSeconds,
      });
      setPending(saved);
    } catch {
      setLocalError('We couldn’t save this recording. Please record it once more. 無法儲存錄音，請再錄一次。');
    } finally {
      stoppingRef.current = false;
      void setAudioModeAsync({
        allowsRecording: false,
        interruptionMode: 'doNotMix',
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
    }
  }, [assignmentId, recorder, recorderState.durationMillis]);

  useEffect(() => {
    if (
      recorderState.isRecording &&
      recorderState.durationMillis >= maxRecordingSeconds * 1000
    ) {
      void stopRecording();
    }
  }, [maxRecordingSeconds, recorderState.durationMillis, recorderState.isRecording, stopRecording]);

  async function startRecording() {
    setLocalError(null);
    setSubmittedAttempt(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setLocalError('Microphone access is needed to record your reading. 請允許使用麥克風。');
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        interruptionMode: 'doNotMix',
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setLocalError('The microphone could not start. Please try again. 麥克風無法啟動，請再試一次。');
    }
  }

  const submission = useMutation({
    mutationFn: async (recording: PendingRecording) => {
      const response = await mobileApi.submitRecording({
        assignmentId,
        operationId: recording.operationId,
        uri: recording.uri,
        durationSeconds: recording.durationSeconds,
      });
      await removePendingRecording(assignmentId).catch(() => undefined);
      return response;
    },
    onSuccess: (response) => {
      setPending(null);
      setLocalError(null);
      setSubmittedAttempt(response.recording.attemptNumber);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-assignment', assignmentId] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-dashboard'] }),
      ]);
    },
  });

  async function discardRecording() {
    setLocalError(null);
    await removePendingRecording(assignmentId);
    setPending(null);
  }

  if (loadingPending) {
    return (
      <View accessibilityLabel="Checking saved recording" style={styles.card}>
        <ActivityIndicator color={colors.leaf} />
      </View>
    );
  }

  if (submittedAttempt !== null) {
    const canTryAgain = submittedAttempt < maxAttempts && !completed;
    return (
      <View accessibilityLiveRegion="polite" style={[styles.card, styles.successCard]}>
        <Text style={styles.heading}>Recording sent!</Text>
        <Text accessibilityLanguage="zh-Hant" style={styles.headingZh}>錄音已送出！</Text>
        <Text style={styles.body}>Attempt {submittedAttempt} is ready for your teacher.</Text>
        {canTryAgain && (
          <PrimaryButton
            label="Record another try  再錄一次"
            onPress={() => setSubmittedAttempt(null)}
            secondary
          />
        )}
      </View>
    );
  }

  if (pending) {
    return (
      <View style={styles.card}>
        <View>
          <Text style={styles.heading}>Check your reading</Text>
          <Text accessibilityLanguage="zh-Hant" style={styles.headingZh}>先聽聽你的錄音</Text>
        </View>
        <Text style={styles.body}>
          Your recording is saved on this device until it is sent. 錄音會保存在這台裝置上，直到成功送出。
        </Text>
        <PendingPlayback uri={pending.uri} />
        <PrimaryButton
          busy={submission.isPending}
          label="Send to my teacher  送給老師"
          onPress={() => submission.mutate(pending)}
        />
        <Pressable
          accessibilityRole="button"
          disabled={submission.isPending}
          onPress={() => void discardRecording()}
          style={({ pressed }) => [styles.discardButton, pressed && styles.pressed]}
        >
          <Text style={styles.discardText}>Delete and record again  刪除並重錄</Text>
        </Pressable>
        {submission.isError && (
          <Text accessibilityRole="alert" style={styles.error}>
            {errorMessage(submission.error)}
          </Text>
        )}
      </View>
    );
  }

  if (completed || attempts >= maxAttempts) {
    return (
      <View style={[styles.card, styles.closedCard]}>
        <Text style={styles.heading}>{completed ? 'Reading completed' : 'All tries used'}</Text>
        <Text accessibilityLanguage="zh-Hant" style={styles.headingZh}>
          {completed ? '閱讀任務已完成' : '已用完所有錄音次數'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View>
        <Text style={styles.heading}>{recorderState.isRecording ? 'Reading now…' : 'Record your reading'}</Text>
        <Text accessibilityLanguage="zh-Hant" style={styles.headingZh}>
          {recorderState.isRecording ? '正在錄音…' : '錄下你的朗讀'}
        </Text>
      </View>
      {recorderState.isRecording ? (
        <>
          <View accessible accessibilityLabel={`${formatTime(recorderState.durationMillis / 1000)} recorded`} style={styles.timerRow}>
            <View style={styles.recordingDot} />
            <Text style={styles.timer}>
              {formatTime(recorderState.durationMillis / 1000)} / {formatTime(maxRecordingSeconds)}
            </Text>
          </View>
          <PrimaryButton label="Stop recording  停止錄音" onPress={() => void stopRecording()} />
        </>
      ) : (
        <>
          <Text style={styles.body}>
            Starling Rise only listens after you tap Record. You can listen before sending it. 點擊錄音後才會使用麥克風，送出前可以先聽聽看。
          </Text>
          <Text style={styles.limit}>
            Up to {formatTime(maxRecordingSeconds)} · Try {attempts + 1} of {maxAttempts}
          </Text>
          <PrimaryButton label="Start recording  開始錄音" onPress={() => void startRecording()} />
        </>
      )}
      {localError && (
        <Text accessibilityRole="alert" style={styles.error}>{localError}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 2,
    gap: spacing.md,
    padding: spacing.lg,
  },
  successCard: { backgroundColor: '#E4F2E8', borderColor: '#A8CEB4' },
  closedCard: { backgroundColor: colors.sky },
  heading: { color: colors.ink, fontSize: type.title, fontWeight: '900' },
  headingZh: { color: colors.leaf, fontSize: type.label, fontWeight: '800', marginTop: spacing.xs },
  body: { color: colors.ink, fontSize: type.label, lineHeight: 23 },
  limit: { color: colors.muted, fontSize: type.small, fontWeight: '700' },
  reviewPlayer: { gap: spacing.sm },
  timeText: { color: colors.muted, fontSize: type.small, fontVariant: ['tabular-nums'], textAlign: 'right' },
  timerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'center', paddingVertical: spacing.lg },
  recordingDot: { backgroundColor: colors.coral, borderRadius: radii.pill, height: 16, width: 16 },
  timer: { color: colors.ink, fontSize: type.display, fontVariant: ['tabular-nums'], fontWeight: '900' },
  discardButton: { alignItems: 'center', minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md },
  discardText: { color: colors.coral, fontSize: type.label, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.72 },
  error: { color: colors.coral, fontSize: type.label, lineHeight: 22 },
});
