import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BrandMark } from '@/components/brand-mark';
import { Screen } from '@/components/screen';
import { colors, radii, spacing, type } from '@/theme/tokens';

export function FeatureEmptyState({
  symbol,
  title,
  zh,
  body,
  children,
}: {
  symbol: string;
  title: string;
  zh: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <Screen contentStyle={styles.screen}>
      <BrandMark compact />
      <View style={styles.card}>
        <Text style={styles.symbol}>{symbol}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.zh}>{zh}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xl },
  card: { alignItems: 'center', backgroundColor: colors.white, borderColor: colors.line, borderRadius: radii.lg, borderWidth: 2, padding: spacing.xl },
  symbol: { color: colors.leaf, fontSize: 56, fontWeight: '900', marginBottom: spacing.md },
  title: { color: colors.ink, fontSize: type.title, fontWeight: '900', textAlign: 'center' },
  zh: { color: colors.leaf, fontSize: type.body, fontWeight: '800', marginTop: spacing.xs },
  body: { color: colors.muted, fontSize: type.body, lineHeight: 27, marginTop: spacing.lg, textAlign: 'center' },
});
