# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# 🌐 Tri-Agent Distributed Peer Protocol (Claude Code ◄► OpenAI Codex ◄► Antigravity)
> **ALWAYS ACTIVE IN ALL SESSIONS**: Claude Code, OpenAI Codex, and Antigravity operate as an autonomous, distributed full-stack engineering team.
1. **Boot-Time Handshake Check (Step 0)**: In every single session, ALWAYS inspect `AGENT_HANDSHAKE.md` in this directory before modifying rider mobile code.
2. **Distributed Peer Ownership ("You Touch It, You Own It")**: Every agent is an autonomous full-stack peer. Whichever agent initiates or modifies code MUST complete the full end-to-end lifecycle (context grounding, surgical delta, defensive checks, CARE clean-up, and `tsc` verification).
3. **Locked Contract Invariant**: NEVER rename, refactor, or delete telemetry, GPS, or UI components marked `[LOCKED]` in `AGENT_HANDSHAKE.md`.
4. **Universal "CARE" Code-Hygiene Invariant**:
   - **Phase 1 (Make It Work)**: Apply changes strictly as minimal deltas using surgical replace tools. Never overwrite entire files.
   - **Phase 2 (Make It Right / Clean-Up)**: Prune dead imports, unused variables, and console logs. Validate responsive bounds ($360\text{dp}$ baseline) and verify with `npx tsc --noEmit`. Never mark a task complete without passing Phase 2.
5. **Session Handoff & Async Peer Review**: After completing any modification, update `AGENT_HANDSHAKE.md` with modified file paths, compiler verification (`npx tsc --noEmit`), and directives for the next session.
6. **Gemini Non-Autonomous Execution & Claude Cognitive Alignment**: Gemini models (Gemini 3.x Pro, Gemini 3.8 Flash High) MUST NOT act autonomously or execute sweeping unilateral changes. Gemini must strictly adopt the 6-stage Claude Cognitive Thinking Process (Context Grounding -> Hypothesis & Trade-offs -> User Consultation Gate -> Surgical Delta -> Defensive Rigor -> Empirical Verification).

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


# Impeccable UI/UX Design Standards & Strict Anti-AI-Slop Invariants

> **ENFORCEMENT LEVEL: ABSOLUTE & UNIVERSAL**
> Applies whenever designing, creating, editing, refactoring, or suggesting UI/UX layouts.
> Generic "AI Slop" visual design patterns are STRICTLY BANNED in production engineering.

## 1. The Anti-AI-Slop Bans (The 15 Absolute Refusals)
1. **NO Identical Card Grid Scaffolds**: NEVER structure screens out of repetitive, same-size card boxes containing `[Icon + Heading + Paragraph]`. Replace boxes with generous whitespace, typographic rhythm, and clear sectional flow. Nested cards are strictly banned.
2. **NO Hero-Metric Templates**: Refuse repetitive dashboard clichés (giant number, tiny label, supporting percentage badge, colored accent bar). Structure metrics according to real domain utility.
3. **NO Decorative Kickers or Eyebrows (Absolute Ban)**: NEVER place tiny uppercase kickers or category tags above headings as visual crutches. A heading carries its own weight.
4. **NO Generic Purple / Indigo Gradients**: Stick strictly to authentic brand colors: Deep Navy (`#0F2035`, `#0B132B`), bone (`#F2EEE4`), SUGO Red (`#DC2626`, `#F62459`), and tinted neutrals.
5. **NO Pill-Shaped Action Buttons**: Standard action buttons, CTAs, and inputs must use restrained ergonomic radii (8 to 12px). Full pills are strictly reserved for compact status indicator chips and action domes.
6. **NO Glowing Colored Halo Shadows**: Zero-offset colored drop shadows or glowing halo rings are banned. Shadows must carry intentional vertical offset and soft blur.
7. **NO Unicode Glyphs or Emojis as Structural UI Icons**: NEVER use emojis (🚀, ✨, 🔥, 🛵, 📦) in headers, buttons, status pills, or navigation bars. Use clean drawn vector SVGs (Lucide) in consistent stroke and weight.
8. **NO Fake Reviews, Fake Counters, or Fabricated Urgency**: Never render simulated stats, animated count-ups, fake testimonials, or fabricated scarcity countdowns.
9. **NO Gradient Text**: Emphasis comes from weight, size, and contrast, never rainbow/gradient text fills.
10. **NO Glassmorphism or Blur as Lazy Decoration**: Use crisp, solid flat surfaces with intentional contrast.
11. **NO Colored Border-Left / Border-Right Callouts**: Avoid 3px or 4px colored side borders on cards or alerts.
12. **NO Monospace as Costume**: Monospace is for code, data, money, timers, and measurements only.
13. **NO Low-Contrast Microcopy (WCAG 2.2 AA Violation)**: Body and placeholder text must clear >= 4.5:1, large text >= 3:1.
14. **NO Em Dashes in UI Copy**: Use standard hyphens, colons, commas, or concise sentence breaks instead.
15. **NO Vague Marketing Filler**: Write clear, concrete, human domain copy.

## 2. Impeccable Mobile Craft Floor (Rider Console)
- **High-Velocity Operational Ergonomics**: High-contrast, large touch targets (>= 48x48 dp), zero-friction glanceability under direct sunlight.
- **Progressive Navigation**: Single active leg polyline only; future legs unrendered to eliminate map clutter.
- **Asymmetric Vertical Rhythm**: Headings must always have significantly more spacing above them than below them (margin-top >= 1.5-2.5x margin-bottom).
- **Tinted Neutrals (Zero Dead Gray)**: Never use dead black (`#000000`) or dead gray (`#808080`). Tint dark surfaces and text with ambient brand hue.
- **Primary Action Law**: Red has exactly ONE legal meaning: **you must act**. Exactly one primary CTA per viewport.
- **Preserve User Drafts & Telemetry**: Offline action queue, idempotent actions, and persistent draft survival.


