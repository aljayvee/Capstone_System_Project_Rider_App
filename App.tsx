import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useFonts } from 'expo-font';
import {
  Urbanist_400Regular,
  Urbanist_500Medium,
  Urbanist_600SemiBold,
  Urbanist_700Bold,
} from '@expo-google-fonts/urbanist';
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
  JetBrainsMono_800ExtraBold,
} from '@expo-google-fonts/jetbrains-mono';
import * as SplashScreen from 'expo-splash-screen';
import AnimatedSplashScreen from './src/components/AnimatedSplashScreen';

import { LoginScreen } from './src/modules/auth/LoginScreen';
import { ForgotPasswordScreen } from './src/modules/auth/ForgotPasswordScreen';
import { AuthedNavigator } from './src/navigation/AuthedNavigator';

import { RiderAuthProvider, useRiderAuth } from './src/context/RiderAuthContext';
import { ThemeProvider, useThemeContext } from './src/context/ThemeContext';
import * as NavigationBar from 'expo-navigation-bar';
import { Colors } from './src/config/theme';
import {
  syncUpdatesInBackground,
  setupUpdateListeners,
} from './src/services/updatesService';

// Held until the animated splash has drawn, so nothing flashes between the two.
// The system splash shows no logo (app.json points it at a transparent image,
// on the animated splash's own background colour): Android 12+ always shows
// one at launch and it cannot be switched off, so it is made invisible instead,
// and AnimatedSplashScreen is the only splash the rider sees.
SplashScreen.preventAutoHideAsync().catch(() => {});

const hideSystemSplash = () => {
  SplashScreen.hideAsync().catch(() => {});
};

export type RootStackParamList = {
  // Set when coming back from a finished password reset: shows the success
  // message and, when the account was found by email, fills it in.
  Login: { passwordReset?: boolean; email?: string } | undefined;
  ForgotPassword: { prefill?: string } | undefined;
  Main: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const navigationTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: Colors.bgGray },
};

function AppContent() {
  const { rider, token, isLoading } = useRiderAuth();
  const { isDark } = useThemeContext();
  const [isSplashComplete, setIsSplashComplete] = React.useState(false);

  React.useEffect(() => {
    syncUpdatesInBackground(true);
    const cleanup = setupUpdateListeners();
    return cleanup;
  }, []);

  React.useEffect(() => {
    if (Platform.OS === 'android') {
      try {
        NavigationBar.setStyle(isDark ? 'light' : 'dark');
      } catch {
        // Fallback gracefully if not supported
      }
    }
  }, [isDark]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bgGray }}>
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!rider || !token ? (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            </>
          ) : (
            <Stack.Screen name="Main" component={AuthedNavigator} />
          )}
        </Stack.Navigator>
      </NavigationContainer>

      {!isSplashComplete && (
        <AnimatedSplashScreen
          isAppReady={!isLoading}
          // Let go of the system splash the moment this one is on screen. It
          // used to be held until this one had finished, which left the old
          // logo splash covering the animated one.
          onFirstFrame={hideSystemSplash}
          onAnimationComplete={() => {
            hideSystemSplash();
            setIsSplashComplete(true);
          }}
        />
      )}
    </View>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error in Rider App:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorText}>
            {this.state.error?.message || "An unexpected error occurred in Sugo Rider."}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Urbanist_400Regular,
    Urbanist_500Medium,
    Urbanist_600SemiBold,
    Urbanist_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
    JetBrainsMono_800ExtraBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        {/* Feeds the keyboard's real height to every KeyboardAvoidingView in the
            app. Android edge-to-edge (forced from Expo SDK 54) leaves
            adjustResize inert, so React Native's own KeyboardAvoidingView had
            nothing to react to and text fields sat under the keyboard. Above
            the navigator so the value survives screen changes. */}
        <KeyboardProvider>
        <ErrorBoundary>
          {/* Outside RiderAuthProvider: the login screen needs the theme too,
              and the theme has nothing to do with who is signed in. */}
          <ThemeProvider>
            <RiderAuthProvider>
              <AppContent />
            </RiderAuthProvider>
          </ThemeProvider>
        </ErrorBoundary>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FEE2E2',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#991B1B',
    textAlign: 'center',
  },
});
