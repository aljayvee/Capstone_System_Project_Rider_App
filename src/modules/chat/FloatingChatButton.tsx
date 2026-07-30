import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { Colors } from '../../config/theme';

export interface FloatingChatButtonProps {
  onPress: () => void;
  hasUnread?: boolean;
  unread?: boolean;
  visible?: boolean;
}

export function FloatingChatButton({
  onPress,
  hasUnread,
  unread,
  visible = true
}: FloatingChatButtonProps) {
  const isUnread = hasUnread || unread;
  if (!visible) return null;

  return (
    <TouchableOpacity
      style={styles.container}
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
    bottom: 80, 
    right: 16,
    width: 52,
    height: 52,
    backgroundColor: Colors.navy,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
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

