import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Info } from 'lucide-react-native';
import { useRiderMissionContext } from '../../context/RiderMissionContext';
import { riderApiService } from '../../config/apiConfig';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, scaledFontSize, moderateScale, MAX_CONTENT_WIDTH } from '../../config/theme';

interface FieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

/**
 * Checked here so a rider is told before the round trip, in the same words the
 * server would use. The server validates independently — this is a courtesy,
 * never the enforcement.
 */
function validate(values: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.firstName.trim()) errors.firstName = 'First name is required.';
  if (!values.lastName.trim()) errors.lastName = 'Last name is required.';

  if (!values.email.trim()) {
    errors.email = 'Email address is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) {
    errors.email = 'Enter a complete email address (e.g. juandelacruz@gmail.com).';
  }

  // Philippine mobile numbers: exactly 11 digits beginning 09. Same rule the
  // server applies, because a number that cannot be dialled is worse than a
  // blank one — dispatch assumes it works.
  const phone = values.phone.trim();
  if (!phone) {
    errors.phone = 'Phone number is required.';
  } else if (!/^\d+$/.test(phone)) {
    errors.phone = 'Phone number may contain digits only.';
  } else if (!phone.startsWith('09')) {
    errors.phone = 'Philippine mobile numbers must start with 09.';
  } else if (phone.length !== 11) {
    errors.phone = 'Phone number must be exactly 11 digits.';
  }

  return errors;
}

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const { riderProfile, refresh } = useRiderMissionContext();

  const [firstName, setFirstName] = React.useState(riderProfile?.firstName ?? '');
  const [lastName, setLastName] = React.useState(riderProfile?.lastName ?? '');
  const [email, setEmail] = React.useState(riderProfile?.email ?? '');
  const [phone, setPhone] = React.useState(riderProfile?.phone ?? '');
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const handleSave = React.useCallback(async () => {
    const values = { firstName, lastName, email, phone };
    const found = validate(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    if (!riderProfile) return;

    setSaving(true);
    try {
      await riderApiService.updateProfile(riderProfile.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });
      refresh();
      navigation.goBack();
    } catch (err: any) {
      // The server's own message wherever it sent one — it knows things this
      // form cannot, like an email already being taken by another account.
      setFormError(
        err?.response?.data?.message ??
          err?.response?.data?.error ??
          'Your changes could not be saved. Check your signal and try again.'
      );
    } finally {
      setSaving(false);
    }
  }, [firstName, lastName, email, phone, riderProfile, refresh, navigation]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to your profile"
        >
          <ChevronLeft size={22} color={Colors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} maxFontSizeMultiplier={1.2}>Edit Account</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Was behavior={undefined} on Android: under edge-to-edge the window never
          shrinks for the keyboard, so that meant no avoidance at all. Padding
          keeps Save above the keyboard and shrinks the form, which scrolls
          the focused field back into view. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {formError && (
            <View style={styles.formError}>
              <Info size={16} color={Colors.danger} />
              <Text style={styles.formErrorText} maxFontSizeMultiplier={1.15}>{formError}</Text>
            </View>
          )}

          {/* Section: Personal Details */}
          <View style={styles.section}>
            <Text style={styles.sectionHeading} maxFontSizeMultiplier={1.2}>Personal Details</Text>
            <View style={styles.groupContainer}>
              <Field
                label="First Name"
                value={firstName}
                onChangeText={setFirstName}
                error={errors.firstName}
                autoCapitalize="words"
                testID="edit-first-name"
              />
              <Field
                label="Last Name"
                value={lastName}
                onChangeText={setLastName}
                error={errors.lastName}
                autoCapitalize="words"
                testID="edit-last-name"
              />
            </View>
          </View>

          {/* Section: Contact Information */}
          <View style={styles.section}>
            <Text style={styles.sectionHeading} maxFontSizeMultiplier={1.2}>Contact Information</Text>
            <View style={styles.groupContainer}>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                error={errors.email}
                autoCapitalize="none"
                keyboardType="email-address"
                testID="edit-email"
              />
              <Field
                label="Phone Number"
                value={phone}
                onChangeText={setPhone}
                error={errors.phone}
                keyboardType="number-pad"
                maxLength={11}
                testID="edit-phone"
              />
            </View>
          </View>
        </ScrollView>

        <View style={styles.actionDock}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnBusy]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving, busy: saving }}
            accessibilityLabel="Save your account changes"
            testID="save-profile"
          >
            {saving ? (
              <ActivityIndicator color={Colors.onPrimary} />
            ) : (
              <Text style={styles.saveText} maxFontSizeMultiplier={1.15}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  error,
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel} maxFontSizeMultiplier={1.15}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={Colors.textLight}
        accessibilityLabel={label}
        maxFontSizeMultiplier={1.2}
        {...rest}
      />
      {/* Beneath the field it belongs to, not collected at the top — a rider
          fixing four errors should not have to work out which is which. */}
      {error ? <Text style={styles.fieldError} maxFontSizeMultiplier={1.15}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgGray,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.bgWhite,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  backBtn: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: scaledFontSize(FontSizes.lg, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: moderateScale(40, 0.20),
  },
  formError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.dangerBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  formErrorText: {
    flex: 1,
    color: Colors.danger,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold as any,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionHeading: {
    fontSize: scaledFontSize(FontSizes.base, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  groupContainer: {
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  field: {
    gap: Spacing.xs,
  },
  fieldLabel: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textMedium,
  },
  input: {
    backgroundColor: Colors.bgWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textDark,
    minHeight: 48,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  fieldError: {
    color: Colors.danger,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.semibold as any,
  },
  actionDock: {
    backgroundColor: Colors.bgWhite,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  saveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    minHeight: 48,
  },
  saveBtnBusy: {
    opacity: 0.7,
  },
  saveText: {
    color: Colors.onPrimary,
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.bold as any,
  },
});
