import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { mobileApi } from '@/api/client';
import { AssignmentCard } from '@/components/assignment-card';
import { BrandMark } from '@/components/brand-mark';
import { FeatureEmptyState } from '@/components/feature-empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { colors, radii, spacing, type } from '@/theme/tokens';

export default function ReadTab() {
  const router = useRouter();
  const assignments = useQuery({
    queryKey: ['mobile-assignments'],
    queryFn: () => mobileApi.assignments(),
  });

  if (assignments.isPending) {
    return (
      <Screen contentStyle={styles.screen}>
        <BrandMark compact />
        <View>
          <Text style={styles.title}>Your reading</Text>
          <Text accessibilityLanguage="zh-Hant" style={styles.titleZh}>你的閱讀任務</Text>
        </View>
        <View accessibilityLabel="Loading reading assignments" style={styles.loadingList}>
          {[0, 1, 2].map((item) => <View key={item} style={styles.loadingRow} />)}
        </View>
      </Screen>
    );
  }

  if (assignments.isError) {
    return (
      <Screen contentStyle={styles.screen}>
        <BrandMark compact />
        <View style={styles.errorBlock}>
          <Text accessibilityRole="alert" style={styles.errorTitle}>
            We couldn't load your stories
          </Text>
          <Text accessibilityLanguage="zh-Hant" style={styles.errorZh}>
            目前無法載入你的故事
          </Text>
          <Text style={styles.errorBody}>
            Check your connection and try again. 請檢查網路後再試一次。
          </Text>
          <PrimaryButton
            label="Try again  再試一次"
            onPress={() => void assignments.refetch()}
          />
        </View>
      </Screen>
    );
  }

  if (assignments.data.assignments.length === 0) {
    return (
      <FeatureEmptyState
        symbol="▤"
        title="No reading today"
        zh="今天沒有閱讀任務"
        body="You're all caught up. Your teacher's next story will appear here. 你都完成了，老師的新故事會顯示在這裡。"
      />
    );
  }

  const ready = assignments.data.assignments.filter(
    (assignment) => assignment.status === 'pending',
  );
  const waiting = assignments.data.assignments.filter(
    (assignment) => assignment.status === 'submitted',
  );
  const completed = assignments.data.assignments.filter(
    (assignment) => assignment.status === 'completed',
  );

  return (
    <Screen contentStyle={styles.screen}>
      <BrandMark compact />
      <View>
        <Text style={styles.title}>Your reading</Text>
        <Text accessibilityLanguage="zh-Hant" style={styles.titleZh}>你的閱讀任務</Text>
        <Text style={styles.intro}>Listen, read, then share your voice. 先聽、再讀，分享你的聲音。</Text>
      </View>

      {ready.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ready to begin</Text>
          <Text accessibilityLanguage="zh-Hant" style={styles.sectionZh}>可以開始</Text>
          <View style={styles.list}>
            {ready.map((assignment) => (
              <AssignmentCard
                assignment={assignment}
                key={assignment.id}
                onPress={() => router.push(`/assignments/${assignment.id}`)}
              />
            ))}
          </View>
        </View>
      )}

      {waiting.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Waiting for your teacher</Text>
          <Text accessibilityLanguage="zh-Hant" style={styles.sectionZh}>等待老師批改</Text>
          <View style={styles.list}>
            {waiting.map((assignment) => (
              <AssignmentCard
                assignment={assignment}
                key={assignment.id}
                onPress={() => router.push(`/assignments/${assignment.id}`)}
              />
            ))}
          </View>
        </View>
      )}

      {completed.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Finished stories</Text>
          <Text accessibilityLanguage="zh-Hant" style={styles.sectionZh}>完成的故事</Text>
          <View style={styles.list}>
            {completed.map((assignment) => (
              <AssignmentCard
                assignment={assignment}
                key={assignment.id}
                onPress={() => router.push(`/assignments/${assignment.id}`)}
              />
            ))}
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xl },
  title: { color: colors.ink, fontSize: type.display, fontWeight: '900', letterSpacing: -1 },
  titleZh: { color: colors.leaf, fontSize: type.body, fontWeight: '800', marginTop: spacing.xs },
  intro: { color: colors.muted, fontSize: type.label, lineHeight: 22, marginTop: spacing.md },
  section: { gap: spacing.md },
  sectionTitle: { color: colors.ink, fontSize: type.title, fontWeight: '900' },
  sectionZh: { color: colors.muted, fontSize: type.label, fontWeight: '600', marginTop: -spacing.sm },
  list: { gap: spacing.md },
  loadingList: { gap: spacing.md },
  loadingRow: { backgroundColor: colors.sky, borderRadius: radii.md, height: 116 },
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
  errorBody: { color: colors.muted, fontSize: type.body, lineHeight: 27 },
});
