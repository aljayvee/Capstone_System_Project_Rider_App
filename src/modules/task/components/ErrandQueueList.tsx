import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight, ListOrdered } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize } from '../../../config/theme';
import type { Errand } from '../../../types/rider';
import type { ErrandProgress } from '../../../services/missionProgress';
import { routePhaseFor } from '../../../services/routePhase';
import { queuePositionLabel } from '../../../services/errandQueue';
import { formatErrandId } from '../../../utils/formatErrandId';

interface ErrandQueueListProps {
  /** In run order: the errand in hand first. */
  errands: Errand[];
  progressFor: (errandId: string) => ErrandProgress;
  selectedIndex: number;
  onSelect: (index: number) => void;
}

/**
 * Where each errand in hand goes next, in the order they are run.
 *
 * A rider carrying two or three errands had fee capsules to tell them apart
 * and nothing saying which one to ride to first. The first row is the errand
 * the map is routing; each row after it waits its turn.
 */
export function ErrandQueueList({ errands, progressFor, selectedIndex, onSelect }: ErrandQueueListProps) {
  if (errands.length < 2) return null;

  return (
    <View style={styles.container} testID="errand-queue">
      <View style={styles.header}>
        <ListOrdered size={14} color={Colors.navy} />
        <Text style={styles.headerText} maxFontSizeMultiplier={1.25}>
          Your queue, in order
        </Text>
      </View>
      {errands.map((errand, index) => {
        const progress = progressFor(errand.id);
        const selected = index === selectedIndex;
        return (
          <TouchableOpacity
            key={errand.id}
            style={[styles.row, selected && styles.rowSelected]}
            onPress={() => onSelect(index)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${index === 0 ? 'Current errand' : `${queuePositionLabel(index)} in queue`}, ${
              errand.customer || 'customer'
            }, next: ${nextStopFor(errand, progress)}`}
            testID={`errand-queue-row-${index}`}
          >
            <View style={[styles.position, index === 0 && styles.positionNow]}>
              <Text style={[styles.positionText, index === 0 && styles.positionTextNow]} maxFontSizeMultiplier={1.15}>
                {queuePositionLabel(index)}
              </Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.customer} numberOfLines={1} maxFontSizeMultiplier={1.25}>
                {errand.customer || 'Customer'} · {formatErrandId(errand.id)}
              </Text>
              <Text style={styles.next} numberOfLines={2} maxFontSizeMultiplier={1.25}>
                {nextStopFor(errand, progress)}
              </Text>
            </View>
            <ChevronRight size={16} color={Colors.textGray} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** "Next: Store A", or the customer's address once everything is bought. */
function nextStopFor(errand: Errand, progress: ErrandProgress): string {
  if (routePhaseFor(progress.currentStatus) !== 'shopping') {
    return `Deliver to ${errand.address || 'the customer'}`;
  }
  const departed = new Set(progress.departedStoreIds ?? []);
  const stops = [...(errand.pinpoints ?? [])]
    .filter((stop) => !stop.departedAt && !departed.has(stop.id))
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  if (stops.length === 0) return 'Stores not pinned yet';
  const more = stops.length > 1 ? `, then ${stops.length - 1} more` : '';
  return `Next: ${stops[0].storeName}${more}`;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgLight,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    paddingBottom: Spacing.xxs,
  },
  headerText: {
    flexShrink: 1,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.navy,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 48,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.bgWhite,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  rowSelected: {
    borderColor: Colors.navy,
  },
  position: {
    minWidth: 44,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.bgGray,
    alignItems: 'center',
  },
  positionNow: {
    backgroundColor: Colors.primary,
  },
  positionText: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    fontWeight: FontWeights.bold as any,
    color: Colors.textMedium,
  },
  positionTextNow: {
    color: Colors.onPrimary,
  },
  body: {
    flex: 1,
    gap: 1,
  },
  customer: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    fontWeight: FontWeights.semibold as any,
    color: Colors.textDark,
  },
  next: {
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textGray,
  },
});

export default ErrandQueueList;
