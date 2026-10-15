import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Keyboard,
  BackHandler,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Circle,
  Eye,
  EyeOff,
  Mail,
  MailX,
  RotateCw,
  UserRound,
} from 'lucide-react-native';
import type { RootStackParamList } from '../../../App';
import {
  Colors,
  FontSizes,
  FontWeights,
  Spacing,
  BorderRadius,
  Gradients,
  TOUCH_TARGET,
  moderateScale,
  scaledFontSize,
  MAX_CONTENT_WIDTH,
} from '../../config/theme';
import {
  riderPasswordReset,
  isResetFailure,
  type FoundAccount,
  type ResetFailure,
} from '../../services/passwordReset';
import { checkPassword, isSearchableIdentifier } from '../../services/passwordRules';

/**
 * "Forgot password" for riders, from finding the account to a new password.
 *
 *   FIND -> CONFIRM -> CODE -> NEW_PASSWORD -> back to Login
 *
 * The server holds every rule (staffPasswordResetService, RIDER audience); this
 * screen holds only the drafts, so stepping back keeps what was typed. The
 * tokens live in state and die with the screen.
 */

type Step = 'FIND' | 'CONFIRM' | 'CODE' | 'NEW_PASSWORD';

const BUTTON_TEXT_MAX_SCALE = 1.2;

function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.ceil(msRemaining / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export const ForgotPasswordScreen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList, 'ForgotPassword'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ForgotPassword'>>();
  const insets = useSafeAreaInsets();
  const busyRef = useRef(false);

  const [step, setStep] = useState<Step>('FIND');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [identifier, setIdentifier] = useState(route.params?.prefill ?? '');
  const [account, setAccount] = useState<FoundAccount | null>(null);

  const [code, setCode] = useState('');
  const [codeExpiresAt, setCodeExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // One 1 s tick, only while a countdown is on screen.
  useEffect(() => {
    if (step !== 'CODE') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

  const goTo = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const leave = useCallback(() => {
    Keyboard.dismiss();
    navigation.goBack();
  }, [navigation]);

  // Back walks the steps before it leaves the screen. From the new-password
  // step it leaves: the code is spent, so there is nothing to go back to.
  const stepBack = useCallback(() => {
    if (busyRef.current) return true;
    if (step === 'CONFIRM') goTo('FIND');
    else if (step === 'CODE') goTo('CONFIRM');
    else leave();
    return true;
  }, [step, leave]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', stepBack);
      return () => sub.remove();
    }, [stepBack])
  );

  /** Runs one request with the busy flag held, so a double tap sends once. */
  const run = async <T,>(work: () => Promise<T>): Promise<T | null> => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      return await work();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const fail = (failure: ResetFailure) => setError(failure.error);

  // ── Step 1 ──────────────────────────────────────────────────────────────
  const handleFind = async () => {
    if (!isSearchableIdentifier(identifier)) {
      setError('Enter the email address or mobile number on your rider account.');
      return;
    }
    Keyboard.dismiss();
    const result = await run(() => riderPasswordReset.findAccount(identifier.trim()));
    if (!result) return;
    if (isResetFailure(result)) {
      fail(result);
      return;
    }
    setAccount(result);
    goTo('CONFIRM');
  };

  // ── Step 2 ──────────────────────────────────────────────────────────────
  const sendCode = async (): Promise<boolean> => {
    if (!account) return false;
    const result = await run(() => riderPasswordReset.sendEmailCode(account.resetSessionToken));
    if (!result) return false;
    if (!isResetFailure(result)) {
      setSentTo(result.maskedEmail);
      setCodeExpiresAt(Date.now() + result.expiresInSeconds * 1000);
      setResendAt(Date.now() + result.resendAfterSeconds * 1000);
      setNow(Date.now());
      setCode('');
      return true;
    }
    if (result.status === 429 && result.retryAfterSeconds) {
      // A code went out moments ago and is still the live one: use it.
      setResendAt(Date.now() + result.retryAfterSeconds * 1000);
      if (!codeExpiresAt) setCodeExpiresAt(Date.now() + 15 * 60 * 1000);
      setNow(Date.now());
      return true;
    }
    fail(result);
    return false;
  };

  const handleSendCode = async () => {
    if (await sendCode()) goTo('CODE');
  };

  // ── Step 3 ──────────────────────────────────────────────────────────────
  const verifyCode = async (value: string) => {
    if (!account || value.length !== 6) return;
    Keyboard.dismiss();
    const result = await run(() => riderPasswordReset.verifyEmailCode(account.resetSessionToken, value));
    if (!result) return;
    if (isResetFailure(result)) {
      setCode('');
      fail(result);
      return;
    }
    setResetToken(result.resetToken);
    goTo('NEW_PASSWORD');
  };

  // ── Step 4 ──────────────────────────────────────────────────────────────
  const check = checkPassword(newPassword);
  const passwordsMatch = confirmPassword.length > 0 && confirmPassword === newPassword;
  const canSave = check.acceptable && passwordsMatch && !busy;

  const handleSave = async () => {
    if (!resetToken || !canSave) return;
    Keyboard.dismiss();
    const result = await run(() => riderPasswordReset.complete(resetToken, newPassword));
    if (!result) return;
    if (isResetFailure(result)) {
      fail(result);
      return;
    }
    const email = identifier.trim().includes('@') ? identifier.trim() : undefined;
    navigation.navigate('Login', { passwordReset: true, email });
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const headings: Record<Step, { title: string; body: React.ReactNode }> = {
    FIND: {
      title: 'Find your account',
      body: 'Enter the email address or mobile number on your rider account.',
    },
    CONFIRM: {
      title: 'Is this your account?',
      body: account?.maskedEmail
        ? 'We will email a 6-digit code to the address on this account.'
        : 'We need a verified email address to send a code to.',
    },
    CODE: {
      title: 'Check your email',
      body: (
        <>
          We sent a 6-digit code to <Text style={styles.emphasis}>{sentTo || account?.maskedEmail}</Text>.
        </>
      ),
    },
    NEW_PASSWORD: {
      title: 'Create a new password',
      body: 'You will be signed out on any other phone using this account.',
    },
  };

  const codeExpired = codeExpiresAt > 0 && now >= codeExpiresAt;
  const resendIn = Math.max(0, resendAt - now);
  const canResend = !busy && resendIn === 0;

  const primaryButton = (label: string, busyLabel: string, onPress: () => void, disabled: boolean, testID: string) => (
    <TouchableOpacity
      style={[styles.primaryButton, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={busy ? busyLabel : label}
      accessibilityState={{ disabled, busy }}
      testID={testID}
    >
      <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryButtonFill}>
        {busy ? (
          <View style={styles.row}>
            <ActivityIndicator color={Colors.textWhite} size="small" />
            <Text style={styles.primaryButtonText} maxFontSizeMultiplier={BUTTON_TEXT_MAX_SCALE}>
              {busyLabel}
            </Text>
          </View>
        ) : (
          <Text style={styles.primaryButtonText} maxFontSizeMultiplier={BUTTON_TEXT_MAX_SCALE}>
            {label}
          </Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );

  const linkButton = (label: string, onPress: () => void, testID?: string) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      style={styles.linkButton}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Text style={[styles.linkText, busy && styles.linkTextDisabled]} maxFontSizeMultiplier={BUTTON_TEXT_MAX_SCALE}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const passwordField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    shown: boolean,
    toggle: () => void,
    testID: string,
    autoFocus = false
  ) => (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.textInput}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password-new"
          textContentType="newPassword"
          autoFocus={autoFocus}
          editable={!busy}
          accessibilityLabel={label}
          testID={testID}
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={toggle}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {shown ? <EyeOff size={19} color={Colors.primary} strokeWidth={2.2} /> : <Eye size={19} color={Colors.textGray} strokeWidth={2.2} />}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgWhite} />

      <View style={[styles.header, { paddingTop: insets.top + Spacing.xs }]}>
        <TouchableOpacity
          onPress={stepBack}
          style={styles.backButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={step === 'FIND' || step === 'NEW_PASSWORD' ? 'Back to sign in' : 'Back'}
          testID="forgot-back"
        >
          <ArrowLeft size={22} color={Colors.textDark} strokeWidth={2.3} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Reset password
        </Text>
      </View>

      {/* keyboard-controller's view: React Native's own cannot see the keyboard
          under edge-to-edge (see LoginScreen). This screen's root starts at the
          top of the screen, which is what lets it measure correctly. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title} accessibilityRole="header">
            {headings[step].title}
          </Text>
          <Text style={styles.body}>{headings[step].body}</Text>

          {error ? (
            <View style={styles.errorBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <AlertCircle size={18} color={Colors.danger} strokeWidth={2.2} />
              <Text style={styles.errorText} testID="forgot-error">
                {error}
              </Text>
            </View>
          ) : null}

          {step === 'FIND' && (
            <>
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>EMAIL OR MOBILE NUMBER</Text>
                <View style={styles.inputWrapper}>
                  <Mail size={18} color={Colors.textGray} strokeWidth={2.2} style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={identifier}
                    onChangeText={(v) => {
                      setIdentifier(v);
                      if (error) setError(null);
                    }}
                    placeholder="name@example.com or 0917 123 4567"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    editable={!busy}
                    returnKeyType="search"
                    onSubmitEditing={handleFind}
                    accessibilityLabel="Email or mobile number"
                    testID="forgot-identifier"
                  />
                </View>
              </View>
              {primaryButton('Find my account', 'Searching...', handleFind, busy, 'forgot-find')}
              {linkButton('Back to sign in', leave)}
            </>
          )}

          {step === 'CONFIRM' && account && (
            <>
              <View style={styles.accountRow}>
                <View style={styles.accountIcon}>
                  <UserRound size={22} color={Colors.textMedium} strokeWidth={2.2} />
                </View>
                <View style={styles.flexShrink}>
                  <Text style={styles.accountName} testID="forgot-name">
                    {account.fullName}
                  </Text>
                  <Text style={styles.accountMeta}>Sugo rider account</Text>
                </View>
              </View>

              {account.maskedEmail ? (
                <>
                  <View style={styles.sendToRow}>
                    <Mail size={18} color={Colors.textMedium} strokeWidth={2.2} />
                    <Text style={styles.sendToText}>
                      Code goes to <Text style={styles.emphasis}>{account.maskedEmail}</Text>
                    </Text>
                  </View>
                  {primaryButton('Send code', 'Sending...', handleSendCode, busy, 'forgot-send')}
                </>
              ) : (
                <View style={styles.emptyPanel} testID="forgot-no-email">
                  <MailX size={20} color={Colors.textMedium} strokeWidth={2.2} />
                  <Text style={styles.emptyText}>
                    This account has no verified email address, so we cannot send a code. Ask the owner to reset
                    your password from the web portal.
                  </Text>
                </View>
              )}

              {linkButton('Not you? Search again', () => goTo('FIND'), 'forgot-search-again')}
            </>
          )}

          {step === 'CODE' && (
            <>
              <TextInput
                style={styles.codeInput}
                value={code}
                onChangeText={(text) => {
                  const digits = text.replace(/\D/g, '').slice(0, 6);
                  setCode(digits);
                  if (error) setError(null);
                  if (digits.length === 6) void verifyCode(digits);
                }}
                placeholder="000000"
                placeholderTextColor={Colors.textLight}
                keyboardType="number-pad"
                maxLength={6}
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
                editable={!busy && !codeExpired}
                accessibilityLabel="6-digit code from the email"
                testID="forgot-code"
              />
              <Text style={styles.countdown}>
                {codeExpired ? 'This code expired. Send a new one.' : `The code expires in ${formatCountdown(codeExpiresAt - now)}`}
              </Text>

              {primaryButton('Verify code', 'Checking...', () => verifyCode(code), busy || code.length !== 6 || codeExpired, 'forgot-verify')}

              <TouchableOpacity
                onPress={() => void sendCode()}
                disabled={!canResend}
                style={styles.linkButton}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={resendIn > 0 ? `Resend available in ${formatCountdown(resendIn)}` : 'Send the code again'}
                accessibilityState={{ disabled: !canResend }}
                testID="forgot-resend"
              >
                <View style={styles.row}>
                  <RotateCw size={15} color={resendIn > 0 ? Colors.textGray : Colors.primary} strokeWidth={2.3} />
                  <Text
                    style={[styles.resendText, resendIn > 0 && styles.linkTextDisabled]}
                    maxFontSizeMultiplier={BUTTON_TEXT_MAX_SCALE}
                  >
                    {resendIn > 0 ? `Resend in ${formatCountdown(resendIn)}` : 'Resend code'}
                  </Text>
                </View>
              </TouchableOpacity>
              {linkButton('Use a different account', () => goTo('FIND'))}
            </>
          )}

          {step === 'NEW_PASSWORD' && (
            <>
              {passwordField('New password', newPassword, (v) => {
                setNewPassword(v);
                if (error) setError(null);
              }, showNew, () => setShowNew((v) => !v), 'forgot-new-password', true)}

              <View style={styles.rules} testID="forgot-rules">
                {check.rules.map((rule) => (
                  <View
                    key={rule.id}
                    style={styles.ruleRow}
                    accessible
                    accessibilityLabel={`${rule.label}, ${rule.met ? 'done' : 'not yet'}`}
                  >
                    {rule.met ? (
                      <Check size={15} color={Colors.success} strokeWidth={3} />
                    ) : (
                      <Circle size={15} color={Colors.textGray} strokeWidth={2} />
                    )}
                    <Text style={[styles.ruleText, rule.met && styles.ruleTextMet]}>{rule.label}</Text>
                  </View>
                ))}
                {check.hasSpace ? (
                  <View style={styles.ruleRow}>
                    <AlertCircle size={15} color={Colors.danger} strokeWidth={2.2} />
                    <Text style={[styles.ruleText, styles.ruleTextBad]}>Remove the spaces. Passwords cannot contain spaces.</Text>
                  </View>
                ) : null}
              </View>

              {passwordField('Confirm new password', confirmPassword, setConfirmPassword, showConfirm, () => setShowConfirm((v) => !v), 'forgot-confirm-password')}
              {confirmPassword.length > 0 ? (
                <Text style={[styles.matchText, passwordsMatch ? styles.ruleTextMet : styles.ruleTextBad]} accessibilityLiveRegion="polite">
                  {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                </Text>
              ) : null}

              {primaryButton('Save new password', 'Saving...', handleSave, !canSave, 'forgot-save')}
              {linkButton('Cancel and back to sign in', leave)}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default ForgotPasswordScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bgWhite },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  backButton: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: scaledFontSize(FontSizes.md, 0.2),
    fontWeight: FontWeights.bold,
    color: Colors.textDark,
    marginLeft: Spacing.xs,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: scaledFontSize(FontSizes.xl, 0.2),
    fontWeight: FontWeights.black,
    color: Colors.textDark,
  },
  body: {
    fontSize: scaledFontSize(FontSizes.base, 0.2),
    color: Colors.textMedium,
    lineHeight: scaledFontSize(FontSizes.base, 0.2) * 1.45,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  emphasis: { fontWeight: FontWeights.extrabold, color: Colors.textDark },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.dangerBg,
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    flex: 1,
    color: Colors.danger,
    fontSize: scaledFontSize(FontSizes.sm, 0.2),
    fontWeight: FontWeights.semibold,
  },
  fieldBlock: { width: '100%', marginBottom: Spacing.md },
  fieldLabel: {
    fontSize: scaledFontSize(FontSizes.xs, 0.2),
    fontWeight: FontWeights.extrabold,
    color: Colors.textMedium,
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgWhite,
    borderWidth: 1.2,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    minHeight: moderateScale(50, 0.2),
  },
  inputIcon: { marginRight: Spacing.md },
  textInput: {
    flex: 1,
    color: Colors.textDark,
    fontSize: scaledFontSize(FontSizes.base, 0.2),
    fontWeight: FontWeights.medium,
    paddingVertical: Spacing.sm,
  },
  eyeButton: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  buttonDisabled: { opacity: 0.55 },
  primaryButtonFill: {
    minHeight: moderateScale(52, 0.2),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  primaryButtonText: {
    flexShrink: 1,
    textAlign: 'center',
    color: Colors.textWhite,
    fontWeight: FontWeights.black,
    fontSize: scaledFontSize(FontSizes.md, 0.2),
    letterSpacing: 0.4,
  },
  linkButton: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  linkText: {
    color: Colors.textMedium,
    fontSize: scaledFontSize(FontSizes.sm, 0.2),
    fontWeight: FontWeights.bold,
  },
  linkTextDisabled: { color: Colors.textGray },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  accountIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountName: {
    fontSize: scaledFontSize(FontSizes.md, 0.2),
    fontWeight: FontWeights.extrabold,
    color: Colors.textDark,
  },
  accountMeta: {
    fontSize: scaledFontSize(FontSizes.sm, 0.2),
    color: Colors.textGray,
    marginTop: Spacing.xxs,
  },
  sendToRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sendToText: {
    flexShrink: 1,
    fontSize: scaledFontSize(FontSizes.base, 0.2),
    color: Colors.textMedium,
  },
  emptyPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.bgLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  emptyText: {
    flex: 1,
    fontSize: scaledFontSize(FontSizes.sm, 0.2),
    color: Colors.textMedium,
    lineHeight: scaledFontSize(FontSizes.sm, 0.2) * 1.45,
  },
  codeInput: {
    width: '100%',
    backgroundColor: Colors.bgLight,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    textAlign: 'center',
    fontSize: scaledFontSize(26, 0.2),
    fontWeight: FontWeights.black,
    letterSpacing: 12,
    color: Colors.textDark,
  },
  countdown: {
    textAlign: 'center',
    marginTop: Spacing.sm,
    fontSize: scaledFontSize(FontSizes.sm, 0.2),
    color: Colors.textGray,
    fontVariant: ['tabular-nums'],
  },
  resendText: {
    color: Colors.primary,
    fontSize: scaledFontSize(FontSizes.sm, 0.2),
    fontWeight: FontWeights.bold,
    fontVariant: ['tabular-nums'],
  },
  rules: {
    gap: Spacing.xs + 2,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ruleText: {
    flexShrink: 1,
    fontSize: scaledFontSize(FontSizes.sm, 0.2),
    color: Colors.textGray,
  },
  ruleTextMet: { color: Colors.success, fontWeight: FontWeights.semibold },
  ruleTextBad: { color: Colors.danger, fontWeight: FontWeights.semibold },
  matchText: {
    fontSize: scaledFontSize(FontSizes.sm, 0.2),
    marginTop: -Spacing.xs,
  },
});
