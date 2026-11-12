import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Alert } from 'react-native';
import {
  ClipboardList,
  Camera,
  MapPin,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  PackageX,
} from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';
import { StatusStep, Errand, MergedErrand, ItemFulfillmentStatus } from '../../../types/rider';
import { requestSections, type RequestSection } from '../../../services/requestSections';
import { formatItemLabel } from '../../../utils/format';
import { riderApiService } from '../../../config/apiConfig';
import { TaskSheetColors } from '../../../config/taskSheetTheme';

interface RequestItemsPanelProps {
  errand?: MergedErrand | Errand;
  currentStatus: StatusStep;
  completedSubtasks: Record<number, boolean>;
  uploadingSubtask: number | null;
  onUpload?: (section: RequestSection, index: number) => void;
  /** The shop printed nothing — see the no-receipt path in proofCapture. */
  onNoReceipt?: (section: RequestSection, index: number) => void;
  /** The pinned stop the rider's geofence currently targets, or has reached. */
  activeStoreTargetId?: number | null;
  /** Stops the rider has already reached (or left) this run. */
  visitedPinpointIds?: number[];
  /** Allow collapsing the panel when in delivery phase */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /**
   * A queued errand, shown for reference. Nothing on it can be checked or
   * photographed until it is the errand in hand: the receipt would be filed
   * against this errand while the step it advanced belonged to another.
   */
  readOnly?: boolean;
}

interface PendingItemConfirmation {
  key: string;
  itemId?: number;
  itemName: string;
  quantity?: number;
  currentStatus: ItemFulfillmentStatus;
  targetStatus: ItemFulfillmentStatus;
  storeTitle?: string | null;
}

export function RequestItemsPanel({
  errand,
  currentStatus,
  completedSubtasks,
  uploadingSubtask,
  onUpload,
  onNoReceipt,
  activeStoreTargetId = null,
  visitedPinpointIds = [],
  collapsible = false,
  defaultCollapsed = false,
  readOnly = false,
}: RequestItemsPanelProps) {
  const sections = requestSections(errand);
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const [itemStatuses, setItemStatuses] = React.useState<Record<string, ItemFulfillmentStatus>>({});
  const savingItems = React.useRef(new Set<string>());
  const [pendingConfirmation, setPendingConfirmation] = React.useState<PendingItemConfirmation | null>(null);

  // Synchronize itemStatuses from server-provided itemEntries whenever the errand updates.
  // Keying by (id, itemName, size, quantity) guarantees that if the dispatcher modifies an item
  // (changing its name/size/quantity or resetting fulfillmentStatus to PENDING), its checkbox
  // immediately becomes available again in Sugo Rider.
  const getItemKey = (
    entry: { id?: number; itemName?: string; size?: string | null; quantity?: number } | undefined,
    secIdx: number,
    lineIdx: number
  ) =>
    entry?.id
      ? `id-${entry.id}-${entry.itemName ?? ''}-${entry.size ?? ''}-${entry.quantity ?? 1}`
      : `${secIdx}-${lineIdx}-${entry?.itemName ?? ''}-${entry?.size ?? ''}-${entry?.quantity ?? 1}`;

  React.useEffect(() => {
    if (!sections.length) return;
    const synced: Record<string, ItemFulfillmentStatus> = {};
    sections.forEach((sec, secIdx) => {
      (sec.itemEntries ?? []).forEach((entry, lineIdx) => {
        const key = getItemKey(entry, secIdx, lineIdx);
        synced[key] = entry.fulfillmentStatus ?? 'PENDING';
      });
    });
    setItemStatuses(synced);
  }, [errand]);

  if (sections.length === 0) return null;

  // When the status in the Rider App is "On the Way to the Customer" (Delivering) or Delivered,
  // no modification of items order is allowed.
  const isOnTheWayToCustomer =
    currentStatus === 'Delivering' || currentStatus === 'Delivered';

  // Single-Store Focused Item View:
  // When in shopping phase (Traveling / At Store), display only the items and instructions
  // for the store the rider is currently navigating to or shopping at (activeStoreTargetId).
  // In delivery phase (Delivering / Delivered), all items are displayed in the summary accordion.
  const visibleSectionsWithIndex = React.useMemo(() => {
    const indexed = sections.map((section, originalIndex) => ({
      section,
      originalIndex,
    }));
    if (isOnTheWayToCustomer) {
      return indexed;
    }
    if (activeStoreTargetId != null) {
      const matched = indexed.filter(
        (item) => item.section.pinpointId === activeStoreTargetId
      );
      if (matched.length > 0) return matched;
    }
    // Fallback: first uncompleted section, or first section
    const uncompleted = indexed.find(
      (item) => !completedSubtasks[item.originalIndex]
    );
    return uncompleted ? [uncompleted] : indexed.slice(0, 1);
  }, [sections, activeStoreTargetId, isOnTheWayToCustomer, completedSubtasks]);

  const totalLinesCount = visibleSectionsWithIndex.reduce((acc, { section }) => acc + section.lines.length, 0);

  const setStatusForItem = async (
    key: string,
    itemId: number | undefined,
    currentItemStatus: ItemFulfillmentStatus,
    nextStatus: ItemFulfillmentStatus
  ) => {
    // Once checked/cancelled out, it cannot be unchecked or rechecked by the rider.
    // It only becomes available again if modified by the dispatcher.
    if (readOnly || isOnTheWayToCustomer || currentItemStatus !== 'PENDING' || savingItems.current.has(key)) {
      return;
    }
    savingItems.current.add(key);
    let saved = true;
    if (errand?.id && itemId && Number.isInteger(itemId) && itemId > 0) {
      saved = await riderApiService.updateItemFulfillmentStatus(errand.id, itemId, nextStatus).catch(() => false);
    }
    savingItems.current.delete(key);
    if (!saved) {
      Alert.alert('Item not saved', 'Could not save the item status. Try marking it again before taking a receipt photo.');
      return;
    }
    // Keep the receipt gate closed until the server has acknowledged the mark.
    setItemStatuses((prev) => ({ ...prev, [key]: nextStatus }));
  };

  const handleItemPress = (
    key: string,
    itemId: number | undefined,
    itemName: string,
    quantity: number | undefined,
    currentItemStatus: ItemFulfillmentStatus,
    targetStatus: ItemFulfillmentStatus,
    storeTitle?: string | null
  ) => {
    if (readOnly || isOnTheWayToCustomer || currentItemStatus !== 'PENDING') {
      return;
    }
    setPendingConfirmation({
      key,
      itemId,
      itemName,
      quantity,
      currentStatus: currentItemStatus,
      targetStatus,
      storeTitle,
    });
  };

  const handleConfirmStatusChange = () => {
    if (!pendingConfirmation) return;
    const { key, itemId, currentStatus: curr, targetStatus } = pendingConfirmation;
    void setStatusForItem(key, itemId, curr, targetStatus);
    setPendingConfirmation(null);
  };

  const handleCancelConfirmation = () => {
    setPendingConfirmation(null);
  };

  // The receipt is filed when the shopping is done, so the button only appears
  // once the rider is at the store. Before that there is nothing to photograph.
  const isAtStore = !readOnly && currentStatus === 'At Store';

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        activeOpacity={collapsible ? 0.7 : 1}
        onPress={collapsible ? () => setCollapsed(!collapsed) : undefined}
        accessibilityRole={collapsible ? 'button' : undefined}
        accessibilityLabel={
          collapsible
            ? collapsed
              ? `Expand purchased items, ${totalLinesCount} items`
              : `Collapse purchased items, ${totalLinesCount} items`
            : undefined
        }
      >
        <View style={styles.headerLeft}>
          <ClipboardList size={18} color={Colors.navy} />
          <Text style={styles.headerTitle} maxFontSizeMultiplier={1.25}>
            {collapsible && collapsed
              ? `Purchased Items (${totalLinesCount})`
              : 'Request Items & Instructions'}
          </Text>
        </View>
        {collapsible && (
          <View style={styles.collapseToggle}>
            <Text style={styles.collapseToggleText} maxFontSizeMultiplier={1.25}>
              {collapsed ? 'Show' : 'Hide'}
            </Text>
            {collapsed ? (
              <ChevronDown size={14} color={Colors.textGray} />
            ) : (
              <ChevronUp size={14} color={Colors.textGray} />
            )}
          </View>
        )}
      </TouchableOpacity>

      {!collapsed && (
        <View style={styles.content}>
          {visibleSectionsWithIndex.map(({ section, originalIndex }) => {
            const isCompleted = completedSubtasks[originalIndex];
            const isUploading = uploadingSubtask === originalIndex;
            // First-come-first-serve: a section pinned to a real stop is locked
            // until the rider's geofence has targeted or already reached it.
            // Sections with no pinpoint (legacy free-text errands) carry no
            // location data at all, so there's nothing to gate them on.
            // Being the store the rider is heading to is not being there: while
            // still Traveling the list is shown for reference only. It used to
            // unlock the moment the errand was accepted, so items could be
            // marked bought (and saved on the server) from the road.
            const isVisited =
              section.pinpointId != null && visitedPinpointIds.includes(section.pinpointId);
            const isLocked =
              readOnly ||
              (currentStatus === 'Traveling' && !isVisited) ||
              (section.pinpointId != null &&
                section.pinpointId !== activeStoreTargetId &&
                !isVisited);

            const sectionStatuses = section.lines.map((_, lineIdx) => {
              const entry = section.itemEntries?.[lineIdx];
              const key = getItemKey(entry, originalIndex, lineIdx);
              return itemStatuses[key] ?? entry?.fulfillmentStatus ?? 'PENDING';
            });
            const boughtCount = sectionStatuses.filter((s) => s === 'PURCHASED').length;
            const oosCount = sectionStatuses.filter((s) => s === 'OUT_OF_STOCK').length;
            const pendingCount = sectionStatuses.filter((s) => s === 'PENDING').length;
            const allItemsChecked = section.lines.length === 0 || pendingCount === 0;

            return (
              <View key={originalIndex} style={[styles.itemBox, isLocked && styles.itemBoxLocked]}>
                {section.title && <Text style={styles.itemTitle} maxFontSizeMultiplier={1.25}>{section.title}</Text>}
                {/* Store, then what kind of store, then what to buy there. The
                    category is the dispatcher's, not a guess — a stop pinned off
                    the catalogue simply has no line rather than a made-up one. */}
                {section.storeCategory && (
                  <Text style={styles.itemCategory} maxFontSizeMultiplier={1.25}>{section.storeCategory}</Text>
                )}
                {section.lines.map((line, lineIdx) => {
                  const entry = section.itemEntries?.[lineIdx];
                  const itemKey = getItemKey(entry, originalIndex, lineIdx);
                  const status: ItemFulfillmentStatus =
                    itemStatuses[itemKey] ?? entry?.fulfillmentStatus ?? 'PENDING';
                  const isPurchased = status === 'PURCHASED';
                  const isOutOfStock = status === 'OUT_OF_STOCK';
                  // Once checked (PURCHASED or OUT_OF_STOCK) or when On the Way to Customer,
                  // the item is cancelled out (line-through) and locked until modified by dispatcher.
                  const isItemFinalized = status !== 'PENDING';
                  const isRowDisabled = isLocked || isOnTheWayToCustomer || isItemFinalized;

                  return (
                    <View key={lineIdx} style={styles.itemRowContainer}>
                      <TouchableOpacity
                        style={styles.itemRow}
                        activeOpacity={isRowDisabled ? 1 : 0.7}
                        disabled={isRowDisabled}
                        onPress={() =>
                          handleItemPress(
                            itemKey,
                            entry?.id,
                            entry ? formatItemLabel(entry.itemName, entry.size) : line,
                            entry?.quantity,
                            status,
                            'PURCHASED',
                            section.title
                          )
                        }
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isPurchased, disabled: isRowDisabled }}
                        accessibilityLabel={`${line}, ${
                          isPurchased
                            ? 'checked and locked'
                            : isOutOfStock
                              ? 'out of stock and locked'
                              : 'unchecked'
                        }`}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            isPurchased && styles.checkboxChecked,
                            isOutOfStock && styles.checkboxOutOfStock,
                          ]}
                        >
                          {isPurchased && <Check size={11} color={Colors.bgWhite} strokeWidth={3} />}
                          {isOutOfStock && <X size={11} color={Colors.bgWhite} strokeWidth={3} />}
                        </View>
                        <View style={styles.itemTextCol}>
                          <Text
                            style={[
                              styles.itemText,
                              isPurchased && styles.itemTextChecked,
                              isOutOfStock && styles.itemTextOutOfStock,
                            ]}
                            maxFontSizeMultiplier={1.25}
                          >
                            {line}
                          </Text>
                          {/* The customer's instruction for this item. Never
                              struck through with the item: it still applies. */}
                          {entry?.notes ? (
                            <Text style={styles.itemNote} maxFontSizeMultiplier={1.25}>
                              {`Note: ${entry.notes}`}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>

                      {/* Stock action stays beside its item, with a separate touch target. */}
                      {(!isLocked && !isOnTheWayToCustomer && !isPurchased) || isPurchased ? (
                        <View style={styles.itemSubRow}>
                          {!isLocked && !isOnTheWayToCustomer && !isPurchased && (
                            <TouchableOpacity
                              style={[
                                styles.oosPill,
                                isOutOfStock && styles.oosPillActive,
                              ]}
                              activeOpacity={isItemFinalized ? 1 : 0.7}
                              disabled={isItemFinalized}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              onPress={() =>
                                handleItemPress(
                                  itemKey,
                                  entry?.id,
                                  entry ? formatItemLabel(entry.itemName, entry.size) : line,
                                  entry?.quantity,
                                  status,
                                  'OUT_OF_STOCK',
                                  section.title
                                )
                              }
                              accessibilityRole="button"
                              accessibilityLabel={
                                isOutOfStock
                                  ? `${line} marked out of stock and locked`
                                  : `Mark ${line} as out of stock`
                              }
                            >
                              <Text
                                style={[
                                  styles.oosPillText,
                                  isOutOfStock && styles.oosPillTextActive,
                                ]}
                                maxFontSizeMultiplier={1.25}
                              >
                                {isOutOfStock ? 'Out of Stock' : 'No Stock?'}
                              </Text>
                            </TouchableOpacity>
                          )}

                          {isPurchased && (
                            <Text style={styles.checklistSummaryText} maxFontSizeMultiplier={1.25}>
                              Checked
                            </Text>
                          )}
                        </View>
                      ) : null}
                    </View>
                  );
                })}

                {(boughtCount > 0 || oosCount > 0 || isOnTheWayToCustomer) && (
                  <View style={styles.checklistSummaryRow}>
                    <Text style={styles.checklistSummaryText} maxFontSizeMultiplier={1.25}>
                      {isOnTheWayToCustomer
                        ? `On the way to customer • Checklist locked (${boughtCount}/${section.lines.length} checked)`
                        : `Checklist: ${boughtCount}/${section.lines.length} checked${
                            oosCount > 0 ? ` • ${oosCount} out of stock` : ''
                          } • Checked items lock until modified by dispatcher`}
                    </Text>
                  </View>
                )}

                {isLocked ? (
                  <View style={styles.lockedNote}>
                    <MapPin size={12} color={Colors.textGray} />
                  <Text style={styles.lockedNoteText} maxFontSizeMultiplier={1.25}>
                    {readOnly ? 'Queued. Shop for this once it is your current errand.' : 'Reach this store first'}
                  </Text>
                </View>
              ) : (
                <>
                  {isAtStore && !isCompleted && !allItemsChecked && (
                    <View style={styles.pendingGateNotice}>
                      <AlertCircle size={14} color={Colors.warning} />
                      <Text style={styles.pendingGateNoticeText} maxFontSizeMultiplier={1.25}>
                        Check all items above ({pendingCount} remaining) before photographing receipt or reporting no receipt.
                      </Text>
                    </View>
                  )}

                  {isAtStore && (
                    <TouchableOpacity
                      disabled={isCompleted || isUploading}
                      onPress={() => {
                        if (!allItemsChecked) {
                          Alert.alert(
                            'Check All Items First',
                            `Please verify all ${section.lines.length} requested items for this store before taking a receipt photo (${pendingCount} item${pendingCount > 1 ? 's' : ''} remaining).`,
                            [{ text: 'Understood' }]
                          );
                          return;
                        }
                        onUpload?.({ ...section, itemEntries: section.itemEntries?.map((entry, lineIdx) => ({
                          ...entry, fulfillmentStatus: itemStatuses[getItemKey(entry, originalIndex, lineIdx)] ?? entry.fulfillmentStatus,
                        })) }, originalIndex);
                      }}
                      style={[
                        styles.uploadButton,
                        isCompleted ? styles.uploadSuccess : styles.uploadPending,
                        !allItemsChecked && styles.uploadDisabled,
                        { opacity: isUploading ? 0.6 : !allItemsChecked ? 0.55 : 1 },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isCompleted || isUploading || !allItemsChecked, busy: isUploading }}
                      // Carries the store name: on a three-stop errand a screen
                      // reader would otherwise read three identical buttons.
                      accessibilityLabel={
                        isCompleted
                          ? `Receipt saved for ${section.title ?? 'this stop'}`
                          : isUploading
                            ? 'Reading the receipt'
                            : !allItemsChecked
                              ? `Check all items first before photographing receipt for ${section.title ?? 'this stop'}`
                              : `Photograph the receipt for ${section.title ?? 'this stop'}`
                      }
                    >
                      <Camera size={18} color={isCompleted ? Colors.success : Colors.navy} />
                      <Text
                        style={[
                          styles.uploadText,
                          { color: isCompleted ? Colors.success : Colors.navy },
                        ]}
                        maxFontSizeMultiplier={1.25}
                      >
                        {isCompleted ? 'Receipt saved' : isUploading ? 'Reading…' : 'Photograph receipt'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* A sari-sari store or a market stall prints nothing. Without this
                      the rider photographed the goods, was told the sharp photo was
                      "too blurry to read", and could not finish the errand at all. */}
                  {isAtStore && !isCompleted && (
                    <TouchableOpacity
                      disabled={isUploading}
                      onPress={() => {
                        if (!allItemsChecked) {
                          Alert.alert(
                            'Check All Items First',
                            `Please verify all ${section.lines.length} requested items for this store before reporting no receipt (${pendingCount} item${pendingCount > 1 ? 's' : ''} remaining).`,
                            [{ text: 'Understood' }]
                          );
                          return;
                        }
                        onNoReceipt?.({ ...section, itemEntries: section.itemEntries?.map((entry, lineIdx) => ({
                          ...entry, fulfillmentStatus: itemStatuses[getItemKey(entry, originalIndex, lineIdx)] ?? entry.fulfillmentStatus,
                        })) }, originalIndex);
                      }}
                      style={[
                        styles.noReceiptButton,
                        !allItemsChecked && { opacity: 0.55 },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isUploading || !allItemsChecked }}
                      accessibilityLabel={`This shop gives no receipt — photograph the goods for ${section.title ?? 'this stop'} instead`}
                      testID={`no-receipt-${originalIndex}`}
                    >
                      <Text
                        style={[
                          styles.noReceiptText,
                          !allItemsChecked && { color: Colors.textLight },
                        ]}
                        maxFontSizeMultiplier={1.25}
                      >
                        This shop gives no receipt
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          );
        })}
      </View>
      )}

      {pendingConfirmation && (
        <Modal
          transparent
          animationType="fade"
          visible={!!pendingConfirmation}
          onRequestClose={handleCancelConfirmation}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={handleCancelConfirmation} />
            <View style={styles.modalCard}>
              <View
                style={[
                  styles.modalIconWrap,
                  pendingConfirmation.targetStatus === 'PURCHASED'
                    ? styles.modalIconWrapSuccess
                    : styles.modalIconWrapWarning,
                ]}
              >
                {pendingConfirmation.targetStatus === 'PURCHASED' ? (
                  <CheckCircle2 size={24} color={Colors.success} />
                ) : (
                  <PackageX size={24} color={Colors.warning} />
                )}
              </View>

              <Text style={styles.modalTitle} maxFontSizeMultiplier={1.25}>
                {pendingConfirmation.targetStatus === 'PURCHASED'
                  ? 'Confirm Item Purchased'
                  : 'Confirm Out of Stock'}
              </Text>

              <View style={styles.modalItemDetails}>
                <Text style={styles.modalItemName} maxFontSizeMultiplier={1.25}>
                  {pendingConfirmation.quantity && pendingConfirmation.quantity > 1
                    ? `${pendingConfirmation.quantity}x `
                    : ''}
                  {pendingConfirmation.itemName}
                </Text>
                {pendingConfirmation.storeTitle ? (
                  <Text style={styles.modalStoreName} maxFontSizeMultiplier={1.25}>
                    Store: {pendingConfirmation.storeTitle}
                  </Text>
                ) : null}
              </View>

              <Text style={styles.modalDescription} maxFontSizeMultiplier={1.25}>
                {pendingConfirmation.targetStatus === 'PURCHASED'
                  ? 'Once marked as purchased, this item will be locked and checked off. You cannot undo this unless updated by dispatch.'
                  : 'This will mark the item as unavailable and lock it on your checklist. Please confirm with store staff before proceeding.'}
              </Text>

              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={handleCancelConfirmation}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel item status change"
                  testID="confirm-modal-cancel-btn"
                >
                  <Text style={styles.modalCancelText} maxFontSizeMultiplier={1.25}>
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalConfirmButton,
                    pendingConfirmation.targetStatus === 'PURCHASED'
                      ? styles.modalConfirmSuccess
                      : styles.modalConfirmWarning,
                  ]}
                  onPress={handleConfirmStatusChange}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={
                    pendingConfirmation.targetStatus === 'PURCHASED'
                      ? 'Confirm item marked as purchased'
                      : 'Confirm item marked out of stock'
                  }
                  testID="confirm-modal-confirm-btn"
                >
                  <Text style={styles.modalConfirmText} maxFontSizeMultiplier={1.25}>
                    {pendingConfirmation.targetStatus === 'PURCHASED'
                      ? 'Yes, Mark Purchased'
                      : 'Mark Out of Stock'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: moderateScale(12),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    gap: Spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  headerTitle: {
    // Shrinks inside its row: React Native's flexShrink defaults to 0, so a
    // long store name otherwise ran out past the panel's edge.
    flexShrink: 1,
    fontSize: scaledFontSize(FontSizes.base, 0.35),
    fontWeight: FontWeights.bold as any,
    color: Colors.navy,
  },
  collapseToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  collapseToggleText: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textGray,
  },
  content: { gap: Spacing.sm },
  itemBox: {
    gap: moderateScale(8),
  },
  itemBoxLocked: {
    opacity: 1,
  },
  itemRowContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: moderateScale(8),
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    minHeight: 48,
    flex: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.textGray,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TaskSheetColors.surface,
    marginTop: 2,
    flexShrink: 0,
  },
  itemSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    maxWidth: moderateScale(100),
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  checkboxChecked: {
    backgroundColor: TaskSheetColors.completed,
    borderColor: TaskSheetColors.completed,
  },
  checkboxOutOfStock: {
    backgroundColor: Colors.warning,
    borderColor: Colors.warning,
  },
  lockedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.sm,
  },
  lockedNoteText: {
    flexShrink: 1,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textGray,
  },
  itemTitle: {
    fontSize: scaledFontSize(FontSizes.base, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.navy,
  },
  itemCategory: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textGray,
    marginBottom: 4,
  },
  itemText: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    color: Colors.textDark,
    lineHeight: 20,
    flex: 1,
  },
  itemTextCol: { flex: 1 },
  itemNote: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textGray,
    lineHeight: 18,
    marginTop: 2,
  },
  itemTextChecked: {
    textDecorationLine: 'line-through',
    color: TaskSheetColors.completed,
  },
  itemTextOutOfStock: {
    textDecorationLine: 'line-through',
    color: Colors.warning,
  },
  oosPill: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: TaskSheetColors.divider,
    backgroundColor: TaskSheetColors.mutedSurface,
  },
  oosPillActive: {
    borderColor: Colors.warning,
    backgroundColor: Colors.warningSubtle,
  },
  oosPillText: {
    textAlign: 'center',
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textMedium,
  },
  oosPillTextActive: {
    color: Colors.warning,
  },
  checklistSummaryRow: {
    marginTop: Spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: TaskSheetColors.mutedSurface,
  },
  checklistSummaryText: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textMedium,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingVertical: moderateScale(10, 0.20),
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    minHeight: 48,
  },
  uploadPending: {
    backgroundColor: TaskSheetColors.accentSurface,
    borderColor: TaskSheetColors.accentBorder,
  },
  uploadSuccess: {
    backgroundColor: Colors.successSubtle,
    borderColor: Colors.successBorder,
  },
  noReceiptButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
    paddingVertical: Spacing.xs,
    minHeight: 48,
  },
  noReceiptText: {
    textAlign: 'center',
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textMedium,
    textDecorationLine: 'underline',
  },
  uploadText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold as any,
  },
  uploadDisabled: {
    backgroundColor: TaskSheetColors.mutedSurface,
    borderColor: TaskSheetColors.divider,
  },
  pendingGateNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: TaskSheetColors.surface,
    marginTop: Spacing.sm,
  },
  pendingGateNoticeText: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textMedium,
    flex: 1,
    lineHeight: 17,
    fontWeight: FontWeights.medium as any,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayHeavy,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  modalIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  modalIconWrapSuccess: {
    backgroundColor: Colors.successSubtle,
    borderWidth: 1,
    borderColor: Colors.successBorder,
  },
  modalIconWrapWarning: {
    backgroundColor: Colors.warningSubtle,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
  },
  modalTitle: {
    fontSize: scaledFontSize(FontSizes.base, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  modalItemDetails: {
    width: '100%',
    backgroundColor: Colors.bgGray,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginVertical: Spacing.xs,
    alignItems: 'center',
  },
  modalItemName: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textDark,
    textAlign: 'center',
  },
  modalStoreName: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textGray,
    marginTop: 2,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textMedium,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
    marginTop: Spacing.xs,
  },
  modalCancelButton: {
    flex: 1,
    minHeight: 48,
    backgroundColor: Colors.bgGray,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCancelText: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textMedium,
  },
  modalConfirmButton: {
    flex: 1.3,
    minHeight: 48,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmSuccess: {
    backgroundColor: Colors.success,
  },
  modalConfirmWarning: {
    backgroundColor: Colors.warning,
  },
  modalConfirmText: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textWhite,
  },
});
