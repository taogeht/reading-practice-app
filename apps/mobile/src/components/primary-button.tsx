import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';
import { colors, radii, spacing, type } from '@/theme/tokens';

export function PrimaryButton({
  label,
  busy = false,
  secondary = false,
  disabled,
  ...props
}: PressableProps & { label: string; busy?: boolean; secondary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: Boolean(disabled || busy) }}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.secondary : styles.primary,
        pressed && styles.pressed,
        (disabled || busy) && styles.disabled,
      ]}
      {...props}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? colors.ink : colors.white} />
      ) : (
        <Text style={[styles.label, secondary && styles.secondaryLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  primary: { backgroundColor: colors.leaf },
  secondary: { backgroundColor: colors.white, borderColor: colors.line, borderWidth: 2 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.5 },
  label: { color: colors.white, fontSize: type.body, fontWeight: '900' },
  secondaryLabel: { color: colors.ink },
});
