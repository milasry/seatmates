// Shared primitives. Additive only (PLAN §7 rule 3).
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { fontFamily, radius, space, useTheme } from '../lib/theme';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
}) {
  const { colors } = useTheme();
  const bg =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? colors.onFill : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.primary },
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.btnText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  const { colors, type, space: sp } = useTheme();
  return (
    <View style={{ gap: sp.xs }}>
      {label ? <Text style={type.sub}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.subtle}
        style={[
          styles.field,
          { borderColor: colors.border, color: colors.text, backgroundColor: colors.card },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}

export function Avatar({
  uri,
  name,
  size = 44,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
}) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const initials = (name ?? '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  if (!uri || failed) {
    return (
      <View
        style={[
          styles.avatarFallback,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accentSoft },
        ]}>
        <Text
          style={{ color: colors.primary, fontFamily: fontFamily.semibold, fontSize: size * 0.38 }}>
          {initials}
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
}

/** Empty states speak the same Ionicons language as the rest of the app; an
 *  emoji here reads as a different design system on an otherwise typeset screen. */
export function Empty({
  icon,
  title,
  body,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.empty}>
      {icon ? (
        <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name={icon} size={26} color={colors.primary} />
        </View>
      ) : null}
      <Text style={[type.h2, { textAlign: 'center' }]}>{title}</Text>
      {body ? (
        <Text style={[type.sub, { textAlign: 'center', maxWidth: 300 }]}>{body}</Text>
      ) : null}
    </View>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, { backgroundColor: colors.bg }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function Badge({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
      <Text style={{ color: colors.primary, fontSize: 12, fontFamily: fontFamily.semibold }}>
        {text}
      </Text>
    </View>
  );
}

// Structural-only styles — no color here, so they don't need the theme.
const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSmall: { paddingVertical: 8, paddingHorizontal: space.md },
  btnText: { fontSize: 16, fontFamily: fontFamily.semibold },
  field: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: fontFamily.ui,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.lg },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  badge: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
});
