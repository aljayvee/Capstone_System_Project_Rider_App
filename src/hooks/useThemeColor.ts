import { useColorScheme } from 'react-native';
import { LightColors, DarkColors, type ThemeColors } from '../config/theme';
import { useThemeContext, type ThemeMode } from '../context/ThemeContext';

/**
 * The active palette, for a component that needs to respond to the theme.
 *
 * Falls back to the system scheme when rendered outside a ThemeProvider rather
 * than throwing. A screen has no business crashing because a provider is
 * missing from a test harness or a storybook, and the fallback still returns
 * the correct colours for the phone's current setting.
 *
 * Usage: colours must come out of the component body, not a module-level
 * StyleSheet, because StyleSheet.create runs once at import and cannot know
 * about a theme that changes later.
 *
 *   const { colors } = useThemeColor();
 *   const styles = useMemo(() => makeStyles(colors), [colors]);
 */
export function useThemeColor() {
  try {
    return useThemeContext();
  } catch {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    return {
      themeMode: 'system' as ThemeMode,
      setThemeMode: async (_mode: ThemeMode) => {},
      isDark,
      colors: (isDark ? DarkColors : LightColors) as ThemeColors,
      colorScheme: (scheme ?? 'light') as 'light' | 'dark',
    };
  }
}
