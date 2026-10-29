import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  AlertCircle,
  ArrowUpDown,
  Bell,
  Bike,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  MessageSquare,
  Package,
  RotateCcw,
  Search,
  Wallet,
  X,
} from 'lucide-react-native';
import { BorderRadius, Colors, FontFamily, Spacing, TOUCH_TARGET, scaledFontSize, type ThemeColors } from '../../config/theme';
import { useRiderNotifications } from '../../context/RiderNotificationContext';
import { useRiderMissionContext } from '../../context/RiderMissionContext';
import ShimmerWave from '../../components/ShimmerWave';
import type { AuthedStackParamList } from '../../navigation/AuthedNavigator';
import {
  TOPIC_LABEL,
  actionNeeded,
  formatNotificationTime,
  matchesFilter,
  routeForRiderNotification,
  sectionsFor,
  topicOf,
  type RiderNotification,
  type RiderNotificationFilter,
  type RiderNotificationSort,
  type RiderTopic,
} from '../../utils/riderNotifications';

/**
 * The rider's notifications as a screen (2026-10-22), replacing the modal that
 * hung off the Home bell. Organised like the customer's: topic chips plus an
 * "Action needed" tag, no severity levels, and a Sort by menu.
 */

const FILTERS: Array<{ key: Exclude<RiderNotificationFilter, 'ALL'>; label: string }> = [
  { key: 'ACTION', label: 'Action needed' },
  { key: 'OFFER', label: 'Offers' },
  { key: 'ERRAND', label: 'Errand' },
  { key: 'PAYMENT', label: 'Payment' },
  { key: 'CHAT', label: 'Chat' },
];

const SORT_OPTIONS: Array<{ key: RiderNotificationSort; label: string }> = [
  { key: 'NEWEST', label: 'Newest first' },
  { key: 'OLDEST', label: 'Oldest first' },
  { key: 'ACTION', label: 'Action needed first' },
  { key: 'UNREAD', label: 'Unread first' },
];

const TOPIC_ICON: Record<RiderTopic, typeof Package> = {
  OFFER: Bike,
  ERRAND: Package,
  PAYMENT: Wallet,
  CHAT: MessageSquare,
};

const EMPTY_COPY: Record<RiderNotificationFilter, { title: string; body: string }> = {
  ALL: { title: 'No notifications yet', body: 'Offers, errand changes, payments and dispatcher messages will show here.' },
  ACTION: { title: 'Nothing needs you', body: 'When something waits on you, like an offer or a changed list, it shows here.' },
  OFFER: { title: 'No offers', body: 'New errand offers and expired ones will show here.' },
  ERRAND: { title: 'No errand updates', body: 'Approved or changed items, cancellations and holds will show here.' },
  PAYMENT: { title: 'No payment updates', body: 'Confirmed payments and settled extra charges will show here.' },
  CHAT: { title: 'No messages', body: 'Messages from dispatch will show here.' },
};

type Navigation = StackNavigationProp<AuthedStackParamList, 'Notifications'>;

export default function NotificationsScreen() {
  const navigation = useNavigation<Navigation>();
  // Light only, like the rest of the rider app: it has no dark mode, so the
  // phone's system theme must not repaint this screen.
  const colors = Colors;
  const { notifications, unreadCount, isLoading, error, markRead, markAllRead, refresh } = useRiderNotifications();
  const { activeErrands } = useRiderMissionContext();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RiderNotificationFilter>('ALL');
  const [sort, setSort] = useState<RiderNotificationSort>('NEWEST');
  const [sortOpen, setSortOpen] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handlePress = async (item: RiderNotification) => {
    if (!item.isRead) await markRead(item.id);
    const route = routeForRiderNotification(item, (activeErrands ?? []).map((errand) => String(errand.id)));
    if (route.kind === 'chat') navigation.navigate('DispatcherChat');
    else if (route.kind === 'home') navigation.navigate('Tabs');
    else if (route.kind === 'task') navigation.navigate('Task');
    else if (route.kind === 'details') navigation.navigate('ErrandDetails', { errandId: route.errandId });
  };

  const counts = useMemo(() => {
    const result = { ALL: notifications.length } as Record<RiderNotificationFilter, number>;
    for (const { key } of FILTERS) result[key] = notifications.filter((n) => matchesFilter(n, key)).length;
    return result;
  }, [notifications]);

  const query = search.trim().toLowerCase();
  const sections = useMemo(() => {
    const visible = notifications
      .filter((n) => matchesFilter(n, filter))
      .filter((n) => !query || `${n.title} ${n.body}`.toLowerCase().includes(query));
    return sectionsFor(visible, sort);
  }, [notifications, filter, query, sort]);

  const sortLabel = SORT_OPTIONS.find((option) => option.key === sort)?.label ?? 'Newest first';
  const showSkeleton = isLoading && notifications.length === 0;
  const showFullError = error && notifications.length === 0 && !isLoading;
  const empty = EMPTY_COPY[filter];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="notifications-back"
        >
          <ChevronLeft size={22} color={colors.textDark} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Text style={styles.title} maxFontSizeMultiplier={1.2}>
            Notifications
          </Text>
          {unreadCount > 0 && (
            <View style={styles.unreadPill} testID="notifications-unread-pill">
              <Text style={styles.unreadPillText} maxFontSizeMultiplier={1.15}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </View>
        {unreadCount > 0 ? (
          <TouchableOpacity
            onPress={() => void markAllRead()}
            style={styles.headerAction}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
            testID="notifications-read-all"
          >
            <Text style={styles.headerActionText} maxFontSizeMultiplier={1.2}>
              Read all
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.iconButton} />
        )}
      </View>

      <View style={styles.body}>
        {/* Search */}
        <View style={styles.searchBar}>
          <Search size={16} color={colors.textGray} strokeWidth={2.2} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search notifications"
            placeholderTextColor={colors.textLight}
            value={search}
            onChangeText={setSearch}
            accessibilityLabel="Search notifications"
            testID="notifications-search"
            maxFontSizeMultiplier={1.25}
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              style={styles.clearButton}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              testID="notifications-search-clear"
            >
              <X size={14} color={colors.textMedium} />
            </TouchableOpacity>
          )}
        </View>

        {/* Topic chips: none selected = everything; tap the selected one again to clear. */}
        <View style={styles.filterSection}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={FILTERS}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.filterList}
            renderItem={({ item: chip }) => {
              const active = filter === chip.key;
              return (
                <TouchableOpacity
                  onPress={() => setFilter(active ? 'ALL' : chip.key)}
                  style={[styles.chip, active && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${chip.label}, ${counts[chip.key]}`}
                  testID={`notifications-filter-${chip.key}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]} maxFontSizeMultiplier={1.15}>
                    {chip.label}
                  </Text>
                  <Text
                    style={[styles.chipCount, active && styles.chipTextActive]}
                    maxFontSizeMultiplier={1.15}
                    testID={`notifications-filter-count-${chip.key}`}
                  >
                    {counts[chip.key]}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Sort by */}
        <View style={styles.sortRow}>
          <Text style={styles.sortSummary} maxFontSizeMultiplier={1.15}>
            {filter === 'ALL' ? `${counts.ALL} notifications` : `${counts[filter]} of ${counts.ALL}`}
          </Text>
          <TouchableOpacity
            onPress={() => setSortOpen((open) => !open)}
            style={styles.sortButton}
            accessibilityRole="button"
            accessibilityLabel={`Sort by, ${sortLabel}`}
            accessibilityState={{ expanded: sortOpen }}
            testID="notifications-sort-button"
          >
            <ArrowUpDown size={14} color={colors.textMedium} />
            <Text style={styles.sortButtonText} maxFontSizeMultiplier={1.2}>
              Sort by: {sortLabel}
            </Text>
            <ChevronDown size={14} color={colors.textMedium} />
          </TouchableOpacity>
        </View>
        {sortOpen && (
          <View style={styles.sortMenu} testID="notifications-sort-menu">
            {SORT_OPTIONS.map((option) => {
              const selected = option.key === sort;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => {
                    setSort(option.key);
                    setSortOpen(false);
                  }}
                  style={styles.sortOption}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`notifications-sort-${option.key}`}
                >
                  <Text style={[styles.sortOptionText, selected && styles.sortOptionSelected]} maxFontSizeMultiplier={1.2}>
                    {option.label}
                  </Text>
                  {selected && <Check size={16} color={colors.primaryStrong} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* A failed refresh over a list already shown: say so, keep the list. */}
        {error && notifications.length > 0 && (
          <View style={styles.inlineError} testID="notifications-refresh-error">
            <AlertCircle size={14} color={colors.danger} />
            <Text style={styles.inlineErrorText} maxFontSizeMultiplier={1.15}>
              Could not refresh. These may be out of date.
            </Text>
            <TouchableOpacity onPress={() => void refresh()} accessibilityRole="button" testID="notifications-refresh-retry">
              <Text style={styles.inlineErrorAction} maxFontSizeMultiplier={1.2}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {showSkeleton ? (
          <View testID="notifications-skeleton">
            {Array.from({ length: 5 }).map((_, index) => (
              <View key={index} style={styles.row}>
                <ShimmerWave width={24} height={24} borderRadius={6} />
                <View style={styles.rowContent}>
                  <ShimmerWave width="62%" height={14} />
                  <ShimmerWave width="92%" height={12} style={styles.skeletonGap} />
                  <ShimmerWave width="35%" height={10} style={styles.skeletonGap} />
                </View>
              </View>
            ))}
          </View>
        ) : showFullError ? (
          <View style={styles.stateFrame} testID="notifications-error">
            <AlertCircle size={26} color={colors.danger} />
            <Text style={styles.stateTitle} maxFontSizeMultiplier={1.2}>
              Notifications did not load
            </Text>
            <Text style={styles.stateBody} maxFontSizeMultiplier={1.25}>
              Check your connection and try again.
            </Text>
            <TouchableOpacity
              onPress={() => void refresh()}
              style={styles.stateButton}
              accessibilityRole="button"
              testID="notifications-error-retry"
            >
              <RotateCcw size={15} color={colors.onPrimary} />
              <Text style={styles.stateButtonText} maxFontSizeMultiplier={1.2}>
                Try again
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => String(item.id)}
            stickySectionHeadersEnabled={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[styles.listContent, sections.length === 0 && styles.listContentEmpty]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} tintColor={colors.primary} />
            }
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionHeader} maxFontSizeMultiplier={1.15} testID={`notifications-section-${section.title}`}>
                {section.title}
              </Text>
            )}
            ListEmptyComponent={
              <View style={styles.stateFrame} testID="notifications-empty">
                <Bell size={26} color={colors.textGray} strokeWidth={1.8} />
                <Text style={styles.stateTitle} maxFontSizeMultiplier={1.2}>
                  {query ? 'No matches' : empty.title}
                </Text>
                <Text style={styles.stateBody} maxFontSizeMultiplier={1.25}>
                  {query ? `Nothing here matches "${search.trim()}".` : empty.body}
                </Text>
                {query ? (
                  <TouchableOpacity
                    onPress={() => setSearch('')}
                    style={[styles.stateButton, styles.stateButtonSecondary]}
                    accessibilityRole="button"
                    testID="notifications-empty-clear-search"
                  >
                    <Text style={[styles.stateButtonText, styles.stateButtonSecondaryText]} maxFontSizeMultiplier={1.2}>
                      Clear search
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            }
            renderItem={({ item }) => {
              const topic = topicOf(item);
              const Icon = TOPIC_ICON[topic];
              const waiting = actionNeeded(item);
              return (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => void handlePress(item)}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.isRead ? '' : 'Unread. '}${waiting ? 'Action needed. ' : ''}${item.title}. ${item.body}`}
                  testID={`notifications-row-${item.id}`}
                >
                  <View style={styles.iconBox}>
                    <Icon size={20} color={item.isRead ? colors.textLight : colors.textMedium} strokeWidth={2} />
                  </View>
                  <View style={styles.rowContent}>
                    <View style={styles.rowTitleLine}>
                      <Text style={[styles.rowTitle, !item.isRead && styles.rowTitleUnread]} numberOfLines={2} maxFontSizeMultiplier={1.2}>
                        {item.title}
                      </Text>
                      {!item.isRead && <View style={styles.unreadDot} testID={`notifications-unread-${item.id}`} />}
                    </View>
                    <Text style={styles.rowBody} numberOfLines={2} maxFontSizeMultiplier={1.25}>
                      {item.body}
                    </Text>
                    <View style={styles.metaLine}>
                      {waiting && (
                        <View style={styles.actionChip} testID={`notifications-action-${item.id}`}>
                          <Text style={styles.actionChipText} maxFontSizeMultiplier={1.15}>
                            Action needed
                          </Text>
                        </View>
                      )}
                      <Text style={styles.metaText} maxFontSizeMultiplier={1.15}>
                        {TOPIC_LABEL[topic]} · {formatNotificationTime(item.createdAt)}
                      </Text>
                      {!item.isRead && (
                        <TouchableOpacity
                          onPress={() => void markRead(item.id)}
                          style={styles.markRead}
                          accessibilityRole="button"
                          accessibilityLabel={`Mark ${item.title} as read`}
                          testID={`notifications-mark-read-${item.id}`}
                        >
                          <CheckCheck size={16} color={colors.textGray} strokeWidth={2.2} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgApp },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
    },
    iconButton: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    title: { fontFamily: FontFamily.bold, fontSize: scaledFontSize(17), color: colors.textDark },
    unreadPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: BorderRadius.full, backgroundColor: colors.primary },
    unreadPillText: { fontFamily: FontFamily.bold, fontSize: scaledFontSize(12), color: colors.onPrimary },
    headerAction: { minHeight: TOUCH_TARGET, paddingHorizontal: Spacing.sm, justifyContent: 'center' },
    headerActionText: { fontFamily: FontFamily.semibold, fontSize: scaledFontSize(14), color: colors.primaryStrong },
    body: { flex: 1, paddingHorizontal: Spacing.lg },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: TOUCH_TARGET,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    searchInput: { flex: 1, fontFamily: FontFamily.regular, fontSize: scaledFontSize(15), color: colors.textDark, padding: 0 },
    clearButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    filterSection: { paddingVertical: Spacing.sm },
    filterList: { gap: 6 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 40,
      paddingHorizontal: 12,
      borderRadius: BorderRadius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
    chipText: { fontFamily: FontFamily.medium, fontSize: scaledFontSize(13), color: colors.textDark },
    chipCount: { fontFamily: FontFamily.semibold, fontSize: scaledFontSize(12), color: colors.textGray },
    chipTextActive: { color: colors.onNavy, fontFamily: FontFamily.bold },
    sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
    sortSummary: { fontFamily: FontFamily.regular, fontSize: scaledFontSize(12), color: colors.textGray },
    sortButton: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40 },
    sortButtonText: { fontFamily: FontFamily.semibold, fontSize: scaledFontSize(13), color: colors.textDark },
    sortMenu: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BorderRadius.md,
      backgroundColor: colors.card,
      marginBottom: Spacing.sm,
      overflow: 'hidden',
    },
    sortOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: TOUCH_TARGET,
      paddingHorizontal: Spacing.md,
    },
    sortOptionText: { fontFamily: FontFamily.medium, fontSize: scaledFontSize(15), color: colors.textDark },
    sortOptionSelected: { fontFamily: FontFamily.bold, color: colors.primaryStrong },
    inlineError: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
      backgroundColor: colors.dangerBg,
      marginBottom: Spacing.xs,
    },
    inlineErrorText: { flex: 1, fontFamily: FontFamily.medium, fontSize: scaledFontSize(13), color: colors.danger },
    inlineErrorAction: { fontFamily: FontFamily.bold, fontSize: scaledFontSize(13), color: colors.danger, paddingHorizontal: 4 },
    skeletonGap: { marginTop: 8 },
    listContent: { paddingBottom: Spacing.huge * 2 },
    listContentEmpty: { flexGrow: 1 },
    sectionHeader: {
      fontFamily: FontFamily.semibold,
      fontSize: scaledFontSize(13),
      color: colors.textGray,
      marginTop: Spacing.md,
      marginBottom: Spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm + 2,
      paddingVertical: Spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    iconBox: { width: 24, alignItems: 'center', paddingTop: 1 },
    rowContent: { flex: 1 },
    rowTitleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    rowTitle: { flex: 1, fontFamily: FontFamily.medium, fontSize: scaledFontSize(15), color: colors.textMedium },
    rowTitleUnread: { fontFamily: FontFamily.bold, color: colors.textDark },
    unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: colors.primary },
    rowBody: { fontFamily: FontFamily.regular, fontSize: scaledFontSize(13), color: colors.textGray, marginTop: 2, lineHeight: 19 },
    metaLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    actionChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full, backgroundColor: colors.primarySurface },
    actionChipText: { fontFamily: FontFamily.bold, fontSize: scaledFontSize(12), color: colors.primaryStrong },
    metaText: { flex: 1, fontFamily: FontFamily.regular, fontSize: scaledFontSize(12), color: colors.textLight },
    markRead: { width: 40, height: 32, alignItems: 'center', justifyContent: 'center' },
    stateFrame: { alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: Spacing.xxl, gap: 6 },
    stateTitle: { fontFamily: FontFamily.bold, fontSize: scaledFontSize(16), color: colors.textDark, marginTop: Spacing.xs, textAlign: 'center' },
    stateBody: { fontFamily: FontFamily.regular, fontSize: scaledFontSize(13), color: colors.textGray, textAlign: 'center', lineHeight: 19 },
    stateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: TOUCH_TARGET,
      paddingHorizontal: Spacing.lg,
      borderRadius: BorderRadius.md,
      backgroundColor: colors.primary,
      marginTop: Spacing.md,
    },
    stateButtonText: { fontFamily: FontFamily.semibold, fontSize: scaledFontSize(14), color: colors.onPrimary },
    stateButtonSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
    stateButtonSecondaryText: { color: colors.textDark },
  });

const styles = makeStyles(Colors);
