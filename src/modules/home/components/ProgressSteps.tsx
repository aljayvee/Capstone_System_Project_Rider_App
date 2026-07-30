import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Navigation, Package, CheckCircle, Bike } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../../../config/theme';
import { StatusStep, STATUS_STEPS, STEP_META } from '../../../types/rider';

interface ProgressStepsProps {
  currentStatus: StatusStep;
  stepIndex: number;
}

const icons: Record<string, any> = {
  Traveling: Navigation,
  "At Store": Package,
  Purchased: CheckCircle,
  "En Route": Bike,
  Delivered: CheckCircle,
};

export function ProgressSteps({ currentStatus, stepIndex }: ProgressStepsProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Progress</Text>
      <View style={styles.stepsContainer}>
        {STATUS_STEPS.map((step, i) => {
          const Icon = icons[step];
          const done = i < stepIndex;
          const active = i === stepIndex;
          
          return (
            <View key={step} style={styles.stepRow}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: done ? Colors.primary : active ? Colors.primaryLight : Colors.bgGray,
                    borderColor: active ? Colors.primary : 'transparent',
                    borderWidth: 2,
                  }
                ]}
              >
                <Icon size={13} color={done ? Colors.textWhite : active ? Colors.primary : Colors.textLight} />
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  {
                    color: done ? Colors.textDark : active ? Colors.primary : Colors.textLight,
                    fontWeight: (active ? FontWeights.bold : done ? FontWeights.medium : FontWeights.normal) as any,
                  }
                ]}
              >
                {STEP_META[step].label}
              </Text>
              {done && <CheckCircle size={14} color={Colors.primary} style={styles.checkIcon} />}
              {active && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>CURRENT</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.textMedium,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold as any,
    marginBottom: Spacing.md,
  },
  stepsContainer: {
    gap: Spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: FontSizes.sm,
  },
  checkIcon: {
    marginLeft: 'auto',
  },
  badge: {
    marginLeft: 'auto',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xxs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryLight,
  },
  badgeText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: FontWeights.bold as any,
  },
});
