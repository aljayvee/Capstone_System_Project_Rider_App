# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Expo & Android Build Rules

## Package Installation
- Always use `npx expo install <package-name>` instead of `npm install` when adding Expo packages to ensure compatibility with the project's Expo SDK version.

## Android Gradle Build Environment
- When running `.\gradlew` commands on Windows:
  - Set JAVA_HOME to Android Studio JBR: `$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`
  - Set ANDROID_HOME: `$env:ANDROID_HOME="C:\Users\Capstone\AppData\Local\Android\Sdk"`
  - Ensure `android/local.properties` exists with: `sdk.dir=C\:\\Users\\Capstone\\AppData\\Local\\Android\\Sdk`

## Secret Management & Environment Variables
- Never hardcode sensitive API keys (e.g., Google Maps API key, Firebase secrets) inside tracked configuration files like `app.json` or native `AndroidManifest.xml`.
- Use dynamic Expo configuration (`app.config.js` or `app.config.ts`) to read API keys and configuration values from environment variables (`process.env.EXPO_PUBLIC_*`).
- Store local environment variables in `.env` (which must be kept in `.gitignore`), and provide `.env.example` as a template for developers.

## Expo Background Location Task & Development Mode Stability Invariants
- **Dev-Mode Headless Task Guarding**: In development mode (`__DEV__`), NEVER run native background location tasks (`Location.startLocationUpdatesAsync`) while the app is active in the foreground. Android's native `HeadlessJsTaskService` invokes Metro HMR on every GPS tick, causing infinite `Android Bundled (1 module)` refresh loops and `NullPointerException: Invalidated JavaCallback was invoked` crashes.
- **Foreground Direct Broadcast Pattern**: Stream live real-time GPS coordinates via `Location.watchPositionAsync` and broadcast directly to Firebase Realtime Database (`saveRiderLocation`). Reserve `startLocationUpdatesAsync` for production builds (`!__DEV__`) when the screen is locked/backgrounded.
- **Non-Blocking Initial Position**: NEVER call `Location.getCurrentPositionAsync({ accuracy: High })` during component mount or app initialization — it hangs or throws invalidated native callbacks during bridge resets. ALWAYS use `Location.getLastKnownPositionAsync().catch(() => null)`.
- **Zombie Task Cleanup on Mount**: On initial application boot in development, always inspect and unregister leftover background tasks via `Location.hasStartedLocationUpdatesAsync(TASK_NAME)` -> `Location.stopLocationUpdatesAsync(TASK_NAME)`.
- **Defensive TaskManager Handlers**: Always wrap `TaskManager.defineTask` callbacks inside a top-level `try/catch` with null checks on `locations` and storage keys to prevent uncaught native background exceptions.
