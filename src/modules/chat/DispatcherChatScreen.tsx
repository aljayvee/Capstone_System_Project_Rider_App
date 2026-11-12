import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  Platform,
  Image,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ScreenLayout, ScreenSpacing } from '../../config/screenLayout';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  ArrowLeft,
  Plus,
  Send,
  Camera,
  Image as ImageIcon,
  X,
  FileText,
  MessageSquare,
} from 'lucide-react-native';
import { useRiderMissionContext } from '../../context/RiderMissionContext';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, moderateScale } from '../../config/theme';
import { formatErrandId } from '../../utils/formatErrandId';
import DispatcherAvatar from '../../components/DispatcherAvatar';
import { WaybillModal } from '../../components/WaybillModal';
import { ChatMessage } from '../../types/rider';

export default function DispatcherChatScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const mission = useRiderMissionContext();

  const {
    drMessages,
    drDispatcherId,
    drDispatcherName,
    sendDispatcherMessage,
    setUnreadDR,
    showWaybill,
    setShowWaybill,
    activeErrands,
    errand,
    currentStatus,
    riderChatMode,
    dispatcherThreads,
    activeThreadUid,
    selectDispatcherThread,
  } = mission;

  // Each dispatcher's conversation is their own (firebase/dispatcherChat.ts).
  // With nobody to write to yet, the rider waits for dispatch to start one.
  const threadsMode = riderChatMode === 'threads';
  const noRecipient = threadsMode && !activeThreadUid;

  const displayErrand = activeErrands[0] ?? errand;

  const [inputText, setInputText] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [previewZoomImage, setPreviewZoomImage] = useState<string | null>(null);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // Clear unread badge on mount and when new messages arrive while screen is active
  useEffect(() => {
    setUnreadDR(false);
  }, [setUnreadDR, drMessages.length]);

  // Handle picking from camera
  const handleTakePhoto = async () => {
    setShowAttachMenu(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera Permission',
          'Camera permission is required to capture and send photos to the dispatcher.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        await processAndSetPhoto(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Error', 'Unable to capture photo. Please try again.');
    }
  };

  // Handle picking from gallery
  const handlePickFromGallery = async () => {
    setShowAttachMenu(false);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Gallery Permission',
          'Photo gallery permission is required to select images to send to the dispatcher.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        await processAndSetPhoto(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Error', 'Unable to select photo. Please try again.');
    }
  };

  // Downscale and compress image to lightweight base64 data URI
  const processAndSetPhoto = async (uri: string) => {
    setIsProcessingPhoto(true);
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1000 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (manipulated.base64) {
        setSelectedPhoto(`data:image/jpeg;base64,${manipulated.base64}`);
      } else {
        setSelectedPhoto(manipulated.uri);
      }
    } catch {
      Alert.alert('Error', 'Failed to process image. Please try again.');
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleSend = () => {
    const trimmed = inputText.trim();
    if ((!trimmed && !selectedPhoto) || noRecipient) return;

    sendDispatcherMessage(trimmed, selectedPhoto || undefined);
    setInputText('');
    setSelectedPhoto(null);

    // Scroll to end after sending
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    const isRider = item.from === 'rider';

    return (
      <View
        style={[
          styles.messageRow,
          isRider ? styles.messageRowRight : styles.messageRowLeft,
        ]}
      >
        {!isRider && (
          <View style={styles.dispatcherAvatarWrapper}>
            <DispatcherAvatar dispatcherId={drDispatcherId} size={28} />
          </View>
        )}

        <View
          style={[
            styles.bubble,
            isRider ? styles.bubbleRider : styles.bubbleDispatcher,
          ]}
        >
          {!isRider && (
            <Text style={styles.senderLabel} maxFontSizeMultiplier={1.15}>
              {drDispatcherName || 'Dispatcher'}
            </Text>
          )}

          {/* Image Bubble */}
          {item.imageUrl ? (
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setPreviewZoomImage(item.imageUrl || null)}
              style={styles.imageThumbnailContainer}
              accessibilityRole="button"
              accessibilityLabel="View full photo"
            >
              <Image
                source={{ uri: item.imageUrl }}
                style={styles.imageThumbnail}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ) : null}

          {/* Text Message */}
          {item.text ? (
            <Text
              style={[
                styles.messageText,
                isRider ? styles.messageTextRider : styles.messageTextDispatcher,
              ]}
              maxFontSizeMultiplier={1.2}
            >
              {item.text}
            </Text>
          ) : null}

          {/* Timestamp */}
          <Text
            style={[
              styles.messageTimestamp,
              isRider ? styles.messageTimestampRider : styles.messageTimestampDispatcher,
            ]}
            maxFontSizeMultiplier={1.1}
          >
            {item.timestamp}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* ─── Modern Deep Navy Header ────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back to task screen"
          >
            <ArrowLeft size={22} color={Colors.textWhite} />
          </TouchableOpacity>

          <View style={styles.dispatcherInfo}>
            <DispatcherAvatar dispatcherId={drDispatcherId} size={36} />
            <View style={styles.dispatcherTextCol}>
              <Text style={styles.dispatcherName} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {drDispatcherName || 'Duty Dispatcher'}
              </Text>
              <View style={styles.onlineBadgeRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineLabel} maxFontSizeMultiplier={1.1}>
                  Dispatch Support
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Right Header: Errand Chip & Waybill CTA */}
        {displayErrand && (
          <View style={styles.headerRight}>
            <View style={styles.errandContextChip}>
              <Text style={styles.errandIdText} maxFontSizeMultiplier={1.1}>
                {formatErrandId(displayErrand.id)}
              </Text>
              <Text style={styles.errandStatusText} numberOfLines={1} maxFontSizeMultiplier={1.1}>
                {currentStatus}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.waybillHeaderBtn}
              onPress={() => setShowWaybill(true)}
              accessibilityRole="button"
              accessibilityLabel="View errand waybill details"
            >
              <FileText size={18} color={Colors.primary} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ─── One tab per dispatcher conversation ───────────────────────── */}
      {threadsMode && dispatcherThreads.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.threadBar}
          contentContainerStyle={styles.threadBarContent}
        >
          {dispatcherThreads.map((thread) => {
            const selected = thread.staffUid === activeThreadUid;
            return (
              <TouchableOpacity
                key={thread.staffUid}
                style={[styles.threadTab, selected && styles.threadTabSelected]}
                onPress={() => selectDispatcherThread(thread.staffUid)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`Conversation with ${thread.dispatcherName}`}
                testID={`thread-${thread.staffUid}`}
              >
                <Text
                  style={[styles.threadTabText, selected && styles.threadTabTextSelected]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.15}
                >
                  {thread.dispatcherName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {/* ─── Chat Message Feed ────────────────────────────────────────── */}
      <FlatList
        ref={flatListRef}
        data={drMessages}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderMessageItem}
        contentContainerStyle={[
          styles.messageListContent,
          drMessages.length === 0 && styles.emptyListContent,
        ]}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          if (drMessages.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: false });
          }
        }}
        ListEmptyComponent={
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyIconCircle}>
              <MessageSquare size={28} color={Colors.navy} strokeWidth={1.8} />
            </View>
            <Text style={styles.emptyTitle} maxFontSizeMultiplier={1.2}>
              Direct Dispatch Support
            </Text>
            <Text style={styles.emptySubtitle} maxFontSizeMultiplier={1.15}>
              {noRecipient
                ? 'No dispatcher has messaged you yet. Once one does, or once your errand is accepted, you can reply here.'
                : 'Message your dispatcher for order guidance, route assistance, or receipts.'}
            </Text>
          </View>
        }
      />

      {/* ─── Bottom Composer Dock with Keyboard Avoidance ─────────────── */}
      {/* Was behavior={undefined} on Android, so the composer sat under the
          keyboard. The keyboard's height already covers the navigation bar
          that the SafeAreaView below pads for, so the offset takes that back
          out: the dock lands on the keyboard instead of floating above it. */}
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={-insets.bottom}>
        <SafeAreaView edges={['bottom']} style={styles.composerDock}>
          {/* Photo attachment preview */}
          {selectedPhoto && (
            <View style={styles.photoDraftPreviewBar}>
              <View style={styles.draftThumbnailWrapper}>
                <Image source={{ uri: selectedPhoto }} style={styles.draftThumbnail} />
                <TouchableOpacity
                  style={styles.draftRemoveBtn}
                  onPress={() => setSelectedPhoto(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo attachment"
                >
                  <View style={styles.draftRemoveBadge}>
                    <X size={12} color={Colors.textWhite} strokeWidth={3} />
                  </View>
                </TouchableOpacity>
              </View>
              <Text style={styles.draftPhotoLabel} maxFontSizeMultiplier={1.15}>
                Photo ready to send with message
              </Text>
            </View>
          )}

          {isProcessingPhoto && (
            <View style={styles.processingBar}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.processingText} maxFontSizeMultiplier={1.15}>
                Compressing photo...
              </Text>
            </View>
          )}

          {/* Composer Row */}
          <View style={styles.composerRow}>
            {/* Attachment '+' Button */}
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={() => setShowAttachMenu(true)}
              accessibilityRole="button"
              accessibilityLabel="Attach photo from camera or library"
            >
              <Plus size={22} color={Colors.navy} strokeWidth={2.4} />
            </TouchableOpacity>

            {/* Multiline TextInput with Emoji Support */}
            <TextInput
              style={styles.composerInput}
              editable={!noRecipient}
              placeholder={noRecipient ? 'Waiting for a dispatcher' : 'Message dispatcher...'}
              placeholderTextColor={Colors.textLight}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
              maxFontSizeMultiplier={1.2}
            />

            {/* Send Button */}
            <TouchableOpacity
              style={[
                styles.sendBtn,
                ((!inputText.trim() && !selectedPhoto) || noRecipient) && styles.sendBtnDisabled,
              ]}
              onPress={handleSend}
              disabled={(!inputText.trim() && !selectedPhoto) || noRecipient}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Send
                size={18}
                color={(!inputText.trim() && !selectedPhoto) ? Colors.textLight : Colors.textWhite}
                strokeWidth={2.2}
              />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>

      {/* ─── Photo Attachment Source Sheet Modal ───────────────────────── */}
      <Modal
        visible={showAttachMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAttachMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAttachMenu(false)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss photo options"
        >
          <View style={styles.actionSheetContent}>
            <Text style={styles.actionSheetTitle} maxFontSizeMultiplier={1.2}>
              Send Photo to Dispatcher
            </Text>

            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={handleTakePhoto}
              accessibilityRole="button"
              accessibilityLabel="Take a photo with camera"
            >
              <View style={[styles.actionSheetIconBox, { backgroundColor: Colors.infoSubtle }]}>
                <Camera size={20} color={Colors.info} strokeWidth={2} />
              </View>
              <View style={styles.actionSheetTextCol}>
                <Text style={styles.actionSheetOptionTitle} maxFontSizeMultiplier={1.15}>
                  Take Photo
                </Text>
                <Text style={styles.actionSheetOptionSubtitle} maxFontSizeMultiplier={1.1}>
                  Use camera to photograph receipt or item
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={handlePickFromGallery}
              accessibilityRole="button"
              accessibilityLabel="Choose photo from gallery"
            >
              <View style={[styles.actionSheetIconBox, { backgroundColor: Colors.successSubtle }]}>
                <ImageIcon size={20} color={Colors.success} strokeWidth={2} />
              </View>
              <View style={styles.actionSheetTextCol}>
                <Text style={styles.actionSheetOptionTitle} maxFontSizeMultiplier={1.15}>
                  Choose from Gallery
                </Text>
                <Text style={styles.actionSheetOptionSubtitle} maxFontSizeMultiplier={1.1}>
                  Select an existing photo from library
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionSheetCancelBtn}
              onPress={() => setShowAttachMenu(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel photo selection"
            >
              <Text style={styles.actionSheetCancelText} maxFontSizeMultiplier={1.15}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── Fullscreen Photo Zoom Modal ───────────────────────────────── */}
      <Modal
        visible={Boolean(previewZoomImage)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewZoomImage(null)}
      >
        <View style={styles.zoomModalOverlay}>
          <SafeAreaView edges={['top']} style={styles.zoomHeaderBar}>
            <TouchableOpacity
              style={styles.zoomCloseBtn}
              onPress={() => setPreviewZoomImage(null)}
              accessibilityRole="button"
              accessibilityLabel="Close photo preview"
            >
              <X size={24} color={Colors.textWhite} strokeWidth={2.4} />
            </TouchableOpacity>
          </SafeAreaView>

          {previewZoomImage && (
            <Image
              source={{ uri: previewZoomImage }}
              style={styles.zoomFullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* ─── In-Context Waybill Modal ───────────────────────────────────── */}
      {displayErrand && (
        <WaybillModal
          visible={showWaybill}
          onClose={() => setShowWaybill(false)}
          errand={displayErrand}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bgGray,
  },
  threadBar: {
    ...ScreenLayout.frame,
    flexGrow: 0,
    backgroundColor: Colors.textWhite,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(11, 19, 43, 0.08)',
  },
  threadBarContent: {
    paddingHorizontal: ScreenSpacing.horizontal,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  threadTab: {
    minHeight: 48,
    maxWidth: 180,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(11, 19, 43, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadTabSelected: {
    backgroundColor: Colors.navy,
    borderColor: Colors.navy,
  },
  threadTabText: {
    color: Colors.navy,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  threadTabTextSelected: {
    color: Colors.textWhite,
  },
  header: {
    ...ScreenLayout.header,
    backgroundColor: Colors.navy,
    flexWrap: 'wrap',
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    minWidth: 180,
  },
  backButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -Spacing.xs,
  },
  dispatcherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  dispatcherTextCol: {
    flex: 1,
  },
  dispatcherName: {
    color: Colors.textWhite,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
  },
  onlineBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.onlineDot,
  },
  onlineLabel: {
    color: Colors.navyLight,
    fontSize: FontSizes.xs - 1,
    fontWeight: FontWeights.medium,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
    marginLeft: 'auto',
    flexShrink: 1,
    maxWidth: '100%',
  },
  errandContextChip: {
    flexShrink: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    alignItems: 'flex-end',
  },
  errandIdText: {
    color: Colors.textWhite,
    fontFamily: 'monospace',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  errandStatusText: {
    color: Colors.navyLight,
    fontSize: FontSizes.xs - 2,
    fontWeight: FontWeights.medium,
  },
  waybillHeaderBtn: {
    minWidth: 48,
    minHeight: 48,
    backgroundColor: Colors.whiteOverlayLight,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageListContent: {
    ...ScreenLayout.frame,
    paddingHorizontal: ScreenSpacing.horizontal,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(15, 32, 53, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: Colors.navy,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textGray,
    textAlign: 'center',
    lineHeight: 18,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs + 2,
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  dispatcherAvatarWrapper: {
    marginBottom: 4,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  bubbleRider: {
    backgroundColor: Colors.navy,
    borderBottomRightRadius: BorderRadius.sm,
  },
  bubbleDispatcher: {
    backgroundColor: Colors.card,
    borderBottomLeftRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  senderLabel: {
    fontSize: FontSizes.xs - 1,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    marginBottom: 3,
  },
  messageText: {
    fontSize: FontSizes.sm,
    lineHeight: 19,
  },
  messageTextRider: {
    color: Colors.textWhite,
  },
  messageTextDispatcher: {
    color: Colors.textDark,
  },
  messageTimestamp: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  messageTimestampRider: {
    color: Colors.navyLight,
  },
  messageTimestampDispatcher: {
    color: Colors.textLight,
  },
  imageThumbnailContainer: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginBottom: 4,
  },
  imageThumbnail: {
    width: moderateScale(220, 0.3),
    maxWidth: '100%',
    height: moderateScale(150, 0.3),
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgDark,
  },
  composerDock: {
    ...ScreenLayout.actionDock,
    backgroundColor: Colors.card,
    borderTopColor: Colors.border,
  },
  photoDraftPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  draftThumbnailWrapper: {
    position: 'relative',
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
  },
  draftThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: BorderRadius.sm,
  },
  draftRemoveBtn: {
    position: 'absolute',
    top: -10,
    right: -10,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftRemoveBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftPhotoLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textGray,
    flex: 1,
  },
  processingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  processingText: {
    flexShrink: 1,
    fontSize: FontSizes.xs,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs + 2,
  },
  attachBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.bgGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  composerInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 110,
    backgroundColor: Colors.bgGray,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingTop: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs + 2,
    paddingBottom: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs + 2,
    fontSize: FontSizes.sm,
    color: Colors.textDark,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  sendBtnDisabled: {
    backgroundColor: Colors.border,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  actionSheetContent: {
    ...ScreenLayout.frame,
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  actionSheetTitle: {
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold,
    color: Colors.navy,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  actionSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 52,
  },
  actionSheetIconBox: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetTextCol: {
    flex: 1,
  },
  actionSheetOptionTitle: {
    fontSize: FontSizes.sm + 1,
    fontWeight: FontWeights.semibold,
    color: Colors.textDark,
  },
  actionSheetOptionSubtitle: {
    fontSize: FontSizes.xs,
    color: Colors.textGray,
    marginTop: 1,
  },
  actionSheetCancelBtn: {
    minHeight: 48,
    backgroundColor: Colors.bgGray,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  actionSheetCancelText: {
    fontSize: FontSizes.sm + 1,
    fontWeight: FontWeights.semibold,
    color: Colors.textDark,
  },
  zoomModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomHeaderBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 10,
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  zoomCloseBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomFullImage: {
    width: '100%',
    height: '80%',
  },
});
