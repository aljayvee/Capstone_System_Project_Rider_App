import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, History, UserRound, type LucideIcon } from 'lucide-react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius, FontFamily, scaledFontSize, moderateScale } from '../config/theme';

interface TabConfig {
  name: string;
  label: string;
  Icon: LucideIcon;
}

const TAB_CONFIGS: TabConfig[] = [
  { name: 'Home', label: 'Home', Icon: Home },
  { name: 'History', label: 'My History', Icon: History },
  { name: 'Profile', label: 'Profile', Icon: UserRound },
];

export function RiderBottomNav({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, Spacing.sm),
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const config = TAB_CONFIGS.find((t) => t.name === route.name) || {
          name: route.name,
          label: route.name,
          Icon: Home,
        };
        const { Icon, label } = config;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <TouchableOpacity
            key={route.key}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={descriptors[route.key]?.options?.tabBarAccessibilityLabel || label}
            testID={`rider-tab-${route.name.toLowerCase()}`}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tabItem}
          >
            {/* Clean Minimalist Icon Container */}
            <View style={styles.iconContainer}>
              <Icon
                size={22}
                color={isFocused ? Colors.primary : Colors.textLight}
                strokeWidth={isFocused ? 2.4 : 1.8}
              />
            </View>

            {/* Tab Label with Clear Weight Transition */}
            <Text
              style={[
                styles.tabLabel,
                isFocused ? styles.tabLabelActive : styles.tabLabelInactive,
              ]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.15}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.bgWhite,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: Spacing.sm + 2,
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 8,
  },
  tabItem: {
    // flex rather than a 72dp minimum: with a fourth tab that floor overflowed a
    // 360dp screen and pushed the last label off the edge.
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
    minHeight: 48,
  },
  iconContainer: {
    width: 44,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  tabLabel: {
    fontFamily: FontFamily.medium,
    fontSize: scaledFontSize(FontSizes.xs, 0.20),
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    fontFamily: FontFamily.bold,
    color: Colors.primary,
  },
  tabLabelInactive: {
    fontFamily: FontFamily.medium,
    color: Colors.textGray,
  },
});

export default RiderBottomNav;
