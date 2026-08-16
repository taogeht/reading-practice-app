import type { MobileDashboardAssignment } from '@starling-rise/contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type } from '@/theme/tokens';

const statusCopy = {
  pending: { label: 'Ready  可以開始', color: colors.leaf, background: colors.sky },
  submitted: { label: 'Teacher review  老師批改中', color: colors.ink, background: '#F6E8BA' },
  completed: { label: 'Complete  已完成', color: colors.muted, background: colors.cloud },
} as const;

function dueDateLabel(dueAt: string | null): string | null {
  if (!dueAt) return null;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(
    new Date(dueAt),
  );
}

export function AssignmentCard({
  assignment,
  onPress,
}: {
  assignment: MobileDashboardAssignment;
  onPress: () => void;
}) {
  const status = statusCopy[assignment.status];
  const dueDate = dueDateLabel(assignment.dueAt);

  return (
    <Pressable
      accessibilityHint="Opens the story and listening activity"
      accessibilityLabel={`${assignment.storyTitle}. ${status.label}. ${assignment.attempts} of ${assignment.maxAttempts} attempts used.`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.symbol}>
        <Text style={styles.symbolText}>▤</Text>
      </View>
      <View style={styles.copy}>
        <View style={styles.statusRow}>
          <Text
            style={[
              styles.status,
              { backgroundColor: status.background, color: status.color },
            ]}
          >
            {status.label}
          </Text>
          {dueDate && <Text style={styles.due}>Due {dueDate}  到期</Text>}
        </View>
        <Text style={styles.title}>{assignment.storyTitle}</Text>
        <Text style={styles.meta}>
          {assignment.className} · {assignment.attempts}/{assignment.maxAttempts} 次練習
        </Text>
      </View>
      <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 2,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 116,
    padding: spacing.md,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  symbol: {
    alignItems: 'center',
    backgroundColor: colors.sky,
    borderRadius: radii.md,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  symbolText: { color: colors.ink, fontSize: 28, fontWeight: '900' },
  copy: { flex: 1, gap: spacing.xs },
  statusRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  status: {
    borderRadius: radii.pill,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  due: { color: colors.coral, fontSize: type.small, fontWeight: '700' },
  title: { color: colors.ink, fontSize: type.body, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: type.small, lineHeight: 19 },
  chevron: { color: colors.muted, fontSize: 30, fontWeight: '600' },
});
