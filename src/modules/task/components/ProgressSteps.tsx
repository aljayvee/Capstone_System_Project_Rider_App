import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Navigation, Package, CheckCircle, Bike, type LucideIcon } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';
import { StatusStep, STATUS_STEPS, STEP_META } from '../../../types/rider';

interface ProgressStepsProps {
  currentStatus: StatusStep;
  stepIndex: number;
}

/**
 * Keyed by StatusStep, not by string.
 *
 * This was `Record<string, any>` and still carried the pre-merge keys
 * "Purchased" and "In Route" after the five steps became four. `icons.Delivering`
 * was therefore undefined and rendering <Icon /> threw, taking down the whole
 * home screen for any active errand — invisible to tsc because `string` accepts
 * any key, and invisible to the suite because nothing renders a component.
 *
 * Typed against StatusStep, the next status change fails the build instead.
 */
const icons: Record<StatusStep, LucideIcon> = {
  Traveling: Navigation,
  "At Store": Package,
  Delivering: Bike,
  Delivered: CheckCircle,
};

export function ProgressSteps({ currentStatus, stepIndex }: ProgressStepsProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title} maxFontSizeMultiplier={1.2}>Progress</Text>
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
                    backgroundColor: done ? Colors.primary : active ? Colors.primarySurface : Colors.bgGray,
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
                maxFontSizeMultiplier={1.15}
              >
                {STEP_META[step].label}
              </Text>
              {done && <CheckCircle size={14} color={Colors.primary} style={styles.checkIcon} />}
              {active && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText} maxFontSizeMultiplier={1.15}>CURRENT</Text>
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
    fontSize: scaledFontSize(FontSizes.base, 0.20),
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
    width: moderateScale(28, 0.20),
    height: moderateScale(28, 0.20),
    borderRadius: moderateScale(14, 0.20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: scaledFontSize(FontSizes.sm, 0.20),
  },
  checkIcon: {
    marginLeft: 'auto',
  },
  badge: {
    marginLeft: 'auto',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xxs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primarySurface,
  },
  badgeText: {
    color: Colors.primary,
    fontSize: scaledFontSize(10, 0.20),
    fontWeight: FontWeights.bold as any,
  },
});
