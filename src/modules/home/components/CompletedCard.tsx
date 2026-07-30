import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CheckCircle } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';

import { Errand, MergedErrand } from '../../../types/rider';

interface CompletedCardProps {
  errand?: MergedErrand | Errand;
  serviceFee?: number;
  onAcceptNext: () => void;
}

export function CompletedCard({ errand, serviceFee: propFee, onAcceptNext }: CompletedCardProps) {
  const serviceFee = errand ? errand.serviceFee : propFee ?? 75;

  return (

    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <CheckCircle size={32} color={Colors.primary} />
      </View>
      <Text style={styles.title}>Errand Completed!</Text>
      <Text style={styles.subtitle}>Great job, Al-Dhen! Payment collected.</Text>
      
      <View style={styles.earningsBox}>
        <Text style={styles.earningsValue}>₱{serviceFee}</Text>
        <Text style={styles.earningsLabel}>EARNINGS FROM THIS TRIP</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={onAcceptNext}>
        <Text style={styles.buttonText}>Accept Next Errand</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.xxxl,
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.bgWhite,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.textWhite,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold as any,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    color: Colors.whiteOverlayText,
    fontSize: FontSizes.sm,
  },
  earningsBox: {
    marginTop: Spacing.xl,
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgWhite,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  earningsValue: {
    color: Colors.primary,
    fontSize: FontSizes.xxxl,
    fontWeight: FontWeights.black as any,
  },
  earningsLabel: {
    color: Colors.primaryDark,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
    letterSpacing: 0.5,
  },
  button: {
    marginTop: Spacing.xl,
    width: '100%',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.bgWhite,
    alignItems: 'center',
  },
  buttonText: {
    color: Colors.primary,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold as any,
  },
});
