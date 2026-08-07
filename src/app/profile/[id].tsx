import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Badge, Button, Loading } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { confirm, notify } from '../../lib/dialogs';
import { supabase } from '../../lib/supabase';
import { space, useTheme } from '../../lib/theme';
import { schoolYearLabel, type Profile, type Relationship, type SharedSection } from '../../lib/types';

export default function ProfileViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, type } = useTheme();
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const profile = useQuery({
    queryKey: ['profile-view', id],
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
  });

  const relationship = useQuery({
    queryKey: ['relationship', id],
    queryFn: async (): Promise<Relationship> => {
      const { data, error } = await supabase.rpc('relationship_with', { p_other: id });
      if (error) throw error;
      return data;
    },
  });

  const shared = useQuery({
    queryKey: ['shared-sections', id],
    queryFn: async (): Promise<SharedSection[]> => {
      const { data, error } = await supabase.rpc('shared_sections', { p_other: id });
      if (error) throw error;
      return data;
    },
  });

  // RLS only ever returns rows this user is the blocker on, so a hit here
  // means "I blocked them" specifically, not just "this pair is blocked."
  const myBlock = useQuery({
    queryKey: ['my-block', id],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('blocks')
        .select('blocked_id')
        .eq('blocker_id', session!.user.id)
        .eq('blocked_id', id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const request = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('send_friend_request', {
        p_to: id,
        p_source: 'profile',
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['relationship', id] }),
    onError: (e) => notify('Could not send', e.message),
  });

  const openDm = async () => {
    const { data } = await supabase.rpc('dm_with', { p_other: id });
    if (data) router.push(`/chat/${data}`);
  };

  const invalidateBlockState = () => {
    queryClient.invalidateQueries({ queryKey: ['deck'] });
    queryClient.invalidateQueries({ queryKey: ['study-feed'] });
    queryClient.invalidateQueries({ queryKey: ['relationship', id] });
    queryClient.invalidateQueries({ queryKey: ['my-block', id] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const block = async () => {
    const ok = await confirm(
      'Block this person?',
      'They disappear from your deck and can’t message you. They won’t be told.',
      'Block',
      true,
    );
    if (!ok) return;
    await supabase.from('blocks').insert({ blocker_id: session!.user.id, blocked_id: id });
    invalidateBlockState();
    router.back();
  };

  const unblock = async () => {
    const ok = await confirm(
      'Unblock this person?',
      'They’ll be able to message you and reappear in your deck and study feed.',
      'Unblock',
      false,
    );
    if (!ok) return;
    await supabase.from('blocks').delete().eq('blocker_id', session!.user.id).eq('blocked_id', id);
    invalidateBlockState();
  };

  const report = async () => {
    const ok = await confirm(
      'Report this person?',
      'Tell us what happened; the team reviews every report.',
      'Report',
      true,
    );
    if (!ok) return;
    await supabase
      .from('reports')
      .insert({ reporter_id: session!.user.id, reported_id: id, reason: 'in-app report' });
    notify('Thanks', 'We got it.');
  };

  if (profile.isLoading) return <Loading />;
  const p = profile.data;
  if (!p) return null;
  const rel = relationship.data;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.body}>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Avatar uri={p.photo_url} name={p.full_name} size={120} />
        <Text style={type.title}>{p.full_name}</Text>
        {schoolYearLabel(p.school, p.grad_year) ? (
          <Text style={[type.sub, { color: colors.primary }]}>
            {schoolYearLabel(p.school, p.grad_year)}
          </Text>
        ) : null}
        <Text style={type.body}>
          {[p.major, p.hometown].filter(Boolean).join(' · ') || 'Columbia student'}
        </Text>
        <View style={styles.sharedWrap}>
          {/* Every shared class, name + code (team decision) */}
          {(shared.data ?? []).map((s) => (
            <Badge key={`${s.code}-${s.section}`} text={`${s.title} · ${s.code} §${s.section}`} />
          ))}
        </View>
      </View>

      {rel === 'none' && (
        <Button title="Add friend" onPress={() => request.mutate()} loading={request.isPending} />
      )}
      {rel === 'out_pending' && <Button title="Request sent" variant="outline" disabled onPress={() => {}} />}
      {rel === 'in_pending' && (
        <Button title="They asked first. Respond in Inbox" variant="outline" onPress={() => router.push('/inbox')} />
      )}
      {rel === 'friends' && <Button title="Message" onPress={openDm} />}

      {p.bio ? (
        <View style={styles.section}>
          <Text style={type.tiny}>About</Text>
          <Text style={type.body}>{p.bio}</Text>
        </View>
      ) : null}

      {p.study_spot ? (
        <View style={styles.section}>
          <Text style={type.tiny}>Favorite study spot</Text>
          <Text style={type.body}>{p.study_spot}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={type.tiny}>Contact</Text>
        <Row icon="mail-outline" text={p.email} onPress={() => Linking.openURL(`mailto:${p.email}`)} />
        {p.instagram ? (
          <Row
            icon="logo-instagram"
            text={`@${p.instagram}`}
            onPress={() => Linking.openURL(`https://instagram.com/${p.instagram}`)}
          />
        ) : null}
        {p.linkedin ? (
          <LinkedinRow handle={p.linkedin} />
        ) : null}
      </View>

      {rel !== 'self' && (
        <View style={[styles.section, { flexDirection: 'row', gap: space.lg }]}>
          {rel === 'blocked' ? (
            myBlock.data ? (
              <Pressable onPress={unblock}>
                <Text style={{ color: colors.primary }}>Unblock</Text>
              </Pressable>
            ) : null
          ) : (
            <Pressable onPress={block}>
              <Text style={{ color: colors.danger }}>Block</Text>
            </Pressable>
          )}
          <Pressable onPress={report}>
            <Text style={{ color: colors.danger }}>Report</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function LinkedinRow({ handle }: { handle: string }) {
  return (
    <Row
      icon="logo-linkedin"
      text={handle}
      onPress={() => Linking.openURL(`https://linkedin.com/${handle.replace(/^\/+/, '')}`)}
    />
  );
}

function Row({ icon, text, onPress }: { icon: string; text: string; onPress: () => void }) {
  const { colors, type } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Ionicons name={icon as never} size={20} color={colors.primary} />
      <Text style={[type.body, { color: colors.primary }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xl * 2 },
  sharedWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    justifyContent: 'center',
    marginTop: space.xs,
  },
  section: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4 },
});
