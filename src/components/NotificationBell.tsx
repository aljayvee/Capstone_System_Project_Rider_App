import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList } from 'react-native';
import { Bell, X, CheckCheck } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../config/theme';
import { useNotifications, type RiderNotification } from '../hooks/useNotifications';

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Replaces RiderHeader's previously-unwired bell (it mirrored mission.unreadDR,
// the dispatcher-chat-unread signal already surfaced separately by
// FloatingChatButton) with real notification history — closes REQ037.
export function NotificationBell() {
  const { notifications, unreadCount, isLoading, markRead } = useNotifications();
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={styles.iconButton}
        onPress={() => setVisible(true)}
        testID="rider-notification-bell"
        activeOpacity={0.75}
      >
        <Bell size={20} color={Colors.primary} strokeWidth={2.2} />
        {unreadCount > 0 && (
          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>Notifications</Text>
              <TouchableOpacity onPress={() => setVisible(false)} testID="close-notifications">
                <X size={20} color={Colors.textGray} />
              </TouchableOpacity>
            </View>

            {isLoading && notifications.length === 0 ? (
              <Text style={styles.emptyText}>Loading...</Text>
            ) : notifications.length === 0 ? (
              <Text style={styles.emptyText}>No notifications yet.</Text>
            ) : (
              <FlatList
                data={notifications}
                keyExtractor={(item) => String(item.id)}
                style={styles.list}
                renderItem={({ item }: { item: RiderNotification }) => (
                  <View style={[styles.item, !item.isRead && styles.itemUnread]}>
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      {!item.isRead && (
                        <TouchableOpacity onPress={() => markRead(item.id)} hitSlop={8}>
                          <CheckCheck size={15} color={Colors.blue} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={styles.itemBody}>{item.body}</Text>
                    <Text style={styles.itemTime}>{timeAgo(item.createdAt)}</Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.bgWhite,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    position: 'relative',
  },
  badgeContainer: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    borderWidth: 1.5,
    borderColor: Colors.bgWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: Colors.textWhite, fontSize: 9, fontWeight: FontWeights.extrabold },
  overlay: { flex: 1, backgroundColor: Colors.overlayDark, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.bgWhite,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    maxHeight: '75%',
    paddingBottom: Spacing.huge,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  title: { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textDark },
  emptyText: { fontSize: FontSizes.md, color: Colors.textGray, textAlign: 'center', paddingVertical: Spacing.xxl },
  list: { maxHeight: 420 },
  item: { paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  itemUnread: { backgroundColor: Colors.blueBg },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm },
  itemTitle: { fontSize: FontSizes.md, fontWeight: FontWeights.bold, color: Colors.textDark, flex: 1 },
  itemBody: { fontSize: FontSizes.base, color: Colors.textGray, marginTop: 2 },
  itemTime: { fontSize: FontSizes.xxs, color: Colors.textLight, marginTop: 4 },
});
