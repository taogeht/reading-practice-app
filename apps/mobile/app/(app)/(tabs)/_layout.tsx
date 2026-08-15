import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { colors, type } from '@/theme/tokens';

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return <Text style={[styles.icon, focused && styles.iconFocused]}>{symbol}</Text>;
}

export default function LearnerTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.leaf,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.bar,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarAccessibilityLabel: 'Home. 首頁', tabBarIcon: ({ focused }) => <TabIcon symbol="⌂" focused={focused} /> }} />
      <Tabs.Screen name="read" options={{ title: 'Read', tabBarAccessibilityLabel: 'Read. 閱讀', tabBarIcon: ({ focused }) => <TabIcon symbol="▤" focused={focused} /> }} />
      <Tabs.Screen name="spelling" options={{ title: 'Spelling', tabBarAccessibilityLabel: 'Spelling. 拼字', tabBarIcon: ({ focused }) => <TabIcon symbol="Aa" focused={focused} /> }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarAccessibilityLabel: 'Progress. 進度', tabBarIcon: ({ focused }) => <TabIcon symbol="↗" focused={focused} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.white, borderTopColor: colors.line, height: 78, paddingBottom: 10, paddingTop: 8 },
  label: { fontSize: type.small, fontWeight: '800' },
  icon: { color: colors.muted, fontSize: 22, fontWeight: '900' },
  iconFocused: { color: colors.leaf },
});
