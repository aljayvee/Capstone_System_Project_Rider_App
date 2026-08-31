import React from 'react';
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet, Switch, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { LogOut, Camera, Pencil, BellRing, ChevronRight } from 'lucide-react-native';
import { useRiderMissionContext } from '../../context/RiderMissionContext';
import { useRiderAuth } from '../../context/RiderAuthContext';
import type { AuthedStackParamList } from '../../navigation/AuthedNavigator';
import { riderApiService } from '../../config/apiConfig';
import { openExactAlarmSettings } from '../../services/offerAlarm';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, scaledFontSize, moderateScale, MAX_CONTENT_WIDTH } from '../../config/theme';

/** The server's cap, mirrored here so a rider is told before the upload, not after. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** Long edge, in pixels. A modern phone photo is far larger than an avatar needs. */
const AVATAR_MAX_DIMENSION = 1024;

export default function ProfileScreen() {
  // The context, not useRiderMission() directly. Calling the hook here mounted a
  // SECOND independent copy of all mission state — a duplicate errand fetch and a
  // second Firebase chat listener every time the rider opened this tab.
  const { riderProfile, phase, refresh } = useRiderMissionContext();
  const { logout, isOnline, toggleShiftStatus } = useRiderAuth();
  const navigation = useNavigation<StackNavigationProp<AuthedStackParamList>>();

  const [avatarUri, setAvatarUri] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);

  // Fetched separately from the profile: the bytes are large and only this screen
  // needs them, so the profile read carries a timestamp instead.
  React.useEffect(() => {
    let cancelled = false;
    if (!riderProfile?.id || !riderProfile.photoUpdatedAt) {
      setAvatarUri(null);
      return;
    }
    (async () => {
      const data = await riderApiService.fetchProfilePhoto(riderProfile.id);
      if (!cancelled) setAvatarUri(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [riderProfile?.id, riderProfile?.photoUpdatedAt]);

  const handleChangePhoto = React.useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photos not allowed',
        'Allow photo access in your phone settings to change your picture.'
      );
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    setUploading(true);
    try {
      // Resized and re-encoded before it is measured. A straight-from-camera
      // photo is routinely 6-10MB, so without this step the rider picks a
      // perfectly ordinary picture and is told it is too big.
      const processed = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: AVATAR_MAX_DIMENSION } }],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );

      if (!processed.base64) {
        Alert.alert('That picture could not be read', 'Try another photo.');
        return;
      }

      // base64 inflates by 4/3; measure what actually goes over the wire.
      const byteSize = Math.ceil((processed.base64.length * 3) / 4);
      if (byteSize > MAX_PHOTO_BYTES) {
        Alert.alert(
          'That picture is too large',
          'Profile pictures must be under 5MB. Try a smaller photo.'
        );
        return;
      }

      const dataUri = `data:image/jpeg;base64,${processed.base64}`;
      await riderApiService.uploadProfilePhoto(riderProfile!.id, {
        photoData: dataUri,
        mimeType: 'image/jpeg',
        fileSize: byteSize,
        fileName: asset.fileName ?? 'profile.jpg',
      });

      // Shown immediately from what was just uploaded rather than re-fetched —
      // the bytes are already here, and a round trip would only redraw the same
      // picture a second later.
      setAvatarUri(dataUri);
      refresh();
    } catch (err: any) {
      const message =
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        'Your picture could not be saved. Check your signal and try again.';
      Alert.alert('Picture not saved', String(message));
    } finally {
      setUploading(false);
    }
  }, [riderProfile, refresh]);

  if (phase === 'loading' || !riderProfile) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, styles.centerState]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  const infoRows = [
    { label: 'Phone Number', value: riderProfile.phone || '—' },
    { label: 'Email', value: riderProfile.email || '—' },
    { label: 'Account Status', value: riderProfile.status },
    { label: 'Join Date', value: riderProfile.joinDate },
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <LinearGradient
          colors={[Colors.primaryGradientStart, Colors.primaryGradientEnd]}
          style={styles.profileCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <TouchableOpacity
            onPress={handleChangePhoto}
            disabled={uploading}
            style={styles.avatarWrap}
            accessibilityRole="button"
            accessibilityState={{ busy: uploading }}
            accessibilityLabel="Change your profile picture"
            testID="change-photo"
          >
            <View style={styles.avatar}>
              {uploading ? (
                <ActivityIndicator color={Colors.textWhite} />
              ) : avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{riderProfile.initials}</Text>
              )}
            </View>
            <View style={styles.cameraBadge}>
              <Camera size={14} color={Colors.onPrimary} />
            </View>
          </TouchableOpacity>

          <Text style={styles.name} maxFontSizeMultiplier={1.2}>{riderProfile.name}</Text>
          <Text style={styles.riderId} maxFontSizeMultiplier={1.15}>Rider ID: {riderProfile.riderId}</Text>
        </LinearGradient>

        {/* The duty switch. toggleShiftStatus has existed on the auth context all
            along with nothing calling it — the header could only ever report the
            state, so a rider had no way to go off duty from inside the app. */}
        <View style={styles.dutyRow}>
          <View style={styles.dutyText}>
            <Text style={styles.dutyLabel} maxFontSizeMultiplier={1.15}>{isOnline ? 'On Duty' : 'Off Duty'}</Text>
            <Text style={styles.dutyHint} maxFontSizeMultiplier={1.15}>
              {isOnline
                ? 'You can be given errands and your location is shared.'
                : 'You will not be given new errands.'}
            </Text>
          </View>
          <Switch
            value={isOnline}
            onValueChange={toggleShiftStatus}
            trackColor={{ false: Colors.border, true: Colors.successAccent }}
            thumbColor={Colors.bgWhite}
            accessibilityLabel={isOnline ? 'Go off duty' : 'Go on duty'}
          />
        </View>

        {/* Android 14 denies this by default to anything that is not a clock or a
            calendar, so it cannot be requested with a dialog — the rider has to
            turn it on themselves, and this is the only screen that can take them
            there. Android-only: iOS has no equivalent restriction. */}
        {Platform.OS === 'android' && (
          <TouchableOpacity
            style={styles.permissionRow}
            onPress={openExactAlarmSettings}
            accessibilityRole="button"
            accessibilityLabel="Open alarms and reminders settings"
            testID="exact-alarm-settings"
          >
            <BellRing size={18} color={Colors.primary} />
            <View style={styles.permissionText}>
              <Text style={styles.permissionLabel} maxFontSizeMultiplier={1.15}>
                Alarms &amp; reminders
              </Text>
              <Text style={styles.permissionHint} maxFontSizeMultiplier={1.15}>
                Lets us wake your phone the moment an errand is given to you. Without
                it the alert can arrive minutes late, after the errand has gone.
              </Text>
            </View>
            <ChevronRight size={18} color={Colors.textGray} />
          </TouchableOpacity>
        )}

        <View style={styles.infoContainer}>
          {infoRows.map((item, index) => (
            <View
              key={item.label}
              style={[styles.infoRow, index === infoRows.length - 1 && styles.noBorder]}
            >
              <Text style={styles.infoLabel} maxFontSizeMultiplier={1.15}>{item.label}</Text>
              <Text style={styles.infoValue} maxFontSizeMultiplier={1.15}>{item.value}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => navigation.navigate('EditProfile')}
          accessibilityRole="button"
          accessibilityLabel="Edit your account information"
          testID="edit-account"
        >
          <Pencil size={16} color={Colors.onPrimary} />
          <Text style={styles.editText} maxFontSizeMultiplier={1.15}>Edit Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={logout}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <LogOut size={16} color={Colors.primary} />
          <Text style={styles.signOutText} maxFontSizeMultiplier={1.15}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgGray,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    maxWidth: MAX_CONTENT_WIDTH,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: moderateScale(110, 0.20),
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  avatarWrap: {
    marginBottom: Spacing.md,
  },
  avatar: {
    width: moderateScale(88, 0.20),
    height: moderateScale(88, 0.20),
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    borderWidth: 4,
    borderColor: Colors.bgWhite,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.display, 0.20),
    fontWeight: FontWeights.extrabold as any,
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryStrong,
    borderWidth: 2,
    borderColor: Colors.bgWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: Colors.textWhite,
    fontSize: scaledFontSize(FontSizes.xl, 0.20),
    fontWeight: FontWeights.bold as any,
  },
  riderId: {
    color: Colors.whiteOverlayText,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    marginTop: Spacing.xs,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    minHeight: 48,
  },
  permissionText: {
    flex: 1,
    gap: 2,
  },
  permissionLabel: {
    color: Colors.textDark,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold as any,
  },
  permissionHint: {
    color: Colors.textGray,
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },
  dutyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.lg,
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    minHeight: 48,
  },
  dutyText: {
    flex: 1,
    gap: 2,
  },
  dutyLabel: {
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
  },
  dutyHint: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textGray,
  },
  infoContainer: {
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: Spacing.md,
  },
  noBorder: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    color: Colors.textGray,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
  },
  infoValue: {
    color: Colors.textDark,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold as any,
    flexShrink: 1,
    textAlign: 'right',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    minHeight: 48,
  },
  editText: {
    color: Colors.onPrimary,
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.bold as any,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySurface,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    minHeight: 48,
  },
  signOutText: {
    color: Colors.primary,
    fontSize: scaledFontSize(FontSizes.md, 0.20),
    fontWeight: FontWeights.semibold as any,
  },
});
