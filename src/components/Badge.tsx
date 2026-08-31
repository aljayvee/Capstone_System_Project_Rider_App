import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../config/theme';

export type BadgeTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral' | 'primary';

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
}

// Each pair is an audited ink on its own surface — see the palette's status
// section. Picking a fill and an ink independently is how contrast failures get
// in, so the two are only ever chosen together.
const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  success: { bg: Colors.successBg, fg: Colors.success },
  warning: { bg: Colors.warningBg, fg: Colors.warning },
  info: { bg: Colors.infoBg, fg: Colors.info },
  danger: { bg: Colors.dangerBg, fg: Colors.danger },
  neutral: { bg: Colors.bgGray, fg: Colors.textMedium },
  primary: { bg: Colors.primarySurface, fg: Colors.primaryStrong },
};

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  const { bg, fg } = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xxs,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold as any,
  },
});

export default Badge;
