import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Celebration from '../../components/Celebration';
import { Button, Empty, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { fontFamily, radius, space, useTheme } from '../../lib/theme';
import { schoolYearLabel, type DeckCard } from '../../lib/types';

const SWIPE_THRESHOLD = 110;

export default function Swipe() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [cursor, setCursor] = useState(0);
  const [match, setMatch] = useState<{ name: string; conversationId: string | null } | null>(null);

  const deck = useQuery({
    queryKey: ['deck'],
    queryFn: async (): Promise<DeckCard[]> => {
      const { data, error } = await supabase.rpc('get_swipe_deck');
      if (error) throw error;
      return data;
    },
  });

  useFocusEffect(
    useCallback(() => {
      // New enrollments / accepted requests change the deck; refresh when shown.
      queryClient.invalidateQueries({ queryKey: ['deck'] });
    }, [queryClient]),
  );

  const swipe = useMutation({
    mutationFn: async (args: { swipee: string; direction: 'left' | 'right' }) => {
      const { data, error } = await supabase.rpc('record_swipe', {
        p_swipee: args.swipee,
        p_direction: args.direction,
      });
      if (error) throw error;
      return data as { matched: boolean; conversation_id: string | null };
    },
  });

  // ─── Gesture logic below is UNCHANGED from the original screen ───
  const pan = useRef(new Animated.ValueXY()).current;
  const cards = deck.data ?? [];
  const card = cards[cursor];

  const advance = useCallback(
    (direction: 'left' | 'right') => {
      if (!card) return;
      const current = card;
      swipe.mutate(
        { swipee: current.id, direction },
        {
          onSuccess: (res) => {
            if (res.matched) {
              setMatch({ name: current.full_name, conversationId: res.conversation_id });
              queryClient.invalidateQueries({ queryKey: ['conversations'] });
              queryClient.invalidateQueries({ queryKey: ['unread-count'] });
            }
          },
        },
      );
      setCursor((c) => c + 1);
      pan.setValue({ x: 0, y: 0 });
    },
    [card, swipe, pan, queryClient],
  );

  const fling = useCallback(
    (direction: 'left' | 'right') => {
      Animated.timing(pan, {
        toValue: { x: direction === 'right' ? width * 1.3 : -width * 1.3, y: 0 },
        duration: 180,
        useNativeDriver: false,
      }).start(() => advance(direction));
    },
    [pan, width, advance],
  );

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_e, g) => {
        if (g.dx > SWIPE_THRESHOLD) fling('right');
        else if (g.dx < -SWIPE_THRESHOLD) fling('left');
        else
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
      },
    }),
  ).current;
  // ─── end unchanged gesture logic ───

  if (deck.isLoading) return <Loading />;

  if (!card) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Empty
          icon="school-outline"
          title="That’s everyone for now"
          body="You’ve seen every classmate in your sections. Add another class, or check back as more people join."
        />
        <View style={{ padding: space.lg }}>
          <Button title="Add a class" variant="outline" onPress={() => router.push('/courses')} />
        </View>
      </View>
    );
  }

  const rotate = pan.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: ['-12deg', '0deg', '12deg'],
  });
  const likeOpacity = pan.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const nopeOpacity = pan.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* Peek of the next card */}
      {cards[cursor + 1] && (
        <View style={[styles.card, styles.cardBehind, { backgroundColor: colors.card }]}>
          <CardFace card={cards[cursor + 1]} />
        </View>
      )}

      <Animated.View
        {...responder.panHandlers}
        style={[
          styles.card,
          { backgroundColor: colors.card },
          { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] },
        ]}>
        <Pressable style={{ flex: 1 }} onPress={() => router.push(`/profile/${card.id}`)}>
          <CardFace card={card} />
        </Pressable>
        <Animated.View
          style={[styles.stamp, styles.like, { borderColor: colors.success, opacity: likeOpacity }]}>
          <Text style={[styles.stampText, { color: colors.success }]}>FRIEND</Text>
        </Animated.View>
        <Animated.View
          style={[styles.stamp, styles.nope, { borderColor: colors.danger, opacity: nopeOpacity }]}>
          <Text style={[styles.stampText, { color: colors.danger }]}>PASS</Text>
        </Animated.View>
      </Animated.View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => fling('left')}
          style={[styles.fab, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="close" size={30} color={colors.danger} />
        </Pressable>
        <Pressable
          onPress={() => fling('right')}
          style={[styles.fab, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="heart" size={28} color={colors.warm} />
        </Pressable>
      </View>

      {match && (
        <Celebration
          name={match.name}
          conversationId={match.conversationId}
          onClose={() => setMatch(null)}
        />
      )}
    </View>
  );
}

// ─── Redesigned card face: big photo, confident type, shared class as the
// hero detail (Hinge-style). Only this function + its styles changed. ───
function CardFace({ card }: { card: DeckCard }) {
  const { colors, type } = useTheme();
  const shared = card.shared ?? [];
  // Multiple shared classes squeeze the body, so give the bio less room
  // rather than letting the class list get clipped — the overlap is the
  // reason this person is on screen at all.
  const bioLines = shared.length > 2 ? 1 : 2;

  const initials = (card.full_name ?? '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={styles.face}>
      <View style={[styles.facePhoto, { backgroundColor: colors.accentSoft }]}>
        {card.photo_url ? (
          <Image
            source={{ uri: card.photo_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.initialsWrap]}>
            <Text style={{ fontSize: 64, fontFamily: fontFamily.bold, color: colors.primary }}>
              {initials}
            </Text>
          </View>
        )}
        {/* legibility scrim so name/major sit on the photo like Hinge's cards */}
        <LinearGradient colors={colors.scrim} style={styles.scrim} pointerEvents="none" />
        <View style={styles.photoOverlay}>
          <Text style={[type.display, { color: colors.white }]} numberOfLines={1}>
            {card.full_name}
          </Text>
          {schoolYearLabel(card.school, card.grad_year) ? (
            <Text
              style={[type.accent, { color: colors.white, opacity: 0.95 }]}
              numberOfLines={1}>
              {schoolYearLabel(card.school, card.grad_year)}
            </Text>
          ) : null}
          <Text style={[type.body, { color: colors.white, opacity: 0.92 }]} numberOfLines={1}>
            {[card.major, card.hometown].filter(Boolean).join(' · ') || 'Columbia student'}
          </Text>
        </View>
      </View>

      <View style={styles.faceBody}>
        {/* the shared classes are the hero detail — italic serif, one per line,
            every one listed rather than collapsed into a "+N" */}
        <View style={styles.sharedList}>
          {shared.map((s, i) => (
            <View key={`${s.code}-${s.section}`} style={styles.sharedRow}>
              {i === 0 ? (
                <Ionicons name="school-outline" size={16} color={colors.primary} />
              ) : (
                // keeps continuation lines aligned under the first
                <View style={styles.sharedRowSpacer} />
              )}
              <Text style={[type.accent, { color: colors.primary, flex: 1 }]} numberOfLines={1}>
                {s.title} · {s.code} §{s.section}
              </Text>
            </View>
          ))}
        </View>
        {card.bio ? (
          <Text style={type.sub} numberOfLines={bioLines}>
            {card.bio}
          </Text>
        ) : null}
        {card.study_spot ? (
          <View style={styles.sharedRow}>
            <Ionicons name="location-outline" size={16} color={colors.primary} />
            <Text style={[type.sub, { flex: 1 }]} numberOfLines={1}>
              Studies at {card.study_spot}
            </Text>
          </View>
        ) : null}
        <Text style={[type.tiny, { marginTop: 'auto' }]}>Tap for full profile</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: space.lg },
  card: {
    position: 'absolute',
    top: space.lg,
    left: space.lg,
    right: space.lg,
    bottom: 110,
    borderRadius: radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  cardBehind: { transform: [{ scale: 0.96 }, { translateY: 10 }] },
  face: { flex: 1, borderRadius: radius.lg, overflow: 'hidden' },
  // photo now fills ~65% of the card — the headline element, not a chip up top
  facePhoto: { flex: 1.9, position: 'relative' },
  // sit the initials in the clear upper area, not behind the scrim
  initialsWrap: { alignItems: 'center', justifyContent: 'center', paddingBottom: '22%' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },
  photoOverlay: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.md, gap: 2 },
  faceBody: { flex: 1, padding: space.lg, gap: space.sm },
  sharedList: { gap: 2 },
  sharedRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  sharedRowSpacer: { width: 16 },
  stamp: {
    position: 'absolute',
    top: 28,
    borderWidth: 3,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 2,
    transform: [{ rotate: '-12deg' }],
  },
  like: { left: 20 },
  nope: { right: 20, transform: [{ rotate: '12deg' }] },
  stampText: { fontSize: 24, fontFamily: fontFamily.bold },
  actions: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.xl,
  },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
