import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { mobileApi } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { BrandMark } from '@/components/brand-mark';
import { BilingualLabel } from '@/components/bilingual-label';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { colors, radii, spacing, type } from '@/theme/tokens';

export default function HomeTab() {
  const auth = useAuth();
  const router = useRouter();
  const dashboard = useQuery({
    queryKey: ['mobile-dashboard'],
    queryFn: () => mobileApi.dashboard(),
  });
  const firstName = auth.user?.firstName ?? 'reader';
  const nextAssignment = dashboard.data?.nextAssignments[0];
  const summary = dashboard.data?.summary;

  const assignmentStatus = nextAssignment?.status === 'submitted'
    ? 'Waiting for feedback  等待老師回覆'
    : nextAssignment?.status === 'completed'
      ? 'Completed  已完成'
      : 'Ready to read  可以開始閱讀';

  return (
    <Screen>
      <BrandMark compact />
      <View style={styles.greeting}>
        <Text style={styles.eyebrow}>TODAY  今天</Text>
        <Text style={styles.title}>Hi, {firstName}!</Text>
        <Text style={styles.zh}>你好，{firstName}！</Text>
      </View>

      <View style={styles.flightCard}>
        <View style={styles.flightHeader}>
          <BilingualLabel en="Your learning path" zh="你的學習旅程" />
          <Text style={styles.bird}>↗</Text>
        </View>
        {dashboard.isPending ? (
          <View accessibilityLabel="Loading your learning path" style={styles.loadingBlock}>
            <View style={[styles.loadingLine, styles.loadingLineShort]} />
            <View style={styles.loadingLine} />
            <View style={[styles.loadingLine, styles.loadingLineMedium]} />
          </View>
        ) : dashboard.isError ? (
          <View style={styles.errorBlock}>
            <BilingualLabel
              en="We couldn't load your learning path"
              zh="目前無法載入你的學習旅程"
            />
            <Text style={styles.pathHint}>
              Check your connection and try again. 請檢查網路後再試一次。
            </Text>
            <PrimaryButton
              label="Try again  再試一次"
              onPress={() => void dashboard.refetch()}
              secondary
            />
          </View>
        ) : nextAssignment ? (
          <View style={styles.nextAssignment}>
            <Text style={styles.assignmentEyebrow}>{assignmentStatus}</Text>
            <Text style={styles.assignmentTitle}>{nextAssignment.storyTitle}</Text>
            <Text style={styles.assignmentMeta}>
              {nextAssignment.className} · {nextAssignment.attempts}/{nextAssignment.maxAttempts} 次練習
            </Text>
            <PrimaryButton
              label="Open Read  開始閱讀"
              onPress={() => router.push(`/assignments/${nextAssignment.id}`)}
            />
          </View>
        ) : (
          <View style={styles.caughtUp}>
            <Text style={styles.caughtUpTitle}>You're all caught up!</Text>
            <Text accessibilityLanguage="zh-Hant" style={styles.caughtUpZh}>
              你都完成了！
            </Text>
            <Text style={styles.pathHint}>
              New teacher activities will appear here. 老師的新任務會顯示在這裡。
            </Text>
          </View>
        )}
      </View>

      {summary && (
        <View style={styles.progressRow}>
          <View
            accessible
            accessibilityLabel={`Level ${summary.currentLevel}. 等級 ${summary.currentLevel}`}
            style={styles.progressItem}
          >
            <Text style={styles.progressValue}>{summary.currentLevel}</Text>
            <Text style={styles.progressLabel}>LEVEL  等級</Text>
          </View>
          <View
            accessible
            accessibilityLabel={`${summary.totalXp} experience points. ${summary.totalXp} 經驗值`}
            style={styles.progressItem}
          >
            <Text style={styles.progressValue}>{summary.totalXp}</Text>
            <Text style={styles.progressLabel}>XP</Text>
          </View>
          <View
            accessible
            accessibilityLabel={`${summary.currentStreakDays} day streak. 連續 ${summary.currentStreakDays} 天`}
            style={styles.progressItem}
          >
            <Text style={styles.progressValue}>{summary.currentStreakDays}</Text>
            <Text style={styles.progressLabel}>STREAK  連續天數</Text>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Choose a place to begin</Text>
      <Text style={styles.sectionZh}>選擇一個開始的地方</Text>
      <View style={styles.cards}>
        <Pressable
          accessibilityHint="Opens your assigned stories and reading passages"
          accessibilityLabel={`Read a story. 閱讀故事. ${summary?.pendingAssignments ?? 0} ready assignments.`}
          accessibilityRole="button"
          onPress={() => router.push('/read')}
          style={({ pressed }) => [
            styles.actionCard,
            styles.readCard,
            pressed && styles.actionCardPressed,
          ]}
        >
          <Text style={styles.actionSymbol}>▤</Text>
          <BilingualLabel en="Read a story" zh="閱讀故事" />
          <Text style={styles.actionCount}>
            {summary ? `${summary.pendingAssignments} ready  可開始` : 'Open reading  開啟閱讀'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityHint="Opens your spelling lists and practice games"
          accessibilityLabel={`Practice spelling. 練習拼字. ${summary?.activeSpellingWords ?? 0} active words.`}
          accessibilityRole="button"
          onPress={() => router.push('/spelling')}
          style={({ pressed }) => [
            styles.actionCard,
            styles.spellCard,
            pressed && styles.actionCardPressed,
          ]}
        >
          <Text style={styles.actionSymbol}>Aa</Text>
          <BilingualLabel en="Practice spelling" zh="練習拼字" />
          <Text style={styles.actionCount}>
            {summary ? `${summary.activeSpellingWords} words  個單字` : 'Open spelling  開啟拼字'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { marginBottom: spacing.lg, marginTop: spacing.xl },
  eyebrow: { color: colors.leaf, fontSize: type.small, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: type.display, fontWeight: '900', letterSpacing: -1, marginTop: spacing.xs },
  zh: { color: colors.leaf, fontSize: type.body, fontWeight: '800', marginTop: spacing.xs },
  flightCard: { backgroundColor: colors.white, borderColor: colors.line, borderRadius: radii.lg, borderWidth: 2, padding: spacing.lg },
  flightHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  bird: { color: colors.ink, fontSize: 32, fontWeight: '900' },
  pathHint: { color: colors.muted, fontSize: type.label, lineHeight: 22 },
  loadingBlock: { gap: spacing.md, marginTop: spacing.xl },
  loadingLine: { backgroundColor: colors.sky, borderRadius: radii.pill, height: 18, width: '100%' },
  loadingLineShort: { width: '38%' },
  loadingLineMedium: { width: '68%' },
  errorBlock: { gap: spacing.md, marginTop: spacing.lg },
  nextAssignment: { gap: spacing.sm, marginTop: spacing.lg },
  assignmentEyebrow: { color: colors.leaf, fontSize: type.small, fontWeight: '900' },
  assignmentTitle: { color: colors.ink, fontSize: type.title, fontWeight: '900' },
  assignmentMeta: { color: colors.muted, fontSize: type.label, marginBottom: spacing.sm },
  caughtUp: { marginTop: spacing.lg },
  caughtUpTitle: { color: colors.ink, fontSize: type.title, fontWeight: '900' },
  caughtUpZh: { color: colors.leaf, fontSize: type.body, fontWeight: '800', marginVertical: spacing.xs },
  progressRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  progressItem: { alignItems: 'center', backgroundColor: colors.white, borderColor: colors.line, borderRadius: radii.md, borderWidth: 2, flex: 1, minHeight: 82, justifyContent: 'center', padding: spacing.sm },
  progressValue: { color: colors.ink, fontSize: type.title, fontWeight: '900' },
  progressLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', marginTop: spacing.xs, textAlign: 'center' },
  sectionTitle: { color: colors.ink, fontSize: type.title, fontWeight: '900', marginTop: spacing.xl },
  sectionZh: { color: colors.muted, fontSize: type.label, marginBottom: spacing.md, marginTop: spacing.xs },
  cards: { gap: spacing.md },
  actionCard: { borderRadius: radii.lg, minHeight: 126, padding: spacing.lg },
  actionCardPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  readCard: { backgroundColor: colors.sky },
  spellCard: { backgroundColor: '#F6E8BA' },
  actionSymbol: { color: colors.ink, fontSize: 30, fontWeight: '900', marginBottom: spacing.md },
  actionCount: { color: colors.muted, fontSize: type.small, fontWeight: '700', marginTop: spacing.sm },
});
