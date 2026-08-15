import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  STUDENT_AVATARS,
  visualPasswordOptions,
  type MobileClassResolveResponse,
  type StudentRosterEntry,
  type VisualPasswordStudent,
} from '@starling-rise/contracts';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { mobileApi, MobileApiError } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { colors, radii, spacing, type } from '@/theme/tokens';

export default function ClassCodeScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const initialCode = typeof params.code === 'string' ? params.code : '';
  const [code, setCode] = useState(initialCode);
  const [classInfo, setClassInfo] = useState<MobileClassResolveResponse | null>(null);
  const [roster, setRoster] = useState<StudentRosterEntry[]>([]);
  const [student, setStudent] = useState<VisualPasswordStudent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = useAuth();
  const router = useRouter();
  const autoLoaded = useRef(false);

  const loadClass = async (requestedCode = code) => {
    if (requestedCode.trim().length < 4) {
      setError('Enter the class code from your teacher. 請輸入老師給你的班級代碼。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resolved = await mobileApi.resolveClass(requestedCode.trim());
      const response = await mobileApi.classRoster(resolved.canonicalClassId);
      setClassInfo(resolved);
      setRoster(response.students);
    } catch (loadError) {
      setError(
        loadError instanceof MobileApiError
          ? loadError.message
          : 'We could not find that class. Check the code and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!initialCode || autoLoaded.current) return;
    autoLoaded.current = true;
    void loadClass(initialCode);
  }, [initialCode]);

  const chooseStudent = async (entry: StudentRosterEntry) => {
    if (!classInfo) return;
    setBusy(true);
    setError(null);
    try {
      setStudent(await mobileApi.visualPasswordStudent(classInfo.canonicalClassId, entry.id));
    } catch {
      setError('We could not open this student. Please choose the name again.');
    } finally {
      setBusy(false);
    }
  };

  const choosePassword = async (visualPassword: string) => {
    if (!classInfo || !student) return;
    setBusy(true);
    setError(null);
    try {
      await auth.loginWithVisual({
        classId: classInfo.canonicalClassId,
        studentId: student.id,
        visualPassword,
      });
      router.replace('/(app)/(tabs)');
    } catch (loginError) {
      setError(
        loginError instanceof MobileApiError
          ? loginError.message
          : 'That picture did not work. Try again.',
      );
      setBusy(false);
    }
  };

  if (student) {
    const options = visualPasswordOptions(student.visualPasswordType);
    return (
      <Screen>
        <Text style={styles.eyebrow}>HI, {student.firstName.toUpperCase()}</Text>
        <Text style={styles.title}>Choose your secret picture</Text>
        <Text style={styles.titleZh}>選擇你的秘密圖片</Text>
        <View style={styles.passwordGrid}>
          {options.map((option) => (
            <Pressable
              accessibilityLabel={option.name}
              accessibilityRole="button"
              disabled={busy}
              key={option.id}
              onPress={() => void choosePassword(option.id)}
              style={({ pressed }) => [styles.passwordOption, pressed && styles.pressed]}
            >
              <Text style={styles.passwordEmoji}>{option.emoji}</Text>
              <Text style={styles.passwordName}>{option.name}</Text>
            </Pressable>
          ))}
        </View>
        {busy && <Text style={styles.centerMuted}>Checking… 正在確認…</Text>}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <PrimaryButton label="Choose another name  選擇其他名字" secondary onPress={() => { setStudent(null); setError(null); }} />
      </Screen>
    );
  }

  if (classInfo) {
    return (
      <Screen>
        <Text style={styles.eyebrow}>YOUR CLASS  你的班級</Text>
        <Text style={styles.title}>{classInfo.class.name}</Text>
        <Text style={styles.teacher}>{classInfo.class.teacherName}</Text>
        <Text style={styles.prompt}>Choose your name</Text>
        <Text style={styles.promptZh}>選擇你的名字</Text>
        <View style={styles.roster}>
          {roster.map((entry, index) => (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              key={entry.id}
              onPress={() => void chooseStudent(entry)}
              style={({ pressed }) => [styles.student, pressed && styles.pressed]}
            >
              <Text style={styles.avatar}>{entry.avatarUrl || STUDENT_AVATARS[index % STUDENT_AVATARS.length].emoji}</Text>
              <View style={styles.studentName}>
                <Text style={styles.firstName}>{entry.firstName}</Text>
                <Text style={styles.lastName}>{entry.lastName}</Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          ))}
        </View>
        {roster.length === 0 && <Text style={styles.centerMuted}>No learners are listed in this class yet.</Text>}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <PrimaryButton label="Use another class code  使用其他班級代碼" secondary onPress={() => { setClassInfo(null); setRoster([]); setError(null); }} />
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.codeScreen}>
      <View>
        <Text style={styles.eyebrow}>FROM YOUR TEACHER  老師提供</Text>
        <Text style={styles.title}>Enter your class code</Text>
        <Text style={styles.titleZh}>輸入你的班級代碼</Text>
        <Text style={styles.help}>It may look like “grade-2-spring” or a short group of letters and numbers.</Text>
      </View>
      <TextInput
        accessibilityLabel="Class code"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setCode}
        onSubmitEditing={() => void loadClass()}
        placeholder="Class code"
        placeholderTextColor={colors.muted}
        returnKeyType="go"
        style={styles.input}
        value={code}
      />
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <PrimaryButton busy={busy} label="Find my class  尋找我的班級" onPress={() => void loadClass()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeScreen: { gap: spacing.lg, justifyContent: 'center' },
  eyebrow: { color: colors.leaf, fontSize: type.small, fontWeight: '900', letterSpacing: 1.2, marginBottom: spacing.sm },
  title: { color: colors.ink, fontSize: type.display, fontWeight: '900', letterSpacing: -1 },
  titleZh: { color: colors.leaf, fontSize: type.title, fontWeight: '800', marginTop: spacing.xs },
  teacher: { color: colors.muted, fontSize: type.body, marginTop: spacing.sm },
  help: { color: colors.muted, fontSize: type.body, lineHeight: 27, marginTop: spacing.md },
  input: { backgroundColor: colors.white, borderColor: colors.line, borderRadius: radii.md, borderWidth: 2, color: colors.ink, fontSize: type.title, fontWeight: '800', minHeight: 64, paddingHorizontal: spacing.md },
  prompt: { color: colors.ink, fontSize: type.title, fontWeight: '900', marginTop: spacing.xl },
  promptZh: { color: colors.muted, fontSize: type.body, marginBottom: spacing.md },
  roster: { gap: spacing.sm, marginBottom: spacing.lg },
  student: { alignItems: 'center', backgroundColor: colors.white, borderColor: colors.line, borderRadius: radii.md, borderWidth: 2, flexDirection: 'row', minHeight: 76, padding: spacing.md },
  avatar: { fontSize: 36, width: 52 },
  studentName: { flex: 1 },
  firstName: { color: colors.ink, fontSize: type.body, fontWeight: '900' },
  lastName: { color: colors.muted, fontSize: type.label },
  arrow: { color: colors.leaf, fontSize: 38, fontWeight: '700' },
  passwordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.lg },
  passwordOption: { alignItems: 'center', backgroundColor: colors.white, borderColor: colors.line, borderRadius: radii.md, borderWidth: 2, justifyContent: 'center', minHeight: 112, padding: spacing.sm, width: '31%' },
  passwordEmoji: { fontSize: 40 },
  passwordName: { color: colors.ink, fontSize: type.small, fontWeight: '800', marginTop: spacing.xs, textAlign: 'center' },
  pressed: { borderColor: colors.leaf, opacity: 0.8, transform: [{ scale: 0.98 }] },
  error: { backgroundColor: '#FBEDEA', borderRadius: radii.sm, color: colors.coral, fontSize: type.label, marginBottom: spacing.md, padding: spacing.md, textAlign: 'center' },
  centerMuted: { color: colors.muted, fontSize: type.body, marginBottom: spacing.md, textAlign: 'center' },
});
