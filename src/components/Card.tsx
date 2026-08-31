import React from 'react';
import { View, StyleSheet, type ViewProps, type ViewStyle } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../config/theme';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  /** Removes the inner padding, for cards whose header runs edge to edge. */
  flush?: boolean;
  style?: ViewStyle | ViewStyle[];
}

/**
 * The white bordered panel every screen was declaring for itself.
 *
 * Four screens had four copies of the same eight style properties, which is how
 * three of them ended up with a different corner radius from the fourth.
 */
export function Card({ children, flush = false, style, ...rest }: CardProps) {
  return (
    <View style={[styles.card, flush ? styles.flush : styles.padded, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgWhite,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  padded: {
    padding: Spacing.xl,
  },
  flush: {
    padding: 0,
  },
});

export default Card;
