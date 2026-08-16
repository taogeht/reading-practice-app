import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { colors } from '@/theme/tokens';

export default function SignedInLayout() {
  const auth = useAuth();
  if (auth.status === 'loading') {
    return <View style={styles.loading}><ActivityIndicator color={colors.leaf} size="large" /></View>;
  }
  if (auth.status !== 'signedIn') return <Redirect href="/welcome" />;
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.cloud },
        headerBackTitle: 'Read',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.cloud },
        headerTintColor: colors.ink,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="assignments/[assignmentId]"
        options={{ title: 'Story  故事' }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', backgroundColor: colors.cloud, flex: 1, justifyContent: 'center' },
});
