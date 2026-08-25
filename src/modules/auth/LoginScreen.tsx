import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  Animated,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
} from 'lucide-react-native';
import { useRiderAuth } from '../../context/RiderAuthContext';
import { TacticalGridBackground } from '../../components/TacticalGridBackground';
import { FontSizes, FontWeights, Spacing, BorderRadius } from '../../config/theme';

export const LoginScreen = () => {
  const { login, pendingChallenge, verifyLoginOtp, resendLoginOtp, cancelChallenge } = useRiderAuth();
  const { height: screenHeight } = useWindowDimensions();
  const scrollViewRef = useRef<ScrollView>(null);

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

    setIsLoading(true);
    try {
      await login(username.trim(), password.trim());
    } catch (err: any) {
      const msg = err?.message || 'Invalid username or password';
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
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = otpCode.trim();
    if (code.length !== 6) {
      setOtpError('Enter the 6-digit code from your email.');
      return;
    }

    setOtpError(null);
    setIsVerifying(true);
    try {
      await verifyLoginOtp(code);
    } catch (err: any) {
      setOtpError(err?.message || 'Incorrect verification code.');
      setOtpCode('');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    setOtpError(null);
    setIsResending(true);
    try {
      await resendLoginOtp();
      setOtpCode('');
    } catch (err: any) {
      setOtpError(err?.message || 'Could not send a new code.');
    } finally {
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
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Clean White Tactical Vector Grid Background */}
      <TacticalGridBackground />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
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
                colors={['#EF4444', '#DC2626', '#991B1B']}
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
                  color="#FFFFFF"
                  strokeWidth={2.3}
                />
              </LinearGradient>
            </View>

            {/* Brand Pill */}
            <View style={styles.brandPill}>
              <Bike size={14} color="#DC2626" strokeWidth={2.4} />
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
            {/* API / Auth Error Banner */}
            {apiError ? (
              <View style={styles.errorBanner}>
                <AlertCircle size={18} color="#DC2626" strokeWidth={2.2} />
                <Text style={styles.errorBannerText}>{apiError}</Text>
              </View>
            ) : null}

            {/* USERNAME INPUT CONTAINER */}
            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>USERNAME</Text>
                {usernameError ? (
                  <View style={styles.inlineErrorBadge}>
                    <AlertCircle size={12} color="#DC2626" strokeWidth={2.2} />
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
                      color={usernameError ? '#DC2626' : userFocused ? '#DC2626' : '#64748B'}
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
                    placeholderTextColor="#94A3B8"
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
                    <AlertCircle size={12} color="#DC2626" strokeWidth={2.2} />
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
                      color={passwordError ? '#DC2626' : passFocused ? '#DC2626' : '#64748B'}
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
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    testID="password-input"
                  />
                  <TouchableOpacity
                    style={styles.eyeToggleButton}
                    onPress={() => setShowPassword((prev) => !prev)}
                    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                    activeOpacity={0.7}
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff size={19} color="#DC2626" strokeWidth={2.2} />
                    ) : (
                      <Eye size={19} color="#64748B" strokeWidth={2.2} />
                    )}
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </View>

            {/* HIGH-IMPACT ERGONOMIC SIGN IN BUTTON */}
            <TouchableOpacity
              style={[styles.loginButtonContainer, isLoading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.88}
              testID="rider-login-submit"
            >
              <LinearGradient
                colors={['#EF4444', '#DC2626', '#B91C1C']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginButtonGradient}
              >
                {isLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.loginButtonText}>SIGNING IN...</Text>
                  </View>
                ) : (
                  <View style={styles.loginBtnContent}>
                    <Text style={styles.loginButtonText}>SIGN IN</Text>
                    <ArrowRight size={18} color="#FFFFFF" strokeWidth={2.5} />
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
              <ShieldAlert size={36} color="#DC2626" strokeWidth={2.2} />
            </View>

            <Text style={styles.modalTitle}>Access Restricted</Text>
            <Text style={styles.modalSubtitle}>Rider Portal Access Only</Text>

            <Text style={styles.modalBodyText}>
              {restrictedMessage}
            </Text>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowRestrictedModal(false)}
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
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.otpIconBadge}>
                <MailCheck size={36} color="#047857" strokeWidth={2.2} />
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
                    placeholderTextColor="#CBD5E1"
                    keyboardType="number-pad"
                    maxLength={6}
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    autoFocus
                    editable={!isVerifying}
                  />

                  {otpError ? (
                    <View style={styles.otpErrorRow}>
                      <AlertCircle size={14} color="#DC2626" />
                      <Text style={styles.otpErrorText}>{otpError}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.otpVerifyBtn, isVerifying && styles.otpBtnDisabled]}
                    onPress={handleVerifyOtp}
                    disabled={isVerifying}
                    activeOpacity={0.85}
                  >
                    {isVerifying ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.modalCloseBtnText}>Verify & Sign In</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleResendOtp}
                    disabled={isResending || isVerifying}
                    activeOpacity={0.7}
                    style={styles.otpResendBtn}
                  >
                    <Text style={styles.otpResendText}>
                      {isResending ? 'Sending...' : 'Resend code'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity onPress={handleCancelChallenge} activeOpacity={0.7}>
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
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl + Spacing.xs,
  },
  heroHeader: {
    alignItems: 'center',
  },
  logoOuterGlow: {
    padding: 3,
    borderRadius: 50,
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: Spacing.md,
  },
  logoBadge: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.xs,
  },
  brandPillText: {
    color: '#DC2626',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.extrabold,
    letterSpacing: 1.5,
    marginLeft: Spacing.xs,
  },
  portalTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.black,
    color: '#0F172A',
    letterSpacing: 0.3,
    marginTop: Spacing.xxs,
  },
  portalSubtitle: {
    fontSize: FontSizes.sm,
    color: '#64748B',
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
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorBannerText: {
    color: '#B91C1C',
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    marginLeft: Spacing.md,
    flex: 1,
  },
  fieldBlock: {
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: Spacing.xs + 2,
    marginBottom: Spacing.xs,
  },
  fieldLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.extrabold,
    color: '#334155',
    letterSpacing: 0.8,
  },
  inlineErrorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  inlineErrorText: {
    color: '#DC2626',
    fontSize: FontSizes.xxs,
    fontWeight: FontWeights.bold,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    height: 54, // Ergonomic 54px touch target
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  inputWrapperFocused: {
    borderColor: '#DC2626',
    backgroundColor: '#FFFBFB',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  inputWrapperError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  inputIconBox: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  inputIconBoxFocused: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  textInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.medium,
    paddingVertical: 0,
  },
  eyeToggleButton: {
    padding: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButtonContainer: {
    marginTop: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonGradient: {
    height: 54, // Ergonomic 54px touch target
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
    color: '#FFFFFF',
    fontWeight: FontWeights.black,
    fontSize: FontSizes.md,
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
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing.xxl,
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },
  modalIconBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FEE2E2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.black,
    color: '#0F172A',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: '#DC2626',
    letterSpacing: 1.2,
    marginTop: Spacing.xxs,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
  },
  modalBodyText: {
    fontSize: FontSizes.sm,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xxl,
  },
  modalCloseBtn: {
    width: '100%',
    backgroundColor: '#DC2626',
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  otpIconBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#D1FAE5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  otpSubtitle: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: '#047857',
    letterSpacing: 1.2,
    marginTop: Spacing.xxs,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
  },
  otpEmail: {
    fontWeight: FontWeights.extrabold,
    color: '#0F172A',
  },
  otpInput: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: FontWeights.black,
    letterSpacing: 12,
    color: '#0F172A',
    marginBottom: Spacing.md,
  },
  otpErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  otpErrorText: {
    color: '#DC2626',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    flexShrink: 1,
  },
  otpVerifyBtn: {
    width: '100%',
    backgroundColor: '#047857',
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    shadowColor: '#047857',
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
  },
  otpResendText: {
    color: '#047857',
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  otpCancelText: {
    color: '#64748B',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    marginTop: Spacing.xs,
  },
  modalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: FontSizes.md,
    fontWeight: FontWeights.extrabold,
    letterSpacing: 0.5,
  },
});
