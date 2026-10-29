import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Navigation, Package, CheckCircle, Bike, type LucideIcon } from 'lucide-react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, scaledFontSize, moderateScale } from '../../../config/theme';
import { StatusStep, STATUS_STEPS, STEP_META } from '../../../types/rider';
import { TaskSheetColors } from '../../../config/taskSheetTheme';

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
      <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.2}>Progress</Text>
      <View style={styles.stepsContainer}>
        {STATUS_STEPS.map((step, i) => {
          const Icon = icons[step];
          const done = i < stepIndex;
          const active = i === stepIndex;
          
          return (
            <View
              key={step}
              style={styles.stepRow}
              accessible
              accessibilityLabel={`${i + 1}. ${STEP_META[step].label}, ${active ? 'current step' : done ? 'completed' : 'upcoming'}`}
              accessibilityState={{ selected: active }}
            >
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: active ? TaskSheetColors.accent : done ? TaskSheetColors.completedSurface : TaskSheetColors.surface,
                    borderColor: active ? TaskSheetColors.accent : done ? TaskSheetColors.completed : TaskSheetColors.accentBorder,
                    borderWidth: 1,
                  }
                ]}
              >
                <Icon size={14} color={active ? Colors.onNavy : done ? TaskSheetColors.completed : Colors.navy} />
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  {
                    color: active ? TaskSheetColors.accent : done ? TaskSheetColors.completed : Colors.textMedium,
                    fontWeight: (active ? FontWeights.bold : done ? FontWeights.medium : FontWeights.normal) as any,
                  }
                ]}
                maxFontSizeMultiplier={1.15}
              >
                {STEP_META[step].label}
              </Text>
              {done && <CheckCircle size={14} color={TaskSheetColors.completed} style={styles.checkIcon} />}
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
    paddingBottom: moderateScale(20),
    borderBottomWidth: 1,
    borderBottomColor: TaskSheetColors.divider,
  },
  title: {
    color: Colors.navy,
    fontSize: scaledFontSize(FontSizes.base, 0.35),
    fontWeight: FontWeights.semibold as any,
    marginBottom: moderateScale(8),
  },
  stepsContainer: {
    gap: moderateScale(4),
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(12),
    minHeight: moderateScale(36),
  },
  iconCircle: {
    width: moderateScale(28, 0.20),
    height: moderateScale(28, 0.20),
    borderRadius: moderateScale(14, 0.20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    // Shares its row with the CURRENT badge; without this a long step name
    // pushed the badge past the panel's edge on a narrow screen.
    flexShrink: 1,
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
    backgroundColor: TaskSheetColors.accentSurface,
  },
  badgeText: {
    color: TaskSheetColors.accent,
    fontSize: scaledFontSize(FontSizes.xs, 0.35),
    fontWeight: FontWeights.bold as any,
  },
});
