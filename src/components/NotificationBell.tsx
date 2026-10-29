import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Bell } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights } from '../config/theme';
import { useNotifications } from '../hooks/useNotifications';

// Replaces RiderHeader's previously-unwired bell (it mirrored mission.unreadDR,
// the dispatcher-chat-unread signal already surfaced separately by
// FloatingChatButton) with real notification history — closes REQ037.
//
// Opens the Notifications screen (2026-10-22). It used to open a modal sheet
// whose rows could not be tapped, filtered or sorted.
export function NotificationBell() {
  const { unreadCount } = useNotifications();
  const navigation = useNavigation<any>();

  return (
    <TouchableOpacity
      style={styles.iconButton}
      onPress={() => navigation.navigate('Notifications')}
      testID="rider-notification-bell"
      accessibilityRole="button"
      accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      activeOpacity={0.75}
    >
      <Bell size={20} color={Colors.navy} strokeWidth={2.2} />
      {unreadCount > 0 && (
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText} maxFontSizeMultiplier={1.15}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badgeContainer: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    borderWidth: 1.5,
    borderColor: Colors.bgWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: Colors.textWhite, fontSize: FontSizes.xs, fontWeight: FontWeights.extrabold },
});
