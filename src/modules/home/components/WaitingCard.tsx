import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Bike } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';

export function WaitingCard() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Bike size={32} color={Colors.textLight} />
        </View>
        <Text style={styles.title}>Waiting for your next errand</Text>
        <Text style={styles.description}>The dispatcher will send one through shortly. Keep the app open.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.bgWhite,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  content: {
    padding: 32,
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    color: Colors.textDark,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold as any,
  },
  description: {
    color: Colors.textGray,
    fontSize: FontSizes.sm,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
});
