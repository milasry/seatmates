import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Empty, Loading } from '../components/ui';
import { notify } from '../lib/dialogs';
import { supabase } from '../lib/supabase';
import { space, useTheme } from '../lib/theme';
import type { ArchivedConversation } from '../lib/types';

/** Past semesters' class chats — readable forever, read-only (not deleted). */
export default function ArchivedChats() {
  const { colors, type } = useTheme();
  const queryClient = useQueryClient();
  const archived = useQuery({
    queryKey: ['archived-conversations'],
    queryFn: async (): Promise<ArchivedConversation[]> => {
      const { data, error } = await supabase.rpc('get_archived_conversations');
      if (error) throw error;
      return data;
    },
  });

  const restore = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc('unarchive_section_chat', {
        p_conversation: conversationId,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (e) => notify('Could not restore', e.message),
  });

  if (archived.isLoading) return <Loading />;

  const rows = archived.data ?? [];
  if (rows.length === 0) {
    return (
      <Empty
        icon="archive-outline"
        title="Nothing archived"
        body="When a semester ends, archive it from the Account tab. Class chats move here instead of disappearing."
      />
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={rows}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/chat/${item.id}`)} style={styles.row}>
          <View style={[styles.icon, { backgroundColor: colors.surface }]}>
            <Ionicons name="archive-outline" size={22} color={colors.subtle} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.body}>{item.title}</Text>
            {item.subtitle ? <Text style={type.sub}>{item.subtitle}</Text> : null}
            <Text style={type.tiny}>read-only</Text>
          </View>
          <Pressable onPress={() => restore.mutate(item.id)} disabled={restore.isPending} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Restore</Text>
          </Pressable>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
