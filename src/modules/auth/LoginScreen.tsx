import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  useWindowDimensions,
  Animated,
  StatusBar,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  ShieldAlert,
  AlertCircle,
  Bike,
  ArrowRight,
  MailCheck,
  CircleCheck,
} from 'lucide-react-native';
import type { RootStackParamList } from '../../../App';
import { useRiderAuth } from '../../context/RiderAuthContext';
import { TacticalGridBackground } from '../../components/TacticalGridBackground';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, Gradients, useResponsive, moderateScale, scaledFontSize, MAX_CONTENT_WIDTH } from '../../config/theme';

export const LoginScreen = () => {
  const { login, pendingChallenge, verifyLoginOtp, resendLoginOtp, cancelChallenge } = useRiderAuth();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList, 'Login'>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Login'>>();
  const { height: screenHeight, isCompact, isTablet } = useResponsive();
  const scrollViewRef = useRef<ScrollView>(null);
  const isSubmittingRef = useRef(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Field Focus States for Glowing Crimson Borders
  const [userFocused, setUserFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  // Error States
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Shown on return from a finished password reset (ForgotPasswordScreen).
  const [resetNotice, setResetNotice] = useState(false);

  useEffect(() => {
    if (!route.params?.passwordReset) return;
    setResetNotice(true);
    setApiError(null);
    setPassword('');
    if (route.params.email) setUsername(route.params.email);
    // Consumed once, so returning to this screen later does not replay it.
    navigation.setParams({ passwordReset: undefined, email: undefined });
  }, [route.params?.passwordReset, route.params?.email, navigation]);

  const openForgotPassword = () => {
    Keyboard.dismiss();
    setApiError(null);
    const typed = username.trim();
    // The reset looks accounts up by email or mobile number, not username.
    const prefill = typed.includes('@') || typed.replace(/\D/g, '').length >= 10 ? typed : undefined;
    navigation.navigate('ForgotPassword', { prefill });
  };

  // Access Restriction Modal for Non-Rider Accounts
  const [showRestrictedModal, setShowRestrictedModal] = useState(false);
  const [restrictedMessage, setRestrictedMessage] = useState<string | null>(null);

  // First-login email verification (see PendingChallenge in RiderAuthContext)
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // Micro-interaction Shake Animations
  const shakeUsername = useRef(new Animated.Value(0)).current;
  const shakePassword = useRef(new Animated.Value(0)).current;

  const isSmallScreen = screenHeight < 680;

  const triggerShake = (animValue: Animated.Value) => {
    animValue.setValue(0);
    Animated.sequence([
      Animated.timing(animValue, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(animValue, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(animValue, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(animValue, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(animValue, { toValue: -4, duration: 50, useNativeDriver: true }),
      Animated.timing(animValue, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    if (isSubmittingRef.current) return;

    let hasError = false;
    setUsernameError(null);
    setPasswordError(null);
    setApiError(null);

    if (!username.trim()) {
      setUsernameError('Username required!');
      triggerShake(shakeUsername);
      hasError = true;
    }

    if (!password.trim()) {
      setPasswordError('Password required!');
      triggerShake(shakePassword);
      hasError = true;
    }

    if (hasError) return;

    Keyboard.dismiss();
    isSubmittingRef.current = true;
    setIsLoading(true);
    setResetNotice(false);
    try {
      await login(username.trim(), password.trim());
    } catch (err: any) {
      let msg = err?.message || 'Invalid username or password';
      // Defensive: strip raw transport exceptions from user view
      if (
        msg.includes('fetch failed') ||
        msg.includes('canceled') ||
        msg.includes('cancelled') ||
        msg.includes('Network request failed')
      ) {
        msg = 'Connection timed out or was interrupted. Please check your signal and try again.';
      }
      if (
        msg.includes('Access denied') ||
        msg.includes('permitted') ||
        msg.includes('restricted') ||
        msg.includes('Only Rider')
      ) {
        setRestrictedMessage(
          'Notice for Owner & Dispatcher Accounts:\n\nThis mobile application is strictly reserved for active Rider accounts. Please access the Web Management Portal for Owner and Dispatcher fleet operations.'
        );
        setShowRestrictedModal(true);
      } else {
        setApiError(msg);
        triggerShake(shakeUsername);
        triggerShake(shakePassword);
      }
    } finally {
      isSubmittingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (isSubmittingRef.current) return;
    const code = otpCode.trim();
    if (code.length !== 6) {
      setOtpError('Enter the 6-digit code from your email.');
      return;
    }

    Keyboard.dismiss();
    isSubmittingRef.current = true;
    setOtpError(null);
    setIsVerifying(true);
    try {
      await verifyLoginOtp(code);
    } catch (err: any) {
      setOtpError(err?.message || 'Incorrect verification code.');
      setOtpCode('');
    } finally {
      isSubmittingRef.current = false;
      setIsVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setOtpError(null);
    setIsResending(true);
    try {
      await resendLoginOtp();
      setOtpCode('');
    } catch (err: any) {
      setOtpError(err?.message || 'Could not send a new code.');
    } finally {
      isSubmittingRef.current = false;
      setIsResending(false);
    }
  };

  const handleCancelChallenge = () => {
    setOtpCode('');
    setOtpError(null);
    setPassword('');
    cancelChallenge();
  };

  return (
    <View style={styles.rootContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bgWhite} />

      {/* Clean White Tactical Vector Grid Background */}
      <TacticalGridBackground />

      {/* keyboard-controller's view, which reads the keyboard's real height.
          React Native's own, with 'height' on Android, waited for a window
          resize that edge-to-edge never sends, so the fields stayed under the
          keyboard. Padding shrinks the scroll area to the space above it and
          the onFocus scrollTo calls below do the rest. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContainer,
            {
              paddingVertical: isSmallScreen ? Spacing.lg : Spacing.xxl,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* TOP BRAND HERO SECTION */}
          <View style={[styles.heroHeader, { marginBottom: isSmallScreen ? Spacing.xl : Spacing.xxxl }]}>
            {/* Illuminated Primary Track Icon Badge (from Customer App) */}
            <View style={styles.logoOuterGlow}>
              <LinearGradient
                colors={Gradients.brand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.logoBadge,
                  {
                    width: isSmallScreen ? 68 : 80,
                    height: isSmallScreen ? 68 : 80,
                    borderRadius: isSmallScreen ? 34 : 40,
                  },
                ]}
              >
                <Bike
                  size={isSmallScreen ? 34 : 42}
                  color={Colors.textWhite}strokeWidth={2.3}
                />
              </LinearGradient>
            </View>

            {/* Brand Pill */}
            <View style={styles.brandPill}>
              <Bike size={14} color={Colors.primary}strokeWidth={2.4} />
              <Text style={styles.brandPillText}>SUGO EXPRESS</Text>
            </View>

            {/* Portal Title & Subtitle */}
            <Text style={[styles.portalTitle, isSmallScreen && { fontSize: FontSizes.xl }]}>
              Rider Portal
            </Text>
            <Text style={styles.portalSubtitle}>
              Tacurong City Fleet Operations
            </Text>
          </View>

          {/* CLEAN SEAMLESS FORM CONTAINER (NO CARD) */}
          <View style={styles.formContainer}>
            {resetNotice ? (
              <View style={styles.successBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <CircleCheck size={18} color={Colors.success} strokeWidth={2.2} />
                <Text style={styles.successBannerText} testID="password-reset-notice">
                  Password changed. Sign in with your new password.
                </Text>
              </View>
            ) : null}

            {/* API / Auth Error Banner */}
            {apiError ? (
              <View style={styles.errorBanner}>
                <AlertCircle size={18} color={Colors.primary}strokeWidth={2.2} />
                <Text style={styles.errorBannerText}>{apiError}</Text>
              </View>
            ) : null}

            {/* USERNAME INPUT CONTAINER */}
            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>USERNAME</Text>
                {usernameError ? (
                  <View style={styles.inlineErrorBadge}>
                    <AlertCircle size={12} color={Colors.primary}strokeWidth={2.2} />
                    <Text style={styles.inlineErrorText}>{usernameError}</Text>
                  </View>
                ) : null}
              </View>

              <Animated.View style={{ transform: [{ translateX: shakeUsername }] }}>
                <View
                  style={[
                    styles.inputWrapper,
                    userFocused && styles.inputWrapperFocused,
                    usernameError ? styles.inputWrapperError : null,
                  ]}
                >
                  <View style={[styles.inputIconBox, userFocused && styles.inputIconBoxFocused]}>
                    <User
                      size={18}
                      color={usernameError || userFocused ? Colors.primary : Colors.textGray}
                      strokeWidth={2.2}
                    />
                  </View>
                  <TextInput
                    style={styles.textInput}
                    value={username}
                    onChangeText={(val) => {
                      setUsername(val);
                      if (usernameError) setUsernameError(null);
                      if (apiError) setApiError(null);
                    }}
                    onFocus={() => {
                      setUserFocused(true);
                      scrollViewRef.current?.scrollTo({ y: 70, animated: true });
                    }}
                    onBlur={() => setUserFocused(false)}
                    placeholder="Enter your username"
                    placeholderTextColor={Colors.textLight}
                    autoCapitalize="none"
                    autoCorrect={false}
                    testID="username-input"
                  />
                </View>
              </Animated.View>
            </View>

            {/* PASSWORD INPUT CONTAINER */}
            <View style={[styles.fieldBlock, { marginTop: Spacing.lg }]}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>PASSWORD</Text>
                {passwordError ? (
                  <View style={styles.inlineErrorBadge}>
                    <AlertCircle size={12} color={Colors.primary}strokeWidth={2.2} />
                    <Text style={styles.inlineErrorText}>{passwordError}</Text>
                  </View>
                ) : null}
              </View>

              <Animated.View style={{ transform: [{ translateX: shakePassword }] }}>
                <View
                  style={[
                    styles.inputWrapper,
                    passFocused && styles.inputWrapperFocused,
                    passwordError ? styles.inputWrapperError : null,
                  ]}
                >
                  <View style={[styles.inputIconBox, passFocused && styles.inputIconBoxFocused]}>
                    <Lock
                      size={18}
                      color={passwordError || passFocused ? Colors.primary : Colors.textGray}
                      strokeWidth={2.2}
                    />
                  </View>
                  <TextInput
                    style={styles.textInput}
                    value={password}
                    onChangeText={(val) => {
                      setPassword(val);
                      if (passwordError) setPasswordError(null);
                      if (apiError) setApiError(null);
                    }}
                    onFocus={() => {
                      setPassFocused(true);
                      scrollViewRef.current?.scrollTo({ y: 130, animated: true });
                    }}
                    onBlur={() => setPassFocused(false)}
                    placeholder="Enter your password"
                    placeholderTextColor={Colors.textLight}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    testID="password-input"
                  />
                  <TouchableOpacity
                    style={styles.eyeToggleButton}
                    onPress={() => setShowPassword((prev) => !prev)}
                    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff size={19} color={Colors.primary}strokeWidth={2.2} />
                    ) : (
                      <Eye size={19} color={Colors.textGray}strokeWidth={2.2} />
                    )}
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </View>

            <TouchableOpacity
              style={styles.forgotButton}
              onPress={openForgotPassword}
              disabled={isLoading}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
              testID="forgot-password-link"
            >
              <Text style={styles.forgotText} maxFontSizeMultiplier={1.2}>
                Forgot password?
              </Text>
            </TouchableOpacity>

            {/* HIGH-IMPACT ERGONOMIC SIGN IN BUTTON */}
            <TouchableOpacity
              style={[styles.loginButtonContainer, isLoading && styles.loginButtonDisabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: isLoading, busy: isLoading }}
              accessibilityLabel={isLoading ? 'Signing in' : 'Sign in'}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.88}
              testID="rider-login-submit"
            >
              <LinearGradient
                colors={Gradients.brand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginButtonGradient}
              >
                {isLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={Colors.textWhite}size="small" />
                    <Text style={styles.loginButtonText}>SIGNING IN...</Text>
                  </View>
                ) : (
                  <View style={styles.loginBtnContent}>
                    <Text style={styles.loginButtonText}>SIGN IN</Text>
                    <ArrowRight size={18} color={Colors.textWhite}strokeWidth={2.5} />
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ACCESS RESTRICTION MODAL (OWNER / DISPATCHER ACCOUNTS) */}
      <Modal
        visible={showRestrictedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRestrictedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconBadge}>
              <ShieldAlert size={36} color={Colors.primary}strokeWidth={2.2} />
            </View>

            <Text style={styles.modalTitle}>Access Restricted</Text>
            <Text style={styles.modalSubtitle}>Rider Portal Access Only</Text>

            <Text style={styles.modalBodyText}>
              {restrictedMessage}
            </Text>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowRestrictedModal(false)}
              accessibilityRole="button"
              accessibilityLabel="Close this message"
              activeOpacity={0.85}
            >
              <Text style={styles.modalCloseBtnText}>Acknowledge & Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FIRST-LOGIN EMAIL VERIFICATION (one-time, on a newly created account) */}
      <Modal
        visible={!!pendingChallenge}
        transparent
        animationType="fade"
        onRequestClose={handleCancelChallenge}
        // Full-screen from the very top, so the view below measures the
        // keyboard against the whole screen and lifts the code field exactly.
        statusBarTranslucent
      >
        {/* Was behavior={undefined} on Android: no avoidance at all, so the
            code field sat under the number pad. */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.otpIconBadge}>
                <MailCheck size={36} color={Colors.success}strokeWidth={2.2} />
              </View>

              {/* Only the seeded web admin can ever be in PROFILE_SETUP, and an
                  OWNER is turned away by the rider role check before a challenge
                  is issued — so this branch is a safety net, not a real flow. */}
              {pendingChallenge?.step === 'PROFILE_SETUP' ? (
                <>
                  <Text style={styles.modalTitle}>Setup Required</Text>
                  <Text style={styles.otpSubtitle}>Finish on the web portal</Text>
                  <Text style={styles.modalBodyText}>
                    This account still needs to be set up by an administrator on the Sugo Web
                    Management Portal before it can be used here.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.modalTitle}>Verify Your Email</Text>
                  <Text style={styles.otpSubtitle}>One-time account check</Text>
                  <Text style={styles.modalBodyText}>
                    We sent a 6-digit code to{' '}
                    <Text style={styles.otpEmail}>
                      {pendingChallenge?.maskedEmail || 'your registered email'}
                    </Text>
                    . Enter it below to finish signing in.
                  </Text>

                  <TextInput
                    style={styles.otpInput}
                    value={otpCode}
                    onChangeText={(text) => {
                      setOtpCode(text.replace(/\D/g, '').slice(0, 6));
                      if (otpError) setOtpError(null);
                    }}
                    placeholder="000000"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="number-pad"
                    maxLength={6}
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    autoFocus
                    editable={!isVerifying}
                  />

                  {otpError ? (
                    <View style={styles.otpErrorRow}>
                      <AlertCircle size={14} color={Colors.primary}/>
                      <Text style={styles.otpErrorText}>{otpError}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.otpVerifyBtn, isVerifying && styles.otpBtnDisabled]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isVerifying, busy: isVerifying }}
                    accessibilityLabel={isVerifying ? 'Verifying the code' : 'Verify the code'}
                    onPress={handleVerifyOtp}
                    disabled={isVerifying}
                    activeOpacity={0.85}
                  >
                    {isVerifying ? (
                      <ActivityIndicator color={Colors.textWhite}size="small" />
                    ) : (
                      <Text style={styles.modalCloseBtnText}>Verify & Sign In</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleResendOtp}
                    disabled={isResending || isVerifying}
                    activeOpacity={0.7}
                    style={styles.otpResendBtn}
                    accessibilityRole="button"
                    accessibilityLabel={isResending ? 'Sending a new code' : 'Send the code again'}
                  >
                    <Text style={styles.otpResendText}>
                      {isResending ? 'Sending...' : 'Resend code'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity onPress={handleCancelChallenge}
              accessibilityRole="button"
              accessibilityLabel="Use a different account" activeOpacity={0.7}>
                <Text style={styles.otpCancelText}>Use a different account</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: Colors.bgWhite,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  heroHeader: {
    alignItems: 'center',
  },
  logoOuterGlow: {
    padding: 3,
    borderRadius: 50,
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: Spacing.md,
  },
  logoBadge: {
    borderWidth: 2,
    borderColor: Colors.bgWhite,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dangerBg,
    borderWidth: 1,
    borderColor: Colors.primarySurface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.xs,
  },
  brandPillText: {
    color: Colors.primary,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.extrabold,
    letterSpacing: 1.5,
    marginLeft: Spacing.xs,
  },
  portalTitle: {
    fontSize: scaledFontSize(FontSizes.xxl, 0.20),
    fontWeight: FontWeights.black,
    color: Colors.textDark,
    letterSpacing: 0.3,
    marginTop: Spacing.xxs,
  },
  portalSubtitle: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textGray,
    fontWeight: FontWeights.medium,
    marginTop: Spacing.xxs,
    letterSpacing: 0.2,
  },
  formContainer: {
    width: '100%',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dangerBg,
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorBannerText: {
    color: Colors.danger,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold,
    marginLeft: Spacing.md,
    flex: 1,
  },
  fieldBlock: {
    width: '100%',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successBg,
    borderWidth: 1,
    borderColor: Colors.successBorder,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
  },
  successBannerText: {
    color: Colors.success,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold,
    marginLeft: Spacing.md,
    flex: 1,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    marginTop: Spacing.xs,
  },
  forgotText: {
    color: Colors.primary,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.bold,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: Spacing.xs + 2,
    marginBottom: Spacing.xs,
  },
  fieldLabel: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.extrabold,
    color: Colors.textMedium,
    letterSpacing: 0.8,
  },
  inlineErrorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dangerBg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  inlineErrorText: {
    flexShrink: 1,
    color: Colors.primary,
    fontSize: scaledFontSize(FontSizes.xxs, 0.20),
    fontWeight: FontWeights.bold,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgWhite,
    borderWidth: 1.2,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    minHeight: moderateScale(50, 0.20),
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  inputWrapperFocused: {
    borderColor: Colors.primary,
    backgroundColor: Colors.bgWhite,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  inputWrapperError: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  inputIconBox: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.bgLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  inputIconBoxFocused: {
    backgroundColor: Colors.dangerBg,
    borderColor: Colors.primarySurface,
  },
  textInput: {
    flex: 1,
    color: Colors.textDark,
    fontSize: scaledFontSize(FontSizes.base, 0.20),
    fontWeight: FontWeights.medium,
    paddingVertical: 0,
  },
  eyeToggleButton: {
    padding: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 48,
    minWidth: 48,
  },
  loginButtonContainer: {
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonGradient: {
    minHeight: moderateScale(52, 0.20),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  loginBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: {
    flexShrink: 1,
    textAlign: 'center',
    color: Colors.textWhite,
    fontWeight: FontWeights.black,
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    letterSpacing: 0.8,
    marginRight: Spacing.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalContent: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xxl,
    alignItems: 'center',
    elevation: 12,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },
  modalIconBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.dangerBg,
    borderWidth: 1.5,
    borderColor: Colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: scaledFontSize(FontSizes.xl, 0.20),
    fontWeight: FontWeights.black,
    color: Colors.textDark,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    letterSpacing: 1.2,
    marginTop: Spacing.xxs,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
  },
  modalBodyText: {
    fontSize: scaledFontSize(FontSizes.base, 0.20),
    color: Colors.textMedium,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xxl,
  },
  modalCloseBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: moderateScale(12, 0.20),
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  otpIconBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.successBg,
    borderWidth: 1.5,
    borderColor: Colors.successBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  otpSubtitle: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.bold,
    color: Colors.success,
    letterSpacing: 1.2,
    marginTop: Spacing.xxs,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
  },
  otpEmail: {
    fontWeight: FontWeights.extrabold,
    color: Colors.textDark,
  },
  otpInput: {
    width: '100%',
    backgroundColor: Colors.bgLight,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    textAlign: 'center',
    fontSize: scaledFontSize(26, 0.20),
    fontWeight: FontWeights.black,
    letterSpacing: 12,
    color: Colors.textDark,
    marginBottom: Spacing.md,
  },
  otpErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  otpErrorText: {
    color: Colors.primary,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.semibold,
    flexShrink: 1,
  },
  otpVerifyBtn: {
    width: '100%',
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.lg,
    paddingVertical: moderateScale(12, 0.20),
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  otpBtnDisabled: {
    opacity: 0.6,
  },
  otpResendBtn: {
    paddingVertical: Spacing.md,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpResendText: {
    color: Colors.success,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.bold,
  },
  otpCancelText: {
    color: Colors.textGray,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.semibold,
    marginTop: Spacing.xs,
  },
  modalCloseBtnText: {
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.extrabold,
    letterSpacing: 0.5,
  },
});
