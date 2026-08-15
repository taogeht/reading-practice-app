import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { BrandMark } from '@/components/brand-mark';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { colors, radii, spacing, type } from '@/theme/tokens';

export default function WelcomeScreen() {
  const auth = useAuth();
  const router = useRouter();
  if (auth.status === 'signedIn') return <Redirect href="/(app)/(tabs)" />;

  return (
    <Screen contentStyle={styles.screen}>
      <BrandMark />

      <View style={styles.flight} accessibilityElementsHidden>
        <View style={[styles.dot, styles.dotLow]} />
        <View style={styles.path} />
        <View style={[styles.dot, styles.dotHigh]} />
        <Text style={styles.flightBird}>↗</Text>
      </View>

      <View style={styles.copy}>
        <Text style={styles.title}>Ready to read?</Text>
        <Text style={styles.titleZh}>準備好閱讀了嗎？</Text>
        <Text style={styles.body}>
          Use the code from your teacher. You only need to sign in once on this device.
        </Text>
        <Text style={styles.bodyZh}>使用老師給你的代碼。這台裝置只需要登入一次。</Text>
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="Scan my QR code  掃描 QR Code" onPress={() => router.push('/scan')} />
        <PrimaryButton
          label="Enter my class code  輸入班級代碼"
          secondary
          onPress={() => router.push('/class-code')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'space-between', paddingVertical: spacing.xl },
  flight: {
    alignSelf: 'center',
    height: 150,
    marginVertical: spacing.lg,
    width: 250,
  },
  path: {
    borderColor: colors.leaf,
    borderRadius: 120,
    borderRightWidth: 4,
    borderTopWidth: 4,
    height: 115,
    left: 56,
    position: 'absolute',
    top: 20,
    transform: [{ rotate: '-18deg' }],
    width: 145,
  },
  dot: { backgroundColor: colors.sun, borderRadius: radii.pill, height: 18, position: 'absolute', width: 18 },
  dotLow: { bottom: 8, left: 42 },
  dotHigh: { right: 28, top: 8 },
  flightBird: { color: colors.ink, fontSize: 38, fontWeight: '900', position: 'absolute', right: 0, top: 0 },
  copy: { marginBottom: spacing.lg },
  title: { color: colors.ink, fontSize: type.display, fontWeight: '900', letterSpacing: -1 },
  titleZh: { color: colors.leaf, fontSize: type.title, fontWeight: '800', marginTop: spacing.xs },
  body: { color: colors.muted, fontSize: type.body, lineHeight: 27, marginTop: spacing.md },
  bodyZh: { color: colors.muted, fontSize: type.label, lineHeight: 23, marginTop: spacing.xs },
  actions: { gap: spacing.md },
});
