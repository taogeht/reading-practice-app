import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { colors } from '@/theme/tokens';

export default function IndexScreen() {
  const auth = useAuth();
  if (auth.status === 'loading') {
    return (
      <View style={styles.loading} accessibilityLabel="Loading Starling Rise">
        <ActivityIndicator color={colors.leaf} size="large" />
      </View>
    );
  }
  return <Redirect href={auth.status === 'signedIn' ? '/(app)/(tabs)' : '/welcome'} />;
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: colors.cloud,
    flex: 1,
    justifyContent: 'center',
  },
});
