import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Navigation } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';

interface OfflineCardProps {
  onViewRequests?: () => void;
  setShowWaybill?: (show: boolean) => void;
}

export function OfflineCard({ onViewRequests, setShowWaybill }: OfflineCardProps) {
  const handlePress = () => {
    if (setShowWaybill) setShowWaybill(true);
    if (onViewRequests) onViewRequests();
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Navigation size={24} color={Colors.textLight} />
      </View>
      <Text style={styles.title}>You're Offline</Text>
      <Text style={styles.description}>Connection lost. Use your cached files to complete the delivery.</Text>
      <TouchableOpacity style={styles.button} onPress={handlePress}>
        <Text style={styles.buttonText}>View Customer Requests</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.bgDark,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.offlineBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    color: Colors.textWhite,
    fontSize: FontSizes.md,
    fontWeight: FontWeights.bold as any,
    marginBottom: Spacing.xs,
  },
  description: {
    color: Colors.textLight,
    fontSize: FontSizes.xs,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  button: {
    width: '100%',
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    shadowColor: Colors.primaryDark,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  buttonText: {
    color: Colors.textWhite,
    fontWeight: FontWeights.bold as any,
    fontSize: FontSizes.md,
  },
});
