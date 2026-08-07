import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import DateField from '../../components/DateField';
import { Button, Field, Loading } from '../../components/ui';
import { useMyCourses } from '../../features/schedule/CourseManager';
import { useAuth } from '../../lib/auth';
import { notify } from '../../lib/dialogs';
import { supabase } from '../../lib/supabase';
import { fontFamily, radius, space, useTheme } from '../../lib/theme';

/** Create OR edit a study session (?edit=<id>). Edits notify everyone going. */
export default function StudySessionForm() {
  const { colors, type } = useTheme();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const myCourses = useMyCourses();

  const [courseId, setCourseId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [when, setWhen] = useState<Date | null>(null);

  const existing = useQuery({
    queryKey: ['study-session', edit],
    enabled: !!edit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('study_sessions')
        .select('*')
        .eq('id', edit)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const s = existing.data;
    if (!s) return;
    setCourseId((v) => v ?? s.course_id);
    setTitle((v) => v || s.title);
    setDescription((v) => v || (s.description ?? ''));
    setLocation((v) => v || (s.location ?? ''));
    setWhen((v) => v ?? new Date(s.starts_at));
  }, [existing.data]);

  // Sessions scope to the course, not the section (PLAN A2) — dedupe.
  const courses = useMemo(() => {
    const seen = new Map<string, { id: string; code: string; title: string }>();
    for (const c of myCourses.data ?? []) {
      if (!seen.has(c.course_id)) seen.set(c.course_id, { id: c.course_id, code: c.code, title: c.title });
    }
    return [...seen.values()];
  }, [myCourses.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!when) throw new Error('Pick a date and time.');
      const row = {
        course_id: courseId,
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        starts_at: when.toISOString(),
      };
      if (edit) {
        const { error } = await supabase.from('study_sessions').update(row).eq('id', edit);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('study_sessions')
          .insert({ ...row, host_id: session!.user.id })
          .select('id')
          .single();
        if (error) throw error;
        // Hosts are going to their own session.
        await supabase.from('rsvps').upsert(
          { session_id: data.id, profile_id: session!.user.id, status: 'going' },
          { onConflict: 'session_id,profile_id' },
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study-feed'] });
      router.back();
    },
    onError: (e) => notify('Could not save', e.message),
  });

  if (edit && existing.isLoading) return <Loading />;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: edit ? 'Edit study session' : 'New study session' }} />
      <Text style={type.sub}>Class</Text>
      <View style={styles.chips}>
        {courses.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setCourseId(c.id)}
            style={[
              styles.chip,
              { borderColor: colors.primary },
              courseId === c.id && { backgroundColor: colors.primary },
            ]}>
            <Text
              style={{
                color: courseId === c.id ? colors.onFill : colors.primary,
                fontFamily: fontFamily.semibold,
              }}>
              {c.code}
            </Text>
          </Pressable>
        ))}
      </View>

      <Field label="Title" placeholder="Midterm grind session" value={title} onChangeText={setTitle} />
      <Field
        label="Details (optional)"
        placeholder="What are you covering? Snacks?"
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ minHeight: 70, textAlignVertical: 'top' }}
      />
      <Field label="Location" placeholder="Butler 403" value={location} onChangeText={setLocation} />
      <DateField label="When" value={when} onChange={setWhen} />

      <Button
        title={edit ? 'Save changes' : 'Post it'}
        onPress={() => save.mutate()}
        loading={save.isPending}
        disabled={!courseId || !title.trim() || !when}
      />
      <Text style={type.fine}>
        {edit
          ? 'Everyone who RSVP’d gets a notification about the change.'
          : 'Anyone taking this course can see it and RSVP, whatever section they’re in.'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

});
