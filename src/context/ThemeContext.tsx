import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme, LayoutAnimation, Platform, UIManager } from 'react-native';
import { LightColors, DarkColors, type ThemeColors } from '../config/theme';
import { storageAdapter } from '../adapters/storageAdapter';

/**
 * Which palette the app is drawing with.
 *
 * Ported from the CustomerApp rather than written afresh, so the two mobile
 * apps have one way of doing this instead of two. Riders work at night, which
 * is the case dark mode exists for.
 *
 * Three modes, not two: 'system' follows the phone and is the default, because
 * a rider who has already told Android they want dark should not have to tell
 * this app as well.
 */

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  isDark: boolean;
  colors: ThemeColors;
  colorScheme: 'light' | 'dark';
}

const STORAGE_KEY = '@sugo_rider_theme_mode';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    let cancelled = false;
    storageAdapter
      .getJSON<ThemeMode>(STORAGE_KEY)
      .then((saved) => {
        if (cancelled) return;
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setThemeModeState(saved);
        }
      })
      .catch(() => {
        // A missing preference is not an error; 'system' is a fine default.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    if (mode === themeMode) return;

    // Cross-fade rather than a hard swap. Flipping an entire screen's colours
    // in one frame is unpleasant at night, which is precisely when someone
    // reaches for this setting.
    LayoutAnimation.configureNext({
      duration: 350,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });

    setThemeModeState(mode);
    try {
      await storageAdapter.setJSON(STORAGE_KEY, mode);
    } catch (e) {
      console.warn('Could not save the theme preference:', e);
    }
  };

  const isDark =
    themeMode === 'dark' ? true : themeMode === 'light' ? false : systemColorScheme === 'dark';

  const value = useMemo(
    () => ({
      themeMode,
      setThemeMode,
      isDark,
      colors: (isDark ? DarkColors : LightColors) as ThemeColors,
      colorScheme: (isDark ? 'dark' : 'light') as 'light' | 'dark',
    }),
    [themeMode, isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
}
