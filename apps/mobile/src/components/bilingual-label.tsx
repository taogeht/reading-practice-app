import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import { colors, type } from '@/theme/tokens';

export function BilingualLabel({
  en,
  zh,
  align = 'left',
  style,
}: {
  en: string;
  zh: string;
  align?: TextStyle['textAlign'];
  style?: TextStyle;
}) {
  return (
    <View accessibilityLabel={`${en}. ${zh}`}>
      <Text style={[styles.en, { textAlign: align }, style]}>{en}</Text>
      <Text lang="zh-Hant" style={[styles.zh, { textAlign: align }]}>
        {zh}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  en: { color: colors.ink, fontSize: type.body, fontWeight: '800' },
  zh: { color: colors.muted, fontSize: type.small, fontWeight: '600', marginTop: 2 },
});
