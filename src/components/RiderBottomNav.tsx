import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, ClipboardList, UserRound, type LucideIcon } from 'lucide-react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '../config/theme';

interface TabConfig {
  name: string;
  label: string;
  Icon: LucideIcon;
}

const TAB_CONFIGS: TabConfig[] = [
  { name: 'Home', label: 'Home', Icon: Home },
  { name: 'Tasks', label: 'My Tasks', Icon: ClipboardList },
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
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: Spacing.sm + 2,
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 8,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    paddingVertical: 2,
  },
  iconContainer: {
    width: 44,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: FontSizes.xs,
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeights.bold,
  },
  tabLabelInactive: {
    color: '#64748B',
    fontWeight: FontWeights.medium,
  },
});

export default RiderBottomNav;
