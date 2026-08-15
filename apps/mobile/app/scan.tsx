import { useState } from 'react';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StyleSheet, Text, View } from 'react-native';
import { MobileApiError } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { loginDestinationFromLink } from '@/auth/login-link';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { colors, radii, spacing, type } from '@/theme/tokens';

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = useAuth();
  const router = useRouter();

  const handleScan = async ({ data }: { data: string }) => {
    if (scanned || busy) return;
    const destination = loginDestinationFromLink(data);
    if (!destination) {
      setError('This is not a Starling Rise student code. 請掃描學生專用代碼。');
      setScanned(true);
      return;
    }

    if (destination.kind === 'class') {
      setScanned(true);
      router.replace({ pathname: '/class-code', params: { code: destination.code } });
      return;
    }

    setScanned(true);
    setBusy(true);
    setError(null);
    try {
      await auth.loginWithQr(destination.token);
      router.replace('/(app)/(tabs)');
    } catch (scanError) {
      setError(
        scanError instanceof MobileApiError
          ? scanError.message
          : 'We could not sign you in. Check the internet and try again.',
      );
      setBusy(false);
    }
  };

  if (!permission?.granted) {
    return (
      <Screen contentStyle={styles.permission}>
        <View style={styles.cameraGlyph}><Text style={styles.cameraGlyphText}>▣</Text></View>
        <Text style={styles.title}>Scan your student code</Text>
        <Text style={styles.zh}>掃描你的學生代碼</Text>
        <Text style={styles.body}>
          The camera turns on only while this scanner is open. Starling Rise does not save a photo.
        </Text>
        <PrimaryButton
          label={permission?.canAskAgain === false ? 'Camera is disabled' : 'Turn on camera  開啟相機'}
          disabled={permission?.canAskAgain === false}
          onPress={() => void requestPermission()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <View style={styles.cameraFrame}>
        <CameraView
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned ? undefined : handleScan}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.target} pointerEvents="none" />
      </View>
      <Text style={styles.hint}>Place the QR code inside the square.</Text>
      <Text style={styles.hintZh}>把 QR Code 放進方框裡。</Text>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {(scanned || error) && (
        <PrimaryButton
          busy={busy}
          label="Scan again  再掃一次"
          secondary
          onPress={() => { setScanned(false); setError(null); }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'center' },
  permission: { gap: spacing.md, justifyContent: 'center' },
  cameraGlyph: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.sky, borderRadius: radii.lg, height: 84, justifyContent: 'center', width: 84 },
  cameraGlyphText: { color: colors.ink, fontSize: 42, fontWeight: '900' },
  title: { color: colors.ink, fontSize: type.title, fontWeight: '900', textAlign: 'center' },
  zh: { color: colors.leaf, fontSize: type.body, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.muted, fontSize: type.body, lineHeight: 27, marginBottom: spacing.md, textAlign: 'center' },
  cameraFrame: { borderRadius: radii.lg, height: 380, overflow: 'hidden', width: '100%' },
  target: { alignSelf: 'center', borderColor: colors.sun, borderRadius: radii.md, borderWidth: 5, height: 230, marginTop: 75, width: 230 },
  hint: { color: colors.ink, fontSize: type.body, fontWeight: '800', marginTop: spacing.lg, textAlign: 'center' },
  hintZh: { color: colors.muted, fontSize: type.label, marginBottom: spacing.md, marginTop: spacing.xs, textAlign: 'center' },
  error: { backgroundColor: '#FBEDEA', borderRadius: radii.sm, color: colors.coral, fontSize: type.label, marginBottom: spacing.md, padding: spacing.md, textAlign: 'center' },
});
