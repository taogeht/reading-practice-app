import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { BrandMark } from '@/components/brand-mark';
import { BilingualLabel } from '@/components/bilingual-label';
import { Screen } from '@/components/screen';
import { colors, radii, spacing, type } from '@/theme/tokens';

export default function HomeTab() {
  const auth = useAuth();
  const firstName = auth.user?.firstName ?? 'reader';

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
        <View style={styles.pathRow}>
          <View style={[styles.pathDot, styles.pathDotDone]} />
          <View style={styles.pathLine} />
          <View style={styles.pathDot} />
          <View style={styles.pathLine} />
          <View style={styles.pathDot} />
        </View>
        <Text style={styles.pathHint}>Your next teacher activity will appear here.</Text>
      </View>

      <Text style={styles.sectionTitle}>Choose a place to begin</Text>
      <Text style={styles.sectionZh}>選擇一個開始的地方</Text>
      <View style={styles.cards}>
        <View style={[styles.actionCard, styles.readCard]}>
          <Text style={styles.actionSymbol}>▤</Text>
          <BilingualLabel en="Read a story" zh="閱讀故事" />
        </View>
        <View style={[styles.actionCard, styles.spellCard]}>
          <Text style={styles.actionSymbol}>Aa</Text>
          <BilingualLabel en="Practice spelling" zh="練習拼字" />
        </View>
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
  pathRow: { alignItems: 'center', flexDirection: 'row', marginVertical: spacing.lg },
  pathDot: { backgroundColor: colors.cloud, borderColor: colors.leaf, borderRadius: radii.pill, borderWidth: 3, height: 20, width: 20 },
  pathDotDone: { backgroundColor: colors.sun },
  pathLine: { backgroundColor: colors.line, flex: 1, height: 3 },
  pathHint: { color: colors.muted, fontSize: type.label, lineHeight: 22 },
  sectionTitle: { color: colors.ink, fontSize: type.title, fontWeight: '900', marginTop: spacing.xl },
  sectionZh: { color: colors.muted, fontSize: type.label, marginBottom: spacing.md, marginTop: spacing.xs },
  cards: { gap: spacing.md },
  actionCard: { borderRadius: radii.lg, minHeight: 126, padding: spacing.lg },
  readCard: { backgroundColor: colors.sky },
  spellCard: { backgroundColor: '#F6E8BA' },
  actionSymbol: { color: colors.ink, fontSize: 30, fontWeight: '900', marginBottom: spacing.md },
});
