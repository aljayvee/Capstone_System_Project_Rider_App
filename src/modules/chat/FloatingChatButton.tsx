import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { Colors, Elevation } from '../../config/theme';

/** Clears the tab bar on screens with nothing else above it. */
const DEFAULT_BOTTOM_OFFSET = 96;

export interface FloatingChatButtonProps {
  onPress: () => void;
  hasUnread?: boolean;
  unread?: boolean;
  visible?: boolean;
  /**
   * How far to sit above the bottom of the screen.
   *
   * This was a hardcoded 80, chosen to clear a tab bar that no longer has that
   * height and, on the Task tab, is not the thing being cleared at all — the
   * button now floats above a bottom sheet whose collapsed height the caller
   * knows and this component cannot.
   */
  bottomOffset?: number;
}

export function FloatingChatButton({
  onPress,
  hasUnread,
  unread,
  visible = true,
  bottomOffset = DEFAULT_BOTTOM_OFFSET,
}: FloatingChatButtonProps) {
  const isUnread = hasUnread || unread;
  if (!visible) return null;

  return (
    <TouchableOpacity
      style={[styles.container, { bottom: bottomOffset }]}
      accessibilityRole="button"
      accessibilityLabel={unread ? 'Message the dispatcher, you have unread messages' : 'Message the dispatcher'}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <MessageCircle size={22} color={Colors.textWhite} />
      {isUnread && (
        <View style={styles.unreadDot} />
      )}
    </TouchableOpacity>
  );
}


const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    width: 52,
    height: 52,
    backgroundColor: Colors.navy,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    // Must exceed BottomSheet's elevation (12) or Android paints the sheet
    // over this button whenever their boxes intersect, regardless of zIndex.
    elevation: Elevation.floatingControls,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 40,
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 14,
    height: 14,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.bgWhite,
    borderRadius: 7,
  }
});

export default FloatingChatButton;

