import { Redirect, Slot } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { colors } from '@/theme/tokens';

export default function SignedInLayout() {
  const auth = useAuth();
  if (auth.status === 'loading') {
    return <View style={styles.loading}><ActivityIndicator color={colors.leaf} size="large" /></View>;
  }
  if (auth.status !== 'signedIn') return <Redirect href="/welcome" />;
  return <Slot />;
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', backgroundColor: colors.cloud, flex: 1, justifyContent: 'center' },
});
