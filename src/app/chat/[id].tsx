import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Avatar, Button, Loading } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { fontFamily, radius, space, useTheme } from '../../lib/theme';
import type { Member, Message } from '../../lib/types';
import { confirm, notify } from '../../lib/dialogs';

// Static for now; swap for an Edge Function + Claude if Phase 4 lands early (PLAN A5).
const ICEBREAKERS = [
  'Rate the lecture pace so far: gentle jog or full sprint?',
  'What are you calling this class in your notes app? Be honest.',
  'Study spot of choice: Butler, Milstein, or somewhere secret?',
  'What made you take this class?',
  'PSet buddy? I bring snacks.',
];

export default function ChatThread() {
  const { colors, type } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [membersOpen, setMembersOpen] = useState(false);

  const info = useQuery({
    queryKey: ['conversation', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_conversation_info', { p_id: id });
      if (error) throw error;
      return data?.[0] as
        | {
            id: string;
            kind: 'section' | 'dm';
            title: string;
            subtitle: string | null;
            member: boolean;
            can_post: boolean;
            blocked: boolean;
          }
        | undefined;
    },
  });

  const messages = useQuery({
    queryKey: ['messages', id],
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:profiles(id, full_name, photo_url)')
        .eq('conversation_id', id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Message[];
    },
  });

  // Live updates: new inserts land at the top of the (inverted) list.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`messages-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', id] });
          supabase.rpc('mark_conversation_read', { p_conversation: id });
        },
      )
      .subscribe();
    supabase.rpc('mark_conversation_read', { p_conversation: id });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  const send = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase
        .from('messages')
        .insert({ conversation_id: id, sender_id: session!.user.id, body });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['messages', id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e) => notify('Not sent', e.message),
  });

  const leave = async () => {
    const ok = await confirm(
      'Leave this group chat?',
      'You stay enrolled in the class and keep your DMs. Re-adding the class won’t re-add the chat.',
      'Leave',
      true,
    );
    if (!ok) return;
    await supabase.rpc('leave_conversation', { p_conversation: id });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    router.back();
  };

  const isSection = info.data?.kind === 'section';
  const readOnly = info.data ? !info.data.can_post : false;
  const showIcebreakers =
    info.data?.kind === 'dm' &&
    !info.data?.blocked &&
    (messages.data?.length ?? 0) === 0 &&
    !messages.isLoading;

  const rows = useMemo(() => messages.data ?? [], [messages.data]);

  if (info.isLoading) return <Loading />;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      <Stack.Screen
        options={{
          title: info.data?.title ?? 'Chat',
          headerRight: () =>
            isSection && !readOnly ? (
              <View style={{ flexDirection: 'row', gap: 18 }}>
                <Pressable onPress={() => setMembersOpen(true)} hitSlop={8}>
                  <Ionicons name="people-outline" size={24} color={colors.primary} />
                </Pressable>
                <Pressable onPress={leave} hitSlop={8}>
                  <Ionicons name="exit-outline" size={24} color={colors.danger} />
                </Pressable>
              </View>
            ) : undefined,
        }}
      />

      <FlatList
        inverted
        data={rows}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: space.md, gap: 6 }}
        ListEmptyComponent={
          showIcebreakers ? (
            <View style={styles.icebreakers}>
              {/* Inverted list flips children; flip back. */}
              <Text style={[type.sub, { textAlign: 'center' }]}>
                Starting is the hard part. Steal one:
              </Text>
              {ICEBREAKERS.map((line) => (
                <Pressable
                  key={line}
                  onPress={() => setDraft(line)}
                  style={[styles.icebreaker, { borderColor: colors.accent }]}>
                  <Text style={[type.accent, { color: colors.primary, fontSize: 15 }]}>{line}</Text>
                </Pressable>
              ))}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            mine={item.sender_id === session?.user.id}
            showSender={isSection}
          />
        )}
      />

      {readOnly ? (
        <View style={[styles.readOnlyBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons
            name={info.data?.blocked ? 'ban-outline' : 'archive-outline'}
            size={16}
            color={colors.subtle}
          />
          <Text style={type.sub}>
            {info.data?.blocked ? 'This person is blocked' : 'Archived, read-only'}
          </Text>
        </View>
      ) : (
        <View style={[styles.composer, { borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
            placeholder="Message…"
            placeholderTextColor={colors.subtle}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable
            onPress={() => draft.trim() && send.mutate(draft.trim())}
            disabled={!draft.trim() || send.isPending}
            style={[
              styles.sendBtn,
              { backgroundColor: colors.primary, opacity: draft.trim() ? 1 : 0.4 },
            ]}>
            <Ionicons name="arrow-up" size={22} color={colors.onFill} />
          </Pressable>
        </View>
      )}

      <MembersModal open={membersOpen} onClose={() => setMembersOpen(false)} conversationId={id!} />
    </KeyboardAvoidingView>
  );
}

function MessageBubble({
  message,
  mine,
  showSender,
}: {
  message: Message;
  mine: boolean;
  showSender: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.bubbleRow, mine && { flexDirection: 'row-reverse' }]}>
      {!mine && showSender && (
        <Pressable onPress={() => router.push(`/profile/${message.sender_id}`)}>
          <Avatar uri={message.sender?.photo_url} name={message.sender?.full_name} size={32} />
        </Pressable>
      )}
      <View
        style={[
          styles.bubble,
          mine ? styles.bubbleMine : styles.bubbleTheirs,
          { backgroundColor: mine ? colors.primary : colors.surface },
        ]}>
        {!mine && showSender && (
          // Tap a name to open the profile → add friend from there (PLAN D9).
          <Pressable onPress={() => router.push(`/profile/${message.sender_id}`)}>
            <Text style={[styles.senderName, { color: colors.primary }]}>
              {message.sender?.full_name ?? 'Classmate'}
            </Text>
          </Pressable>
        )}
        <Text
          style={{
            color: mine ? colors.onFill : colors.text,
            fontSize: 16,
            fontFamily: fontFamily.ui,
          }}>
          {message.body}
        </Text>
      </View>
    </View>
  );
}

function MembersModal({
  open,
  onClose,
  conversationId,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
}) {
  const { colors, type } = useTheme();
  const queryClient = useQueryClient();
  const members = useQuery({
    queryKey: ['members', conversationId],
    enabled: open,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase.rpc('get_members', {
        p_conversation: conversationId,
      });
      if (error) throw error;
      return data;
    },
  });

  const request = useMutation({
    mutationFn: async (to: string) => {
      const { error } = await supabase.rpc('send_friend_request', {
        p_to: to,
        p_source: 'group_chat',
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', conversationId] }),
    onError: (e) => notify('Could not send request', e.message),
  });

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.membersRoot, { backgroundColor: colors.bg }]}>
        <View style={[styles.membersHeader, { borderBottomColor: colors.border }]}>
          <Text style={type.h2}>Members</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        {/* Individually add people — deliberately no "add all" (PLAN D9). */}
        <FlatList
          data={members.data ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          renderItem={({ item }) => (
            <View style={styles.memberRow}>
              <Pressable
                style={styles.memberInfo}
                onPress={() => {
                  onClose();
                  router.push(`/profile/${item.id}`);
                }}>
                <Avatar uri={item.photo_url} name={item.full_name} size={44} />
                <View>
                  <Text style={type.body}>{item.full_name ?? 'Classmate'}</Text>
                  {item.major ? <Text style={type.sub}>{item.major}</Text> : null}
                </View>
              </Pressable>
              {item.relationship === 'none' && (
                <Button small title="Add friend" onPress={() => request.mutate(item.id)} />
              )}
              {item.relationship === 'out_pending' && (
                <Button small title="Requested" variant="outline" disabled onPress={() => {}} />
              )}
              {item.relationship === 'in_pending' && (
                <Button
                  small
                  title="Respond"
                  variant="outline"
                  onPress={() => {
                    onClose();
                    router.push('/inbox');
                  }}
                />
              )}
              {item.relationship === 'friends' && (
                <Text style={{ color: colors.success, fontWeight: '600' }}>Friends</Text>
              )}
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

// Structural only — colour comes from useTheme() at the usage site.
const styles = StyleSheet.create({
  root: { flex: 1 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubble: { maxWidth: '78%', borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleTheirs: { borderBottomLeftRadius: 4 },
  senderName: { fontSize: 12, fontFamily: fontFamily.bold, marginBottom: 2 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
  },
  readOnlyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 120,
    fontFamily: fontFamily.ui,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icebreakers: { gap: space.sm, padding: space.md, transform: [{ scaleY: -1 }] },
  icebreaker: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'center',
  },
  membersRoot: { flex: 1 },
  membersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.lg,
    borderBottomWidth: 1,
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberInfo: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 },
});
