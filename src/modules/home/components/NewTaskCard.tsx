import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Zap } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';

import { Errand, MergedErrand } from '../../../types/rider';

interface NewTaskCardProps {
  errand?: MergedErrand | Errand;
  errandType?: string;
  distance?: string;
  serviceFee?: number;
  onAccept: () => void;
  onDecline: () => void;
}

export function NewTaskCard({ errand, errandType: propType, distance: propDistance, serviceFee: propFee, onAccept, onDecline }: NewTaskCardProps) {
  const errandType = errand ? errand.type : propType ?? "Pabili";
  const distance = errand ? (errand.distance || "1.8 km") : propDistance ?? "1.8 km";
  const serviceFee = errand ? errand.serviceFee : propFee ?? 75;

  return (

    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Zap size={32} color={Colors.primary} />
        </View>
        <Text style={styles.title}>New Task!</Text>
        <Text style={styles.subtitle}>You have a new {errandType} request</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.label}>Est. Distance</Text>
          <Text style={styles.value}>{distance}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Total Earnings</Text>
          <Text style={styles.earningsValue}>₱{serviceFee}</Text>
        </View>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.acceptButton} onPress={onAccept}>
            <Text style={styles.acceptText}>Accept Task</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineButton} onPress={onDecline}>
            <Text style={styles.declineText}>Decline</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.bgWhite,
    borderWidth: 2,
    borderColor: Colors.primary,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  header: {
    padding: Spacing.xxl,
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2', // specific red-100 equivalent if needed
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    color: Colors.textDark,
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.extrabold as any,
  },
  subtitle: {
    color: Colors.textGray,
    fontSize: FontSizes.base,
  },
  content: {
    padding: Spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    marginBottom: Spacing.lg,
  },
  label: {
    color: Colors.textGray,
    fontSize: FontSizes.sm,
  },
  value: {
    color: Colors.textDark,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold as any,
  },
  earningsValue: {
    color: Colors.primary,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.extrabold as any,
  },
  buttonContainer: {
    marginTop: Spacing.sm,
  },
  acceptButton: {
    width: '100%',
    paddingVertical: Spacing.xl,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  acceptText: {
    color: Colors.textWhite,
    fontWeight: FontWeights.bold as any,
    fontSize: FontSizes.xl,
  },
  declineButton: {
    width: '100%',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  declineText: {
    color: Colors.textGray,
    fontWeight: FontWeights.semibold as any,
    fontSize: FontSizes.md,
  },
});
