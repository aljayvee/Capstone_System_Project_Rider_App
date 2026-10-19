import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Signpost, Flag, MessageSquareText } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize } from '../../../config/theme';

interface DropOffDetailsProps {
  streetName?: string | null;
  landmark?: string | null;
  notes?: string | null;
}

/**
 * The rest of the customer's address, under "Drop-off: <customer>" while the
 * rider is still shopping: the street, the landmark, and the note they left
 * for the rider. Known before setting off for the door, not only once the
 * delivery panel opens. Each line appears only when the customer filled it in.
 */
export function DropOffDetails({ streetName, landmark, notes }: DropOffDetailsProps) {
  const street = streetName?.trim();
  const mark = landmark?.trim();
  const note = notes?.trim();
  if (!street && !mark && !note) return null;

  return (
    <View style={styles.container}>
      {street ? (
        <View style={styles.row} testID="dropoff-street-name">
          <Signpost size={12} color={Colors.textLight} style={styles.icon} />
          <Text style={styles.text} maxFontSizeMultiplier={1.15}>
            <Text style={styles.label}>Street: </Text>
            {street}
          </Text>
        </View>
      ) : null}
      {mark ? (
        <View style={styles.row} testID="dropoff-landmark">
          <Flag size={12} color={Colors.textLight} style={styles.icon} />
          <Text style={styles.text} maxFontSizeMultiplier={1.15}>
            <Text style={styles.label}>Landmark: </Text>
            {mark}
          </Text>
        </View>
      ) : null}
      {note ? (
        // Set apart, as in the delivery panel: an instruction ("call when
        // outside") is easy to miss as one more grey line.
        <View style={styles.noteBox} testID="dropoff-notes">
          <MessageSquareText size={12} color={Colors.warning} style={styles.icon} />
          <Text style={styles.noteText} maxFontSizeMultiplier={1.15}>
            <Text style={styles.noteLabel}>Note for the rider: </Text>
            {note}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  icon: {
    marginTop: 2,
    flexShrink: 0,
  },
  text: {
    flex: 1,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textMedium,
  },
  label: {
    color: Colors.textGray,
    fontWeight: FontWeights.bold as any,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.warningBg,
  },
  noteText: {
    flex: 1,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    color: Colors.textDark,
  },
  noteLabel: {
    color: Colors.warning,
    fontWeight: FontWeights.bold as any,
  },
});
