import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { mobileApi, MobileApiError } from '@/api/client';
import { BrandMark } from '@/components/brand-mark';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { StoryAudioPlayer } from '@/components/story-audio-player';
import { AssignmentRecorder } from '@/components/assignment-recorder';
import { colors, radii, spacing, type } from '@/theme/tokens';

const statusCopy = {
  pending: 'Ready to practice  可以開始練習',
  submitted: 'Waiting for feedback  等待老師回覆',
  completed: 'Completed  已完成',
} as const;

function formattedDueDate(dueAt: string | null): string | null {
  if (!dueAt) return null;
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dueAt));
}

export default function AssignmentDetailScreen() {
  const params = useLocalSearchParams<{ assignmentId: string }>();
  const assignmentId = Array.isArray(params.assignmentId)
    ? params.assignmentId[0]
    : params.assignmentId;
  const query = useQuery({
    queryKey: ['mobile-assignment', assignmentId],
    queryFn: () => mobileApi.assignment(assignmentId),
    enabled: Boolean(assignmentId),
  });

  if (query.isPending) {
    return (
      <Screen contentStyle={styles.screen}>
        <View accessibilityLabel="Loading story" style={styles.loading}>
          <View style={[styles.loadingLine, styles.loadingTitle]} />
          <View style={styles.loadingAudio} />
          <View style={styles.loadingLine} />
          <View style={styles.loadingLine} />
          <View style={[styles.loadingLine, styles.loadingShort]} />
        </View>
      </Screen>
    );
  }

  if (query.isError) {
    const notFound = query.error instanceof MobileApiError && query.error.status === 404;
    return (
      <Screen contentStyle={styles.screen}>
        <BrandMark compact />
        <View style={styles.errorBlock}>
          <Text accessibilityRole="alert" style={styles.errorTitle}>
            {notFound ? 'This story is no longer available' : 'We couldn’t load this story'}
          </Text>
          <Text accessibilityLanguage="zh-Hant" style={styles.errorZh}>
            {notFound ? '這個故事目前無法開啟' : '目前無法載入這個故事'}
          </Text>
          {!notFound && (
            <PrimaryButton
              label="Try again  再試一次"
              onPress={() => void query.refetch()}
            />
          )}
        </View>
      </Screen>
    );
  }

  const assignment = query.data.assignment;
  const dueDate = formattedDueDate(assignment.dueAt);

  return (
    <Screen contentStyle={styles.screen}>
      <BrandMark compact />
      <View style={styles.assignmentHeader}>
        <Text style={styles.status}>{statusCopy[assignment.status]}</Text>
        <Text style={styles.assignmentTitle}>{assignment.title}</Text>
        <Text style={styles.storyTitle}>{assignment.story.title}</Text>
        <Text style={styles.meta}>
          {assignment.className} · {assignment.attempts}/{assignment.maxAttempts} 次練習
          {dueDate ? ` · Due ${dueDate}` : ''}
        </Text>
      </View>

      {(assignment.instructions || assignment.description) && (
        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>Teacher's note</Text>
          <Text accessibilityLanguage="zh-Hant" style={styles.instructionsZh}>老師的說明</Text>
          <Text style={styles.instructionsBody}>
            {assignment.instructions || assignment.description}
          </Text>
        </View>
      )}

      <StoryAudioPlayer voices={assignment.story.ttsAudio} />

      <View style={styles.storyHeading}>
        <Text style={styles.readLabel}>Read the story</Text>
        <Text accessibilityLanguage="zh-Hant" style={styles.readLabelZh}>閱讀故事</Text>
        {(assignment.story.author || assignment.story.wordCount) && (
          <Text style={styles.storyMeta}>
            {assignment.story.author ? `By ${assignment.story.author}` : ''}
            {assignment.story.author && assignment.story.wordCount ? ' · ' : ''}
            {assignment.story.wordCount ? `${assignment.story.wordCount} words` : ''}
          </Text>
        )}
      </View>
      <Text accessibilityLanguage="en" style={styles.storyContent}>
        {assignment.story.content}
      </Text>

      <View style={styles.practiceHint}>
        <Text style={styles.practiceTitle}>Your turn</Text>
        <Text accessibilityLanguage="zh-Hant" style={styles.practiceZh}>換你讀讀看</Text>
        <Text style={styles.practiceBody}>
          Read aloud with the narrator, then try once more by yourself. 跟著音訊大聲朗讀，再自己讀一次。
        </Text>
      </View>

      <AssignmentRecorder
        assignmentId={assignment.id}
        attempts={assignment.attempts}
        completed={assignment.status === 'completed'}
        maxAttempts={assignment.maxAttempts}
        maxRecordingSeconds={assignment.maxRecordingSeconds}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xl },
  assignmentHeader: { gap: spacing.sm },
  status: { color: colors.leaf, fontSize: type.small, fontWeight: '900' },
  assignmentTitle: { color: colors.ink, fontSize: type.display, fontWeight: '900', letterSpacing: -1 },
  storyTitle: { color: colors.leaf, fontSize: type.title, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: type.small, lineHeight: 20 },
  instructions: { backgroundColor: colors.sky, borderRadius: radii.md, gap: spacing.xs, padding: spacing.lg },
  instructionsTitle: { color: colors.ink, fontSize: type.body, fontWeight: '900' },
  instructionsZh: { color: colors.leaf, fontSize: type.label, fontWeight: '700' },
  instructionsBody: { color: colors.ink, fontSize: type.body, lineHeight: 27, marginTop: spacing.sm },
  storyHeading: { gap: spacing.xs },
  readLabel: { color: colors.ink, fontSize: type.title, fontWeight: '900' },
  readLabelZh: { color: colors.leaf, fontSize: type.label, fontWeight: '700' },
  storyMeta: { color: colors.muted, fontSize: type.small, marginTop: spacing.xs },
  storyContent: { color: colors.ink, fontSize: type.body, lineHeight: 31 },
  practiceHint: { backgroundColor: '#F6E8BA', borderRadius: radii.md, gap: spacing.xs, padding: spacing.lg },
  practiceTitle: { color: colors.ink, fontSize: type.body, fontWeight: '900' },
  practiceZh: { color: colors.leaf, fontSize: type.label, fontWeight: '700' },
  practiceBody: { color: colors.ink, fontSize: type.label, lineHeight: 23, marginTop: spacing.sm },
  loading: { gap: spacing.md },
  loadingLine: { backgroundColor: colors.sky, borderRadius: radii.pill, height: 20, width: '100%' },
  loadingTitle: { height: 42, width: '72%' },
  loadingAudio: { backgroundColor: colors.sky, borderRadius: radii.md, height: 150, marginVertical: spacing.md },
  loadingShort: { width: '58%' },
  errorBlock: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 2,
    gap: spacing.md,
    padding: spacing.xl,
  },
  errorTitle: { color: colors.ink, fontSize: type.title, fontWeight: '900' },
  errorZh: { color: colors.leaf, fontSize: type.body, fontWeight: '800' },
});
