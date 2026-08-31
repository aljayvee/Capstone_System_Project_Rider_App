import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WifiOff, Radio } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing } from '../config/theme';

interface OfflineTelemetryBannerProps {
  isOffline: boolean;
  isGpsLost?: boolean;
  queuedLocationsCount?: number;
}

export const OfflineTelemetryBanner: React.FC<OfflineTelemetryBannerProps> = ({
  isOffline,
  isGpsLost = false,
  queuedLocationsCount = 0,
}) => {
  if (!isOffline && !isGpsLost) return null;

  return (
    <View style={styles.container}>
      {isGpsLost ? (
        <Radio size={14} color="#FBBF24" />
      ) : (
        <WifiOff size={14} color="#FBBF24" />
      )}
      <Text style={styles.text}>
        {isGpsLost
          ? 'GPS Signal Weak • Recording points locally'
          : `Network Offline • ${queuedLocationsCount > 0 ? `${queuedLocationsCount} telemetry points buffered` : 'Buffering locally'}`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 158, 11, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: Spacing.md,
    gap: 8,
    zIndex: 999,
  },
  text: {
    color: '#F8FAFC',
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold as any,
  },
});

export default OfflineTelemetryBanner;
