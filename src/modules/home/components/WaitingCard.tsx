import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Bike } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';

export function WaitingCard() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Bike size={32} color={Colors.textLight} />
        </View>
        <Text style={styles.title} maxFontSizeMultiplier={1.2}>Waiting for your next errand</Text>
        <Text style={styles.description} maxFontSizeMultiplier={1.15}>The dispatcher will send one through shortly. Keep the app open.</Text>
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
    padding: Spacing.xl,
    alignItems: 'center',
  },
  iconContainer: {
    width: moderateScale(60, 0.20),
    height: moderateScale(60, 0.20),
    borderRadius: moderateScale(30, 0.20),
    backgroundColor: Colors.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    color: Colors.textDark,
    fontSize: scaledFontSize(FontSizes.lg, 0.20),
    fontWeight: FontWeights.bold as any,
    textAlign: 'center',
  },
  description: {
    color: Colors.textGray,
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
    marginTop: Spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
