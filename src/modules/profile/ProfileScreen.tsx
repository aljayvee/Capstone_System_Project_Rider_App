import React from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Switch, View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenLayout, ScreenSpacing } from '../../config/screenLayout';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { LogOut, Camera, Pencil, Crosshair, ChevronRight, Power } from 'lucide-react-native';
import { useRiderMissionContext } from '../../context/RiderMissionContext';
import { useRiderAuth } from '../../context/RiderAuthContext';
import type { AuthedStackParamList } from '../../navigation/AuthedNavigator';
import { riderApiService } from '../../config/apiConfig';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, scaledFontSize, moderateScale } from '../../config/theme';
import { ProfileColors } from './profileTheme';

/** The server's cap, mirrored here so a rider is told before the upload, not after. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** Long edge, in pixels. A modern phone photo is far larger than an avatar needs. */
const AVATAR_MAX_DIMENSION = 1024;
const NAME_FONT_SIZE = scaledFontSize(FontSizes.xl, 0.35);

export default function ProfileScreen() {
  // The context, not useRiderMission() directly. Calling the hook here mounted a
  // SECOND independent copy of all mission state — a duplicate errand fetch and a
  // second Firebase chat listener every time the rider opened this tab.
  const { riderProfile, phase, refresh } = useRiderMissionContext();
  const { logout, isOnline, toggleShiftStatus } = useRiderAuth();
  const navigation = useNavigation<StackNavigationProp<AuthedStackParamList>>();
  const { fontScale } = useWindowDimensions();
  const pencilSize = NAME_FONT_SIZE * Math.min(fontScale, 1.2) * 1.01;
  const nameWords = riderProfile?.name.trim().split(/\s+/) ?? [];

  const [avatarUri, setAvatarUri] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);

  // Photos are fetched separately; Profile and Home use the profile timestamp
  // to refresh the image after it is changed.
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
    // Optimistic: the picture they chose is their picture now, shown faded
    // until the server has it, and put back the way it was if it refuses.
    // There used to be a spinner in its place for the whole upload.
    const previousUri = avatarUri;
    const revert = () => setAvatarUri(previousUri);
    setAvatarUri(asset.uri);
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
        revert();
        Alert.alert('That picture could not be read', 'Try another photo.');
        return;
      }

      // base64 inflates by 4/3; measure what actually goes over the wire.
      const byteSize = Math.ceil((processed.base64.length * 3) / 4);
      if (byteSize > MAX_PHOTO_BYTES) {
        revert();
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
      revert();
      const message =
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        'Your picture could not be saved. Check your signal and try again.';
      Alert.alert('Picture not saved', String(message));
    } finally {
      setUploading(false);
    }
  }, [riderProfile, refresh, avatarUri]);

  if (phase === 'loading' || !riderProfile) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, styles.centerState]}>
        <ActivityIndicator size="large" color={ProfileColors.accent} accessibilityLabel="Loading your profile" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.pageTitle} accessibilityRole="header" maxFontSizeMultiplier={1.25}>Profile</Text>

        <View style={styles.identityRow}>
          <TouchableOpacity
            onPress={handleChangePhoto}
            disabled={uploading}
            style={styles.avatarWrap}
            accessibilityRole="button"
            accessibilityState={{ busy: uploading, disabled: uploading }}
            accessibilityLabel="Change your profile picture"
            testID="change-photo"
          >
            <View style={styles.avatar}>
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={[styles.avatarImage, uploading && styles.avatarSaving]}
                  testID="avatar-image"
                />
              ) : (
                <Text style={styles.avatarText} maxFontSizeMultiplier={1.2}>{riderProfile.initials}</Text>
              )}
            </View>
            <View style={styles.cameraBadge}>
              <Camera size={16} color={Colors.onNavy} />
            </View>
          </TouchableOpacity>

          <View style={styles.identityText}>
            <View style={styles.nameRow}>
              {/* Wrap between words, keeping the final name and pencil together. */}
              {nameWords.slice(0, -1).map((word, index) => (
                <Text
                  key={`${index}-${word}`}
                  style={styles.name}
                  maxFontSizeMultiplier={1.2}
                  accessibilityLabel={index === 0 ? riderProfile.name : undefined}
                  accessible={index === 0}
                  importantForAccessibility={index === 0 ? 'auto' : 'no'}
                  accessibilityElementsHidden={index !== 0}
                >{word}</Text>
              ))}
              <View style={styles.lastNameRow}>
                <Text
                  style={[styles.name, styles.lastName]}
                  maxFontSizeMultiplier={1.2}
                  accessibilityLabel={nameWords.length === 1 ? riderProfile.name : undefined}
                  accessible={nameWords.length === 1}
                  importantForAccessibility={nameWords.length === 1 ? 'auto' : 'no'}
                  accessibilityElementsHidden={nameWords.length !== 1}
                >{nameWords[nameWords.length - 1]}</Text>
                <TouchableOpacity
                  style={styles.editIconButton}
                  onPress={() => navigation.navigate('EditProfile')}
                  accessibilityRole="button"
                  accessibilityLabel="Edit your account information"
                  testID="edit-account"
                >
                  <Pencil size={pencilSize} color={ProfileColors.accent} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.photoHint} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.25}>
              {uploading ? 'Saving your photo…' : 'Tap your photo to change it'}
            </Text>
          </View>
        </View>

        {/* The duty switch. toggleShiftStatus has existed on the auth context all
            along with nothing calling it — the header could only ever report the
            state, so a rider had no way to go off duty from inside the app. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header" maxFontSizeMultiplier={1.25}>Availability</Text>
          <View style={[styles.availabilityPanel, isOnline && styles.availabilityOnline]}>
            <View style={styles.settingRow}>
              <Power size={20} color={isOnline ? Colors.success : ProfileColors.accent} />
              <View style={styles.dutyText}>
                <Text style={styles.dutyLabel} maxFontSizeMultiplier={1.25}>
                  {isOnline ? 'Online' : 'Offline'}
                </Text>
              </View>
              <Switch
                style={styles.switchTarget}
                value={isOnline}
                onValueChange={toggleShiftStatus}
                trackColor={{ false: ProfileColors.accentBorder, true: Colors.success }}
                thumbColor={Colors.bgWhite}
                accessibilityLabel={isOnline ? 'Go offline' : 'Go online'}
              />
            </View>
            <Text style={styles.dutyHint} maxFontSizeMultiplier={1.25}>
              You can receive errands when turned on and while location is set to "Allow all the time".
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header" maxFontSizeMultiplier={1.25}>App preferences</Text>
          {/* The GPS check: measures how far this phone's GPS wanders standing
              still, and sets the live pin to ignore that much. */}
          <TouchableOpacity
            style={styles.gpsRow}
            onPress={() => navigation.navigate('GpsCalibration')}
            accessibilityRole="button"
            accessibilityLabel="GPS Calibration. Test your GPS and steady your map pin."
            testID="gps-calibration"
          >
            <View style={styles.settingRow}>
              <Crosshair size={20} color={ProfileColors.accent} />
              <View style={styles.dutyText}>
                <Text style={styles.dutyLabel} maxFontSizeMultiplier={1.25}>GPS Calibration</Text>
              </View>
              <ChevronRight size={20} color={ProfileColors.accent} />
            </View>
            <Text style={styles.dutyHint} maxFontSizeMultiplier={1.25}>
              Test your GPS in 30 seconds and stop your pin from jumping around while you stand still.
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.signOutSection}>
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={logout}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <LogOut size={18} color={Colors.navy} />
            <Text style={styles.signOutText} maxFontSizeMultiplier={1.25}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ProfileColors.background,
  },
  scrollContent: {
    ...ScreenLayout.content,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    ...ScreenLayout.pageTitle,
    marginBottom: ScreenSpacing.section,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(16, 0.5),
  },
  identityText: {
    flex: 1,
    gap: moderateScale(6, 0.5),
  },
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: moderateScale(6, 0.5),
  },
  lastNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    gap: moderateScale(4, 0.5),
  },
  editIconButton: {
    width: 48,
    height: 48,
    flexShrink: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  avatarWrap: {
    padding: moderateScale(2, 0.5),
    flexShrink: 0,
  },
  avatar: {
    width: moderateScale(80, 0.5),
    height: moderateScale(80, 0.5),
    borderRadius: BorderRadius.full,
    backgroundColor: ProfileColors.accentSurface,
    borderWidth: 1,
    borderColor: ProfileColors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  /** The chosen picture while it is still on its way to the server. */
  avatarSaving: {
    opacity: 0.6,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: ProfileColors.accent,
    fontSize: scaledFontSize(FontSizes.display, 0.35),
    fontWeight: FontWeights.extrabold as any,
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: moderateScale(28, 0.5),
    height: moderateScale(28, 0.5),
    borderRadius: BorderRadius.full,
    backgroundColor: ProfileColors.accent,
    borderWidth: 2,
    borderColor: ProfileColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: Colors.navy,
    fontSize: NAME_FONT_SIZE,
    fontWeight: FontWeights.bold as any,
    maxWidth: '100%',
  },
  lastName: { flexShrink: 1 },
  photoHint: {
    color: Colors.textGray,
    fontSize: scaledFontSize(FontSizes.xs, 0.35),
    lineHeight: moderateScale(18, 0.5),
  },
  section: {
    marginTop: moderateScale(28, 0.5),
    gap: moderateScale(12, 0.5),
  },
  sectionTitle: {
    fontSize: scaledFontSize(FontSizes.md, 0.35),
    fontWeight: FontWeights.bold,
    color: Colors.navy,
  },
  availabilityPanel: {
    paddingHorizontal: moderateScale(14, 0.5),
    paddingBottom: moderateScale(14, 0.5),
    paddingTop: moderateScale(4, 0.5),
    borderRadius: BorderRadius.md,
    backgroundColor: ProfileColors.mutedSurface,
    gap: moderateScale(4, 0.5),
  },
  availabilityOnline: {
    backgroundColor: Colors.successSubtle,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: moderateScale(12, 0.5),
    minHeight: 48,
  },
  switchTarget: {
    minHeight: 48,
    minWidth: 48,
    flexShrink: 0,
  },
  dutyText: {
    flex: 1,
    gap: 2,
  },
  dutyLabel: {
    fontSize: scaledFontSize(FontSizes.base, 0.35),
    fontWeight: FontWeights.semibold,
    color: Colors.navy,
  },
  dutyHint: {
    fontSize: scaledFontSize(FontSizes.sm, 0.35),
    lineHeight: moderateScale(22, 0.5),
    color: Colors.textMedium,
  },
  gpsRow: {
    paddingVertical: moderateScale(8, 0.5),
    gap: moderateScale(4, 0.5),
    minHeight: 48,
  },
  signOutSection: {
    marginTop: moderateScale(24, 0.5),
    paddingTop: moderateScale(16, 0.5),
    borderTopWidth: 1,
    borderTopColor: ProfileColors.divider,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: moderateScale(14, 0.5),
    paddingHorizontal: moderateScale(16, 0.5),
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    minHeight: Math.max(52, moderateScale(54, 0.5)),
  },
  signOutText: {
    flexShrink: 1,
    textAlign: 'center',
    color: Colors.navy,
    fontSize: scaledFontSize(FontSizes.base, 0.35),
    fontWeight: FontWeights.semibold as any,
  },
});
