import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { FeatureEmptyState } from '@/components/feature-empty-state';
import { PrimaryButton } from '@/components/primary-button';
import { colors, radii, spacing, type } from '@/theme/tokens';

export default function ProgressTab() {
  const auth = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await auth.logout();
    } catch {
      // Local credentials and auth state are cleared even when the revocation
      // request fails, so there is no signed-in error state to display here.
    } finally {
      setSigningOut(false);
    }
  }

  function confirmSignOut() {
    Alert.alert(
      'Sign out?  要登出嗎？',
      'You will need your QR code or class code to sign in again.\n下次需要使用 QR Code 或班級代碼重新登入。',
      [
        { text: 'Stay signed in  繼續使用', style: 'cancel' },
        {
          text: 'Sign out  登出',
          style: 'destructive',
          onPress: () => void signOut(),
        },
      ],
    );
  }

  return (
    <FeatureEmptyState
      symbol="↗"
      title="See how your voice grows"
      zh="看看你的進步"
      body="Completed work, teacher feedback, and learning progress will appear here."
    >
      <View style={styles.deviceCard}>
        <View style={styles.deviceCopy}>
          <Text style={styles.deviceTitle}>This device</Text>
          <Text accessibilityLanguage="zh-Hant" style={styles.deviceZh}>
            這台裝置
          </Text>
          <Text style={styles.deviceHint}>
            Signed in as {auth.user?.firstName ?? 'learner'}.
          </Text>
        </View>
        <PrimaryButton
          accessibilityHint="Returns to the Starling Rise sign-in screen"
          accessibilityLabel="Sign out. 登出"
          busy={signingOut}
          label="Sign out  登出"
          onPress={confirmSignOut}
          secondary
        />
      </View>
    </FeatureEmptyState>
  );
}

const styles = StyleSheet.create({
  deviceCard: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 2,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  deviceCopy: { gap: spacing.xs },
  deviceTitle: { color: colors.ink, fontSize: type.body, fontWeight: '800' },
  deviceZh: { color: colors.muted, fontSize: type.small, fontWeight: '600' },
  deviceHint: { color: colors.muted, fontSize: type.label, marginTop: spacing.xs },
});
