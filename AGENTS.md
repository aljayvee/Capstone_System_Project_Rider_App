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

## React Native Maps Layout Rules
- NEVER embed `MapView` from `react-native-maps` directly inside a `ScrollView`, `FlatList`, or any scroll container — this causes an immediate native crash on Android.
- **Correct pattern**: Use a static placeholder (coordinates text + icon) inside the ScrollView. Open the full interactive `MapView` inside a full-screen `Modal` only.
- `MapView` may only render directly in a `View` with a fixed pixel `height` at the root render level, completely outside any scroll container.
- Applies to all `MapView` usage in `CustomerApp` and `RiderMobileApp`.

## Designer-Grade Mathematical Responsive Scaling & Device Adaptation Invariant
- **Base Reference Canvas**: All base token coordinates and font scales are calibrated against a standard mobile viewport baseline ($W = 375\text{dp}, H = 812\text{dp}$).
- **Mathematical Damped Moderate Scaling**: Spacings, paddings, icon diameters, and container heights MUST use damped moderate scaling:
  $$\text{moderateScale}(\text{size}, \text{factor} = 0.5) = \text{size} + \left(\left(\frac{W}{375}\right) \times \text{size} - \text{size}\right) \times \text{factor}$$
  Vertical-dependent elements use $\text{moderateVerticalScale}(\text{size}, \text{factor} = 0.5)$ against $H = 812\text{dp}$.
- **Bounded Typography Scaling & Accessibility Safety**: Font sizes MUST use conservative scaling factor ($\text{factor} = 0.35$) and MUST be strictly clamped within safety thresholds $[0.85 \times \text{size}, 1.35 \times \text{size}]$ via `scaledFontSize(size, 0.35)` to prevent text clipping on compact screens or bloated typography on phablets. Critical UI components (tabs, button titles, status pills, table headers) MUST declare `maxFontSizeMultiplier={1.15}` to `1.25` to prevent OS-level accessibility extra-large fonts from breaking structured cards.
- **5-Tier Device Form Factor Classification**: Responsive hooks (`useResponsive()`) MUST classify viewports into 5 explicit tiers:
  1. `Compact` ($W < 360\text{dp}$): Compact paddings, condensed button heights ($50–52\text{dp}$).
  2. `Standard` ($360\text{dp} \le W < 414\text{dp}$): Standard $16\text{dp}$ margins, $54–56\text{dp}$ CTAs.
  3. `Phablet` ($414\text{dp} \le W < 600\text{dp}$): Balanced typography, expanded padding ($18–20\text{dp}$).
  4. `Tall Aspect Ratio` (aspect ratio $\ge 2.1$, e.g. Samsung Galaxy Z-Flip $22:9$): Expanded bottom map/mission control clearance ($290\text{dp}$).
  5. `Tablet / Unfolded Foldable` ($W \ge 600\text{dp}$): Container constrained to `maxWidth: MAX_CONTENT_WIDTH` ($580\text{dp}$) with `alignSelf: 'center'` to eliminate edge-to-edge stretching.
- **Fluid Grid Sizing**: Multi-column grids MUST dynamically calculate slot widths from live `contentWidth` ($\text{slotWidth} = \frac{\text{contentWidth} - \text{gap}}{\text{columns}}$) instead of fixed hardcoded pixels.

## Progressive Single Active Leg Navigation & Theme-Scoped Color Invariant
- **Progressive Single-Leg Road Rendering**:
  - **Store Phase**: While visiting stores, the map MUST draw **ONLY** the single active road path from the rider to the current store ($R \to S_{\text{active}}$) in **Yellow-Gold** (`routeToStore`: `#F59E0B` in Light Mode, `#FBBF24` in Dark Mode). Future store legs and customer delivery lines remain unrendered.
  - **Delivery Phase**: Once all stores are completed (receipts uploaded / arrived), the map transitions to draw **ONLY** the final delivery road path ($R \to C$) in **Blue-Light** (`routeToCustomer`: `#0284C7` in Light Mode, `#38BDF8` in Dark Mode).
- **Out-of-Order Geofence Support**: If the rider physically enters the geofence of an uncompleted store out of sequence, the system MUST auto-advance that store and recalculate the single-leg path to the next stop.
- **3D Third-Person Chase Cam & 2D Flat Plane**:
  - `3D` Mode: $55^\circ$ pitch angle, $18.5$ zoom level, dynamically locked to the rider's heading of travel.
  - `2D` Mode: $0^\circ$ pitch (flat top-down), $0^\circ$ heading (North-Up), $16.5$ zoom level.
  - All camera switcher controls MUST maintain $\ge 48\text{dp}$ touch targets (MD3 / WCAG 2.2 AA compliant).
- **Zero-Overlap Vertical Stacking**:
  - `TurnByTurnHUD`: Mounted at `top: insets.top + Spacing.xs`.
  - `FeeCapsuleBar`: Dynamically offset to `top: insets.top + 82` when HUD is mounted.
  - `StatusBanner`: Positioned at `top: insets.top + 138` when HUD is mounted.
  - Floating ETA badge: Positioned at bottom-left (`left: 12, bottom: 18`) opposite bottom-right camera controls.
- **Strict Road-Network Centerline Snapping**: All route anchors (`origin`, store `waypoints`, and customer `destination`) MUST be snapped to the nearest road network centerline via `routingProvider.snap()` before routing. Polylines MUST be pure road-network geometry without artificial corner-cutting bezier curves.


