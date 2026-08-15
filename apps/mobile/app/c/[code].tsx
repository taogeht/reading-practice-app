import { Redirect, useLocalSearchParams } from 'expo-router';

export default function ClassLinkScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={{ pathname: '/class-code', params: { code: code ?? '' } }} />;
}
