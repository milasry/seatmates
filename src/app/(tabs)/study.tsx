import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Empty, Loading } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { downloadIcs, googleCalendarUrl } from '../../lib/calendar';
import { confirm, notify } from '../../lib/dialogs';
import { supabase } from '../../lib/supabase';
import { fontFamily, radius, space, useTheme } from '../../lib/theme';
import type { StudySession } from '../../lib/types';

export default function Study() {
  const { colors, type } = useTheme();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [calendarSession, setCalendarSession] = useState<StudySession | null>(null);

  const feed = useQuery({
    queryKey: ['study-feed'],
    queryFn: async (): Promise<StudySession[]> => {
      const { data, error } = await supabase.rpc('get_study_feed');
      if (error) throw error;
      return data;
    },
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['study-feed'] });
    }, [queryClient]),
  );

  const rsvp = useMutation({
    mutationFn: async (s: StudySession) => {
      if (s.my_status === 'going') {
        const { error } = await supabase
          .from('rsvps')
          .delete()
          .eq('session_id', s.id)
          .eq('profile_id', session!.user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('rsvps').upsert(
          { session_id: s.id, profile_id: session!.user.id, status: 'going' },
          { onConflict: 'session_id,profile_id' },
        );
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['study-feed'] }),
    onError: (e) => notify('RSVP failed', e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('study_sessions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['study-feed'] }),
    onError: (e) => notify('Could not delete', e.message),
  });

  const confirmDelete = async (s: StudySession) => {
    const ok = await confirm(
      `Delete "${s.title}"?`,
      'Everyone who RSVP’d gets told it was cancelled.',
      'Delete',
      true,
    );
    if (ok) remove.mutate(s.id);
  };

  if (feed.isLoading) return <Loading />;

  // Upcoming first (soonest on top), past below under their own header.
  const upcoming = (feed.data ?? []).filter((s) => +new Date(s.starts_at) >= Date.now());
  const past = (feed.data ?? []).filter((s) => +new Date(s.starts_at) < Date.now()).reverse();
  const rows: (StudySession | { header: string })[] = [
    ...upcoming,
    ...(past.length ? [{ header: 'Past sessions' }, ...past] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(s) => ('header' in s ? s.header : s.id)}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 100 }}
        ListEmptyComponent={
          <Empty
            icon="book-outline"
            title="No study sessions yet"
            body="Post one for any of your classes. Everyone taking that course will see it and can RSVP."
          />
        }
        renderItem={({ item }) => {
          if ('header' in item) {
            return <Text style={[type.tiny, { marginTop: space.md }]}>{item.header}</Text>;
          }
          const when = new Date(item.starts_at);
          const isPast = +when < Date.now();
          const mine = item.host_id === session?.user.id;
          return (
            <View
              style={[
                styles.card,
                { borderColor: colors.border, backgroundColor: colors.card },
                isPast && { opacity: 0.5 },
              ]}>
              <View style={styles.cardTop}>
                <Badge text={item.course_code} />
                <View style={{ flexDirection: 'row', gap: space.md }}>
                  <Pressable onPress={() => setCalendarSession(item)} hitSlop={8}>
                    <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                  </Pressable>
                  {mine && (
                    <>
                      <Pressable
                        onPress={() => router.push(`/study/new?edit=${item.id}`)}
                        hitSlop={8}>
                        <Ionicons name="create-outline" size={20} color={colors.primary} />
                      </Pressable>
                      <Pressable onPress={() => confirmDelete(item)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={20} color={colors.danger} />
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
              <Text style={type.h2}>{item.title}</Text>
              <Text style={type.sub}>
                {when.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
                {' · '}
                {when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                {item.location ? ` · ${item.location}` : ''}
              </Text>
              {item.description ? <Text style={type.body}>{item.description}</Text> : null}
              <View style={styles.cardFooter}>
                <Pressable onPress={() => router.push(`/profile/${item.host_id}`)}>
                  <Text style={type.sub}>
                    Hosted by <Text style={{ color: colors.primary }}>{item.host_name}</Text>
                  </Text>
                </Pressable>
                {mine ? (
                  // The host is always going to their own session — no toggle,
                  // just the count (also enforced server-side, PLAN review).
                  <View style={[styles.rsvp, { borderColor: colors.border }]}>
                    <Text style={{ color: colors.subtle, fontFamily: fontFamily.bold, fontSize: 14 }}>
                      Hosting · {item.going_count} going
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    disabled={isPast || rsvp.isPending}
                    onPress={() => rsvp.mutate(item)}
                    style={[
                      styles.rsvp,
                      { borderColor: colors.primary },
                      item.my_status === 'going' && { backgroundColor: colors.primary },
                    ]}>
                    <Text
                      style={{
                        color: item.my_status === 'going' ? colors.onFill : colors.primary,
                        fontFamily: fontFamily.bold,
                        fontSize: 14,
                      }}>
                      {item.my_status === 'going'
                        ? `Going · ${item.going_count}`
                        : `RSVP · ${item.going_count} going`}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />
      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/study/new')}>
        <Ionicons name="add" size={30} color={colors.onFill} />
      </Pressable>

      <AddToCalendarModal session={calendarSession} onClose={() => setCalendarSession(null)} />
    </View>
  );
}

/** One-hour block, title + time — either a Google Calendar link or a .ics
 * handed to the share sheet (native) / downloaded (web). */
function AddToCalendarModal({
  session,
  onClose,
}: {
  session: StudySession | null;
  onClose: () => void;
}) {
  const { colors, type } = useTheme();
  return (
    <Modal
      visible={!!session}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.calendarBackdrop} onPress={onClose}>
        <Pressable style={[styles.calendarCard, { backgroundColor: colors.bg }]}>
          <Text style={type.h2}>Add to calendar</Text>
          <Text style={[type.sub, { marginBottom: space.sm }]}>
            One-hour block starting when the session does.
          </Text>
          <Button
            title="Add to Google Calendar"
            onPress={() => {
              if (session) Linking.openURL(googleCalendarUrl(session));
              onClose();
            }}
          />
          <Button
            title="Apple / Outlook (.ics)"
            variant="outline"
            onPress={() => {
              if (session) downloadIcs(session);
              onClose();
            }}
          />
          <Button title="Cancel" variant="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.xs,
  },
  rsvp: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 28,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  calendarBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  calendarCard: { width: '100%', maxWidth: 420, borderRadius: 20, padding: space.lg, gap: space.sm },
});
