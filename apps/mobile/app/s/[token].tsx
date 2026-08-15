import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { PrimaryButton } from '@/components/primary-button';
import { colors, spacing, type } from '@/theme/tokens';

export default function StudentLinkScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [error, setError] = useState(false);
  const auth = useAuth();
  const loginWithQr = auth.loginWithQr;
  const router = useRouter();

  useEffect(() => {
    if (!token) return;
    void loginWithQr(token)
      .then(() => router.replace('/(app)/(tabs)'))
      .catch(() => setError(true));
  }, [loginWithQr, router, token]);

  return (
    <View style={styles.screen}>
      {error ? (
        <>
          <Text accessibilityRole="alert" style={styles.title}>This student link did not work.</Text>
          <Text style={styles.zh}>這個學生連結無法使用。</Text>
          <PrimaryButton label="Try another way  使用其他方式" onPress={() => router.replace('/welcome')} />
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.leaf} size="large" />
          <Text style={styles.title}>Opening your learning path…</Text>
          <Text style={styles.zh}>正在開啟你的學習旅程…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: 'center', backgroundColor: colors.cloud, flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.lg },
  title: { color: colors.ink, fontSize: type.title, fontWeight: '900', textAlign: 'center' },
  zh: { color: colors.muted, fontSize: type.body, marginBottom: spacing.md, textAlign: 'center' },
});
