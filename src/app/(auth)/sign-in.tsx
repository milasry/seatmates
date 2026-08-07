import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Field } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { fontFamily, space, useTheme } from '../../lib/theme';

// Flow (team decision): the emailed code is for account VERIFICATION only.
// create:  email -> code -> set a password -> in.
// signin:  email + password (code fallback for pre-password accounts).
// Creating with an already-used email redirects to sign-in.
type Stage = 'choice' | 'create-email' | 'code' | 'set-password' | 'signin' | 'signin-code';

export default function SignIn() {
  const { colors, type } = useTheme();
  const [stage, setStage] = useState<Stage>('choice');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const go = (s: Stage, msg?: string) => {
    setStage(s);
    setError(null);
    setNotice(msg ?? null);
  };

  const cleanEmail = () => email.trim().toLowerCase();

  const validEmail = () => {
    if (!/@columbia\.edu$/.test(cleanEmail())) {
      setError('Seatmates is Columbia only. Use your @columbia.edu address.');
      return false;
    }
    return true;
  };

  /** Create path: reject used emails first, then send the verification code. */
  const startCreate = async () => {
    if (!validEmail()) return;
    setBusy(true);
    setError(null);
    const { data: exists } = await supabase.rpc('email_exists', { p_email: cleanEmail() });
    if (exists) {
      setBusy(false);
      go('signin', 'That email already has an account. Sign in below.');
      return;
    }
    const { error: err } = await supabase.auth.signInWithOtp({
      email: cleanEmail(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (err) setError(err.message);
    else go('code');
  };

  /** Code fallback for accounts that never set a password. */
  const sendSigninCode = async () => {
    if (!validEmail()) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: cleanEmail(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (err) {
      setError(
        /signup|not allowed|not found/i.test(err.message)
          ? 'No account with that email yet. Create one instead.'
          : err.message,
      );
    } else {
      go('signin-code');
    }
  };

  const verifyCode = async (next: Stage) => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      email: cleanEmail(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (next === 'set-password') go('set-password', 'Email verified. One step left.');
    else router.replace('/');
  };

  const savePassword = async () => {
    if (password.length < 8) {
      setError('Passwords need at least 8 characters.');
      return;
    }
    if (password !== password2) {
      setError('Those two passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(err.message);
    else router.replace('/');
  };

  const signInWithPassword = async () => {
    if (!validEmail()) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: cleanEmail(),
      password,
    });
    setBusy(false);
    if (err) {
      setError(
        /invalid/i.test(err.message)
          ? 'That email and password don’t match. Forgot it? Use “email me a code” below.'
          : err.message,
      );
    } else {
      router.replace('/');
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <Text style={[styles.logo, { color: colors.primary }]}>seatmates</Text>
        {/* the serif accent as the app's voice on first contact */}
        <Text style={[type.accent, { color: colors.subtle }]}>
          Make friends with the people already in the room.
        </Text>

        {notice ? <Text style={[type.sub, { color: colors.success }]}>{notice}</Text> : null}

        {stage === 'choice' && (
          <>
            <Button title="Create account" onPress={() => go('create-email')} />
            <Button title="Sign in" variant="outline" onPress={() => go('signin')} />
            <Text style={[type.fine, { textAlign: 'center' }]}>
              Columbia students only. You’ll verify with your @columbia.edu address.
            </Text>
          </>
        )}

        {stage === 'create-email' && (
          <>
            <Field
              label="Your Columbia email"
              placeholder="you@columbia.edu"
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={startCreate}
              autoFocus
            />
            <Button title="Send verification code" onPress={startCreate} loading={busy} />
            <Button title="Back" variant="ghost" onPress={() => go('choice')} />
          </>
        )}

        {stage === 'code' && (
          <>
            <Field
              label={`We sent a 6-digit code to ${email.trim()}`}
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              onSubmitEditing={() => verifyCode('set-password')}
              autoFocus
            />
            <Button
              title="Verify"
              onPress={() => verifyCode('set-password')}
              loading={busy}
              disabled={code.length < 6}
            />
            <Button title="Use a different email" variant="ghost" onPress={() => go('create-email')} />
          </>
        )}

        {stage === 'set-password' && (
          <>
            <Field
              label="Create a password"
              placeholder="At least 8 characters"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoFocus
            />
            <Field
              label="Confirm password"
              placeholder="Type it once more"
              secureTextEntry
              value={password2}
              onChangeText={setPassword2}
              onSubmitEditing={savePassword}
            />
            <Button title="Save and continue" onPress={savePassword} loading={busy} />
          </>
        )}

        {stage === 'signin' && (
          <>
            <Field
              label="Columbia email"
              placeholder="you@columbia.edu"
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChangeText={setEmail}
            />
            <Field
              label="Password"
              placeholder="Your password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={signInWithPassword}
            />
            <Button title="Sign in" onPress={signInWithPassword} loading={busy} />
            <Pressable onPress={sendSigninCode}>
              <Text style={[type.sub, { color: colors.primary, textAlign: 'center' }]}>
                Forgot your password? Email me a code
              </Text>
            </Pressable>
            <Button title="Back" variant="ghost" onPress={() => go('choice')} />
          </>
        )}

        {stage === 'signin-code' && (
          <>
            <Field
              label={`We sent a 6-digit code to ${email.trim()}`}
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              onSubmitEditing={() => verifyCode('choice')}
              autoFocus
            />
            <Button
              title="Verify"
              onPress={() => verifyCode('choice')}
              loading={busy}
              disabled={code.length < 6}
            />
            <Text style={type.tiny}>
              You can set a password later in Account, under Change password.
            </Text>
            <Button title="Back" variant="ghost" onPress={() => go('signin')} />
          </>
        )}

        {error ? <Text style={[type.sub, { color: colors.danger }]}>{error}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center' },
  inner: { padding: space.xl, gap: space.md, maxWidth: 480, width: '100%', alignSelf: 'center' },
  logo: { fontSize: 44, fontFamily: fontFamily.bold, letterSpacing: -1 },
});
