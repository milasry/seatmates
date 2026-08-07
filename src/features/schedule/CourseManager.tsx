// One component, two jobs (PLAN D18): onboarding schedule entry and the
// Account tab's add/drop screen. Search the scraped catalog, tap a section
// to join; the DB trigger handles the group-chat side.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Field, Loading } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { confirm, notify } from '../../lib/dialogs';
import { supabase } from '../../lib/supabase';
import { fontFamily, radius, space, useTheme } from '../../lib/theme';
import type { CatalogResult, MyCourse } from '../../lib/types';

export function useMyCourses() {
  return useQuery({
    queryKey: ['my-courses'],
    queryFn: async (): Promise<MyCourse[]> => {
      const { data, error } = await supabase.rpc('get_my_courses');
      if (error) throw error;
      return data;
    },
  });
}

/** Archived (not dropped) enrollments — shown as "Past classes" (PLAN review). */
function usePastCourses() {
  return useQuery({
    queryKey: ['past-courses'],
    queryFn: async (): Promise<MyCourse[]> => {
      const { data, error } = await supabase.rpc('get_past_courses');
      if (error) throw error;
      return data;
    },
  });
}

export default function CourseManager({ showDrop }: { showDrop: boolean }) {
  const { colors, type } = useTheme();
  const { session } = useAuth();
  const [q, setQ] = useState('');
  const queryClient = useQueryClient();

  const search = useQuery({
    queryKey: ['catalog', q],
    enabled: q.trim().length >= 2,
    queryFn: async (): Promise<CatalogResult[]> => {
      const { data, error } = await supabase.rpc('search_catalog', { p_q: q.trim() });
      if (error) throw error;
      return data;
    },
  });
  const mine = useMyCourses();
  // Past classes only make sense on the Account screen, not onboarding.
  const past = usePastCourses();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['my-courses'] });
    queryClient.invalidateQueries({ queryKey: ['past-courses'] });
    queryClient.invalidateQueries({ queryKey: ['catalog'] });
    queryClient.invalidateQueries({ queryKey: ['enrollment-count'] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['deck'] });
    queryClient.invalidateQueries({ queryKey: ['study-feed'] });
  };

  const enroll = useMutation({
    mutationFn: async (sectionId: string) => {
      const { error } = await supabase.from('enrollments').upsert(
        { profile_id: session!.user.id, section_id: sectionId, status: 'active' },
        { onConflict: 'profile_id,section_id' },
      );
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => notify('Could not join', e.message),
  });

  const drop = useMutation({
    mutationFn: async (sectionId: string) => {
      const { error } = await supabase
        .from('enrollments')
        .update({ status: 'dropped' })
        .eq('profile_id', session!.user.id)
        .eq('section_id', sectionId);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => notify('Could not drop', e.message),
  });

  const confirmDrop = async (c: MyCourse) => {
    const ok = await confirm(
      `Drop ${c.code} §${c.section}?`,
      'You’ll leave its group chat too. Your DMs stay.',
      'Drop',
      true,
    );
    if (ok) drop.mutate(c.section_id);
  };

  const rejoin = useMutation({
    mutationFn: async (sectionId: string) => {
      const { error } = await supabase.rpc('rejoin_section_chat', { p_section_id: sectionId });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => notify('Could not rejoin', e.message),
  });

  const results = q.trim().length >= 2 ? (search.data ?? []) : [];

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <Field
        placeholder="Course code, title, or SSOL call number"
        value={q}
        onChangeText={setQ}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      {q.trim().length >= 2 ? (
        search.isLoading ? (
          <Loading />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(s) => s.section_id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={[type.sub, { padding: space.md }]}>
                No classes match that search. Try the course code (COMS W3157), the number
                alone (3157), or the call number.
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                disabled={item.enrolled_here || enroll.isPending}
                onPress={() => enroll.mutate(item.section_id)}
                style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.body}>
                    {item.code} §{item.section}
                  </Text>
                  <Text style={type.sub} numberOfLines={1}>
                    {item.title}
                    {item.instructor ? ` · ${item.instructor}` : ''}
                  </Text>
                  <Text style={type.tiny}>
                    {item.call_number ? `Call #${item.call_number}` : ''}
                    {item.enrolled != null && item.capacity != null
                      ? ` · ${item.enrolled}/${item.capacity} enrolled`
                      : ''}
                  </Text>
                </View>
                {item.enrolled_here ? (
                  <Badge text="Joined" />
                ) : (
                  <Text style={[styles.join, { color: colors.primary }]}>Join</Text>
                )}
              </Pressable>
            )}
          />
        )
      ) : (
        <FlatList
          data={[
            ...(mine.data ?? []),
            ...(showDrop && past.data?.length
              ? [{ header: 'Past classes' } as const, ...past.data]
              : []),
          ]}
          keyExtractor={(c) => ('header' in c ? c.header : c.section_id)}
          ListHeaderComponent={
            <Text style={[type.h2, { paddingVertical: space.sm }]}>
              My classes {mine.data?.length ? `(${mine.data.length})` : ''}
            </Text>
          }
          ListEmptyComponent={
            <Text style={type.sub}>
              Search above to add your classes. You’ll join each section’s group chat
              automatically.
            </Text>
          }
          renderItem={({ item }) => {
            if ('header' in item) {
              return (
                <Text style={[type.tiny, { marginTop: space.md, marginBottom: space.xs }]}>
                  {item.header}
                </Text>
              );
            }
            const isPast = !mine.data?.some((c) => c.section_id === item.section_id);
            return (
              <View
                style={[
                  styles.row,
                  { borderColor: colors.border, backgroundColor: colors.card },
                  isPast && { opacity: 0.6 },
                ]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.body}>
                    {item.code} §{item.section}
                  </Text>
                  <Text style={type.sub} numberOfLines={1}>
                    {item.title}
                    {item.instructor ? ` · ${item.instructor}` : ''}
                  </Text>
                </View>
                {!isPast && item.chat_left && (
                  <Pressable
                    disabled={rejoin.isPending}
                    onPress={() => rejoin.mutate(item.section_id)}>
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>Rejoin chat</Text>
                  </Pressable>
                )}
                {showDrop && !isPast && (
                  <Pressable onPress={() => confirmDrop(item)}>
                    <Text style={{ color: colors.danger, fontWeight: '600' }}>Drop</Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: space.md, padding: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 12,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: space.sm,
  },
  join: { fontFamily: fontFamily.bold },
});
