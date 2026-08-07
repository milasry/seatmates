import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Celebration from '../components/Celebration';
import { Avatar, Button, Empty, Loading } from '../components/ui';
import { notify } from '../lib/dialogs';
import { supabase } from '../lib/supabase';
import { space, useTheme } from '../lib/theme';
import type { InboxItem } from '../lib/types';

export default function Inbox() {
  const { colors, type } = useTheme();
  const queryClient = useQueryClient();
  const [celebrate, setCelebrate] = useState<{ name: string; conversationId: string | null } | null>(
    null,
  );

  const inbox = useQuery({
    queryKey: ['inbox'],
    queryFn: async (): Promise<InboxItem[]> => {
      const { data, error } = await supabase.rpc('get_inbox');
      if (error) throw error;
      return data;
    },
  });

  // Opening the inbox clears the badge.
  useEffect(() => {
    supabase.rpc('mark_notifications_read').then(() => {
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    });
  }, [queryClient]);

  const respond = useMutation({
    mutationFn: async (args: { requestId: string; accept: boolean; actorName?: string | null }) => {
      const { data, error } = await supabase.rpc('respond_friend_request', {
        p_request: args.requestId,
        p_accept: args.accept,
      });
      if (error) throw error;
      return data as string | null; // dm conversation id on accept
    },
    onSuccess: (conversationId, args) => {
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['deck'] });
      if (args.accept && conversationId) {
        // Same 🎉 as a swipe match — it's the same event (team decision).
        setCelebrate({ name: args.actorName ?? 'your classmate', conversationId });
      }
    },
    onError: (e) => notify('Something broke', e.message),
  });

  if (inbox.isLoading) return <Loading />;

  const items = inbox.data ?? [];
  const overlay = celebrate ? (
    <Celebration
      name={celebrate.name}
      conversationId={celebrate.conversationId}
      onClose={() => setCelebrate(null)}
    />
  ) : null;

  if (items.length === 0) {
    return (
      <>
        <Empty
          icon="notifications-outline"
          title="Nothing yet"
          body="Friend requests, matches, and announcements land here."
        />
        {overlay}
      </>
    );
  }

  return (
    <>
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={items}
      keyExtractor={(n) => n.id}
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      renderItem={({ item }) => (
        <View
          style={[
            styles.item,
            !item.read_at && [styles.itemUnread, { backgroundColor: colors.accentSoft }],
          ]}>
          {item.actor_id ? (
            <Pressable onPress={() => router.push(`/profile/${item.actor_id}`)}>
              <Avatar uri={item.actor_photo} name={item.actor_name} size={44} />
            </Pressable>
          ) : (
            <Ionicons name="megaphone-outline" size={26} color={colors.primary} />
          )}
          <View style={{ flex: 1, gap: space.sm }}>
            <Text style={type.body}>{item.body}</Text>
            <Text style={type.tiny}>
              {new Date(item.created_at).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
            {item.kind === 'friend_request' && item.request_status === 'pending' && (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button
                  small
                  title="Accept"
                  onPress={() =>
                    respond.mutate({
                      requestId: item.entity_id!,
                      accept: true,
                      actorName: item.actor_name,
                    })
                  }
                />
                <Button
                  small
                  title="Decline"
                  variant="outline"
                  onPress={() => respond.mutate({ requestId: item.entity_id!, accept: false })}
                />
              </View>
            )}
            {item.kind === 'friend_request' && item.request_status === 'accepted' && (
              <Text style={[type.sub, { color: colors.success }]}>
                Accepted
              </Text>
            )}
            {(item.kind === 'new_match' || item.kind === 'request_accepted') && item.entity_id && (
              <Button
                small
                title="Open chat"
                variant="outline"
                onPress={() => router.push(`/chat/${item.entity_id}`)}
              />
            )}
          </View>
        </View>
      )}
    />
    {overlay}
    </>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  itemUnread: {
    marginHorizontal: -space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderRadius: 12,
  },
});
