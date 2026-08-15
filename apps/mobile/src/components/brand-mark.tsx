import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type } from '@/theme/tokens';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View
      accessibilityRole="header"
      accessibilityLabel="Starling Rise. Every voice can rise."
      style={[styles.row, compact && styles.compactRow]}
    >
      <View style={[styles.mark, compact && styles.compactMark]}>
        <Text style={[styles.bird, compact && styles.compactBird]}>↗</Text>
      </View>
      <View>
        <Text style={[styles.name, compact && styles.compactName]}>Starling Rise</Text>
        {!compact && <Text style={styles.tagline}>Every voice can rise.</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  compactRow: { gap: spacing.sm },
  mark: {
    alignItems: 'center',
    backgroundColor: colors.sun,
    borderRadius: radii.lg,
    height: 64,
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
    width: 64,
  },
  compactMark: { borderRadius: radii.md, height: 42, width: 42 },
  bird: { color: colors.ink, fontSize: 38, fontWeight: '900' },
  compactBird: { fontSize: 25 },
  name: {
    color: colors.ink,
    fontSize: type.title,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  compactName: { fontSize: 19 },
  tagline: {
    color: colors.muted,
    fontSize: type.label,
    fontWeight: '600',
    marginTop: 2,
  },
});
