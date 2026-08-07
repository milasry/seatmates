import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../components/ui';
import CourseManager, { useMyCourses } from '../../features/schedule/CourseManager';
import { space, useTheme } from '../../lib/theme';

export default function OnboardingSchedule() {
  const { colors } = useTheme();
  const mine = useMyCourses();
  const count = mine.data?.length ?? 0;
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <CourseManager showDrop={false} />
      <View style={styles.footer}>
        <Button
          title={count > 0 ? `Done, ${count} class${count === 1 ? '' : 'es'} added` : 'Add at least one class'}
          disabled={count === 0}
          onPress={() => router.replace('/(tabs)')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  footer: { padding: space.lg, paddingTop: 0 },
});
