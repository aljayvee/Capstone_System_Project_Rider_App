import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing } from '../config/theme';

interface EmptyStateProps {
  Icon?: LucideIcon;
  title: string;
  /** One line on what would put something here. Optional. */
  hint?: string;
}

/**
 * Says why a list is empty, rather than leaving a blank rectangle.
 *
 * "Nothing here yet" reads as a screen that has not loaded. A rider needs to
 * know the difference between "you have finished nothing today" and "this is
 * broken", and only one of those is worth them retrying.
 */
export function EmptyState({ Icon, title, hint }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {Icon ? <Icon size={32} color={Colors.textLight} /> : null}
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.huge * 2,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  title: {
    color: Colors.textMedium,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.semibold as any,
    textAlign: 'center',
  },
  hint: {
    color: Colors.textLight,
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
});

export default EmptyState;
