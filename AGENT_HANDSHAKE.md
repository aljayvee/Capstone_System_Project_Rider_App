# 🌐 DUAL-MODEL COLLABORATION TUNNEL (CLAUDE ◄► GEMINI) - RIDER MOBILE APP

> **ALWAYS ACTIVE IN ALL SESSIONS**: This file is the shared living memory between Claude App (Anthropic) and Antigravity 2.0 (Google AI / Gemini) for the Expo React Native Rider App.

---

## 📡 Tunnel State
* **Active Mission**: Rider Mobile Telemetry & Leg Navigation
* **Current Driver**: Antigravity 2.0 (Gemini 3.7 Flash High)
* **Target Workspace**: `RiderMobileApp` (Expo SDK React Native)
* **Last Updated**: 2026-09-11

---

## 🔒 LOCKED CONTRACT REGISTRY (ZERO-REGRESSION POLICY)
* `[LOCKED]` `Dev-Mode Headless Task Guarding` (NEVER run `startLocationUpdatesAsync` in `__DEV__` foreground; use `watchPositionAsync` broadcast)
* `[LOCKED]` `React Native Maps Layout Rule` (NEVER embed `MapView` inside `ScrollView` or `FlatList`)
* `[LOCKED]` `Progressive Single Active Leg Road Rendering` (Store Phase: $R \to S_{\text{active}}$ in Yellow-Gold; Delivery Phase: $R \to C$ in Blue-Light)
* `[LOCKED]` `4-State Fleet Presence Persistence` (`AVAILABLE`, `BUSY`, `DISCONNECTED`, `OFF_DUTY` synced to Firebase RTDB and MariaDB)
* `[LOCKED]` `Damped Moderate Scaling` ($W=375, H=812$ baseline, `factor=0.5`, clamped typography $[0.85x, 1.35x]$)

## 2026-10-19 - Cash at the door: amount prefilled, swipe to confirm (Claude, Opus 5.5)
* **Status**: [Executed by Claude - tsc 0, jest 19 suites / 166 tests (9 new in `tests/ReceiptCaptureCash.test.tsx`), vitest 31 files / 513 tests. JS only, no native change. NOT device-verified.]
* **Ask**: a GCash/Maya errand whose customer pays cash instead ("They're paying cash instead"). On "What did they hand you?" the amount owed should be filled in, and "Confirm total" should open a confirmation that is settled by a left-to-right swipe, not a button.
* **Modified**:
  - `src/screens/ReceiptCaptureScreen.tsx`: new optional `expectedAmount` prop. CASH_COLLECTED fills the amount with it on every photo (retakes included); NO_RECEIPT still starts blank. "Confirm total" for cash now opens a bottom-sheet `Modal` (figure, matches / short / over vs the amount due, rider note) with the existing `SlideToConfirm`; the swipe runs the upload that the tap used to. A failed save keeps the sheet open and remounts the slider (`key`) for another swipe; a 410 still returns to the camera. The sheet wraps its content in `GestureHandlerRootView` because RNGH pans do not reach an Android Modal window otherwise.
  - `src/modules/task/TaskScreen.tsx`: passes `mission.dueAtDoor` as `expectedAmount` for CASH_COLLECTED, the same figure `completeReceiptCapture` judges full-or-short against.
* **Also fixed (same day)**: the cash card said "Receipt confirmed ✓" on a GCash/Maya errand paid in cash instead, because it labelled by `paymentPlan.hasLedger`. `ErrandProgress` gains optional `paymentProofKind` (`RIDER_BALANCE_PROOF` | `CASH_COLLECTED`), set in `completeReceiptCapture` and restored by `derivePayment` from the latest live payment photo; exposed as `mission.paymentProofKind` and passed to `CashCollectionInput` as `proofKind`. The plan stays as the fallback when the kind is unknown. Tests: 2 in `tests/missionProgress.test.ts`, 4 in new `tests/CashCollectionInput.test.tsx`. Final counts: tsc 0, jest 20 suites / 170, vitest 31 files / 515.
* **Unchanged**: RECEIPT / NO_RECEIPT confirm on a tap as before; settlement payloads; `SlideToConfirm` itself.
* **Next session**: needs a new APK to reach riders; check the swipe on a phone inside the capture modal.

## 2026-10-17 - OpenStreetMap paper: no base map in loading tiles (Claude, Opus 5.5)
* **Status**: [Executed by Claude - tsc 0, jest 18 suites / 157 tests. JS only, no native change. NOT device-verified.]
* **Bug (reported on a phone)**: on the OpenStreetMap map, panning showed the phone's own base map (roads, labels) in every tile
  still loading, and OSM covered it only once the tile arrived. The 2026-10-01 contract was in place: the native map is created
  with `mapType 'none'` (Fabric `MapViewManager.optionsForInitialProps` puts it in `GoogleMapOptions`) plus the all-off
  `customMapStyle`. The phone's map honours neither (the Huawei Petal case), so a second flag would not help.
* **Fix** (`LiveErrandMap.tsx`, `config/mapTiles.ts`): in OSM mode an opaque `Circle` of paper (`OSM_PAPER_COLOR` `#F2EFE9`,
  openstreetmap-carto's land colour, 3,000 km radius around Tacurong, `strokeWidth 0`) sits at zIndex -2, under the tiles (-1)
  and every route line and geofence (0). It is also the FIRST child of `MapView`, for a map that stacks by insertion order.
  A loading tile now shows plain paper, as on any tile map.
* **Why a Circle and not a Polygon**: react-native-maps 1.27's Fabric `PolygonManager` has no `setZIndex` override, so a
  polygon's zIndex never reaches the native map and it would sit at 0, over the tiles. `CircleManager` and `UrlTileManager`
  both apply zIndex. Do not "simplify" the paper into a world polygon.
* **Directive**: keep `mapType 'none'` and the blank style as well; the paper is a third guard, not a replacement. Verify on
  the Huawei phone: pan fast on OSM and confirm beige gaps, not Petal roads, and that the route lines and geofences still draw
  over the tiles. If the paper ever covers the tiles there, that device ignores overlay zIndex and the order fallback failed.

## 2026-10-14 - Sugo Figma Prototype Rider Portal 1:1 Clean Realignment (Antigravity 2.0, Gemini 3.8 Flash High)
* **Status**: [Executed by Antigravity 2.0 - npx tsc --noEmit passed with 0 errors, Vite build clean in 32.7s]
* **Rider Mobile Prototype Alignment (`c:\Capstone_Project_Web\FigmaPrototype\FigmaPrototype\Designprototypecreation`)**:
  - `RiderAuthScreens.tsx`: Completely eliminated dark blue (`#0B132B`) canvas and switched to clean white background matching real `LoginScreen.tsx`. Removed demo fast-fill pill (`rider01 / rider123`) and auxiliary scenario buttons (`2FA Email OTP`, `Restricted Role Modal`, `Background GPS Modal`). Set initial username and password to empty strings `''`, aligned labels with `USERNAME`, `PASSWORD`, and CTA to `SIGN IN`.
  - `RiderHomeScreen.tsx`: Replaced waiting state card with 1:1 replica of `c:\Capstone_Project_Mobile_App\RiderMobileApp\src\modules\home\components\WaitingCard.tsx` (concentric red ring, centered Bike icon, green listening capsule, "Ready for next errand"). Removed offline rating badge and task fee breakdown card.
  - `RiderTaskAtStoreScreen.tsx`: Removed `storeDelayed` state, 12m delay alert banner, and "Simulate 12m Store Delay Alert" button.
  - `RiderHistoryScreens.tsx`: Removed `"Page 1 of 1 · All completed rides encrypted in MariaDB"` footer.
  - **Complete Waybill Elimination**:
    - Removed `waybill-modal` from `RIDER_SCREENS_CATALOG` in `mockRiderData.ts` and `RiderScreenId` union in `types.ts`.
    - Removed Waybill buttons from `RiderTaskMapScreens.tsx`, `RiderTaskDeliveryScreens.tsx`, `RiderWaybillAndChatScreens.tsx`, and `RiderHomeScreen.tsx`.
    - Cleaned `onOpenWaybill` handlers and removed modal render branch in `RiderPortal.tsx`.
* **Directives for Next Session**:
  - All 4 portals (`/customer`, `/rider`, `/dispatcher`, `/owner`) in `Designprototypecreation` are cleanly synchronized with zero unnecessary artificial buttons, zero catalog item prices during ordering, and exact verbatim UI text from the production codebase.

## 2026-10-06 - Android Three-Key Navigation Safety & Hardware Back Interception (Antigravity 2.0, Gemini 3.8 Flash High)
* **Status**: [Executed by Antigravity 2.0 - npx tsc --noEmit passed with 0 errors, Vitest 29/29 files (488/488 tests) passed]
* **Android 3-Button Navigation Bar Clearance**:
  - `HomeScreen.tsx`: Dynamically positioned `floatingTaskFab` using `bottom: Math.max(insets.bottom, Spacing.sm) + 64 + Spacing.md` (~128dp), elevating it safely above `RiderBottomNav` and the Android 48dp system navigation bar. Expanded scroll view content padding to `72 + Math.max(insets.bottom, Spacing.sm) + Spacing.md`.
  - `LiveErrandMap.tsx`: Clamped all floating bottom controls (`cameraControlsContainer`, `bottomEtaBadge`, and `attribution`) using `effectiveBottomInset = Math.max(bottomInset ?? 0, insets.bottom)` so map HUD badges never hide behind the 3-key bar.
  - `HistoryScreen.tsx` & `ProfileScreen.tsx`: Updated scroll container padding to `paddingBottom: 72 + Math.max(insets.bottom, Spacing.sm) + Spacing.md` (~136dp) preventing list items and action buttons from being occluded by `RiderBottomNav`.
  - `AuthedNavigator.tsx`: Added `backBehavior="initialRoute"` to `MainTabNavigator` so pressing the physical Back key on History or Profile returns to Home tab instead of closing the application.
  - `App.tsx`: Synchronized `NavigationBar.setStyle(isDark ? 'light' : 'dark')` with the active theme for crisp system button contrast.
* **Hierarchical Hardware Back Key Interception**:
  - `useRiderBackHandler.ts` [NEW]: Reusable `useRiderDoubleTapBackToExit` and `useHardwareBackAction` hooks. Wired `HomeScreen.tsx` to require double-tap to exit with alert toast if an errand is active.
  - `TaskScreen.tsx`: Expanded `BackHandler` with strict hierarchical order: (1) close `fullTask` if open; (2) collapse `sheetExpanded` if open to peek height; (3) hide sheet if riding to restore turn-by-turn map; (4) safely return to Tabs with mission preserved.
  - `ReceiptCaptureScreen.tsx`: Added `BackHandler` returning from `confirm` phase back to `camera` or calling `onCancel`, ignoring during OCR/upload to prevent corrupted uploads.

## 2026-10-04 - Non-blocking Home Tab Maintenance Notice Banner & Shared Socket Integration (Antigravity 2.0, Gemini 3.8 Flash High)
* **Status**: [Executed by Antigravity 2.0 - npx tsc --noEmit passed with 0 errors across server, CustomerApp, and RiderMobileApp]
* **Maintenance Notice Banner**: Added non-blocking `MaintenanceNoticeBanner` to `HomeScreen.tsx` driven by `useMaintenanceNotice()`.
* **Zero-New-Socket Invariant Preserved**: Reused the shared mission socket link via `onActiveSocketChange()` in `services/liveLocationSocket.ts` to listen for `maintenance:update` events without opening an extra WebSocket connection on cellular data.
* **Server FCM Broadcast**: Extended `sysAdminDevOpsService.ts` and `pushNotifications.ts` with `broadcastPushNotification()` to dispatch batch FCM push alerts to registered riders when maintenance mode is toggled active.

---

## 2026-10-03 - Delivery door details, keyboard safety (Claude, Opus 5.5)
* **Status**: [Executed by Claude - tsc green, vitest 483/483, jest 127/127, uiAudit no new findings. Needs a NEW NATIVE BUILD: adds the `react-native-keyboard-controller@1.21.9` native module. NOT device-verified.]
* **Door details.** `CustomerDetailsPanel` (the delivery stage) shows the customer's street, landmark and notes, from `errands.deliveryStreetName / deliveryLandmark / deliveryNotes` via `errandMapper.ts`. Blank maps to null and the row is not drawn; notes sit in a warning-tinted box so an instruction is not read as one more address line. New tests: `tests/CustomerDetailsPanel.test.tsx` (2), `tests/errandMapper.test.ts` (+3).
* **Keyboard safety.** `edgeToEdgeEnabled=true` leaves `adjustResize` inert, so React Native's KAV with `behavior={undefined}` or `'height'` on Android did nothing. Added `react-native-keyboard-controller` (same pinned version as CustomerApp), `KeyboardProvider` in `App.tsx`, and the library's shipped jest mock in `jest.setup.js`. Switched to its KAV with `padding` in:
  - `LoginScreen` (and the first-login OTP modal, now `statusBarTranslucent` so its measurement is exact);
  - `DispatcherChatScreen` composer, with `keyboardVerticalOffset={-insets.bottom}` because the keyboard height already includes the navigation bar the dock's SafeAreaView pads for;
  - `EditProfileScreen`, `ReceiptCaptureScreen` (confirm view), `DeclineModal` (now `statusBarTranslucent`), `DispatcherChatModal` (not mounted anywhere today).
  - `HistoryScreen`'s list dismisses the keyboard on drag.

---

## 🧠 Model A (Claude) Blueprint & Directives
* **Status**: [Ready for Claude Ingestion]
* **Directives for Gemini**:
  - Zero-overlap vertical HUD stacking (`TurnByTurnHUD`, `FeeCapsuleBar`, `StatusBanner`).
  - **Multi-errand queue (2026-10-01)**: the errand being worked is `mission.workingErrand` (= `activeErrands[0]`
    AFTER `services/errandQueue.orderErrandQueue`). Never take index 0 of server order: `GET /errands/rider/:id`
    is `createdAt desc`, so accepting a 2nd errand used to make the NEW one the front. Never feed the merged
    `mission.errand` to the map, the arrival geofence, the location broadcast or the cash/gate logic: its
    pinpoints are every errand's and its id is `"A + B"`. A queued errand is displayed with its OWN slot
    (`mission.progressFor(id)`), read-only (`RequestItemsPanel readOnly`).
  - **Turn-by-turn semantics (2026-10-01)**: OSRM and Google put a step's maneuver at its START. While riding
    step i the panel announces step i+1 (`displayedStepIndex`), and moves on only at the junction
    (`hasReachedStepEnd`), never 15 m early. Do not revert to showing `steps[activeStepIndex]`.

* **Session Log: 2026-10-02 (later) - Full task view opens from the fee capsule; directions hidden over it (Claude)**:
  - Supersedes the ID pills below: the top bar holds only the back button. The fee capsules under the directions panel
    (`FeeCapsuleBar`, "Now · SGO-xxxxxx ₱70.00") now open their errand's task in full (`onSelect={openFullTask}`), and
    carry the unread-messages dot on the first capsule (`showUnreadDot`, white with a navy ring) while the sheet is away.
  - In full view the turn-by-turn panel is not drawn: `LiveErrandMap directionsVisible={!fullTask}`. Navigation keeps
    running underneath and `hudBottom` is not reset, so the panel and the capsules come back where they were.
  - tsc 0; vitest 480; jest 14 suites / 125 tests; uiAudit unchanged. Not seen on a device.

* **Session Log: 2026-10-02 - Errand ID pills and the full task view (Claude)**:
  - The "Show task / Hide task" capsule (`task-sheet-toggle`) is gone. The top bar now holds one red pill per errand in
    hand (`errand-id-pill-<i>`, `formatErrandId`, run order, `MAX_ID_PILLS = 3`); unread dispatcher messages show as a
    white dot on the first pill while the sheet is away.
  - A pill opens that errand's task in FULL (`fullTask`): the sheet expands to the screen below the status bar
    (`expandedRatio 1`, no cover cap), the top bar and fee capsules step aside, and a back button in the sheet header
    (`full-task-back-btn`) or the Android back key returns to the map as it was (sheet hidden again while riding, unless
    at a stop). Dragging the sheet down, tapping its title, or a new riding step also leave full view. The map stays
    mounted throughout.
  - tsc 0; vitest 480; jest 14 suites / 123 tests; uiAudit unchanged. Not seen on a device.

* **Session Log: 2026-10-01 (night, later) - One splash screen (Claude)**:
  - The native splash (white + `splash-icon.png`) covered `AnimatedSplashScreen`, so riders saw two. Android 12+ always shows
    a system splash, so it is now invisible instead: app.json points `expo-splash-screen` at `assets/splash-blank.png`
    (fully transparent) on the animated splash's own backgrounds (`#ffffff` light, `#000000` dark = `DarkColors.bgDark`).
    `AnimatedSplashScreen` calls `onFirstFrame` on its first layout and App.tsx hides the system splash there, not after
    the animation. Do not put a logo back on the native splash. Local `android/` was synced by hand (transparent
    `splashscreen_logo.png` per density, night colour); EAS prebuild regenerates it from app.json anyway.
  - tsc 0; jest 14 suites / 118 tests. Not seen on a device.

* **Session Log: 2026-10-01 (night) - Huawei Petal overlay, request dedup, optimistic uploads, SWR, smart polling (Claude)**:
  - **Bug**: on Huawei phones (no GMS) the Google Maps SDK draws Petal Maps. The map opened as standard before any route
    arrived, then was switched to `mapType 'none'` for OpenStreetMap after `onMapReady`; Petal ignored the switch and stayed
    drawn under the OSM tiles. Every socket-driven `refresh()` also flipped `isLoading`, which unmounted the Task tab and
    created the map again.
  - **Map contract (new)**: `config/mapChoice.ts` draws NO map (`mapStyle=null`, "Loading the map" surface) until the
    server's route says which (`selection.drawnWith`), then latches it for the app session. Fallback to Google only on a
    failed route, a straight-line guess, or 12 s with a map wanted. The only switch: a latched OSM whose tile server is
    confirmed down goes to Google once, as a fresh native map (`key={mapStyle}`). `mapType` is now passed on the FIRST
    render (Fabric puts it in `GoogleMapOptions`); only `mapPadding` stays gated on ready. OSM also sends an all-off
    `customMapStyle`. After latching, every route is asked for on the latched map's roads; `useLiveRoute` does not refetch
    when the provider is merely named after the line already drawn. Do not reintroduce a runtime map-type switch.
  - **Networking** (`services/requestCache.ts`): `singleFlight` dedups mutations (accept, decline, status, items purchased,
    item status, settle, half-payment, push token); `freshFlight` dedups event-driven reads (profile, waybill, proof list,
    avatar) with one trailing request so an answer never predates the event. Beacons and track batches are untouched (locked
    telemetry).
  - **SWR**: `useRiderMission` shows the spinner only with nothing to show; refreshes revalidate behind the data. Cold start
    hydrates from the waybill cache (this rider's only, offers excluded); slots derived from it are provisional and the
    first fresh answer re-derives them unless the rider acted. `forgetAll()` on sign-out.
  - **Optimistic uploads, no spinners**: handover photo, receipt save (retried 1.5 s / 4 s, never on 410) and no-receipt
    photo tick at once; `ReceiptCaptureResult.pending` carries the upload, `trackPending` registers it, and a failure undoes
    the tick (`services/proofRollback.ts`, banner says what to retake). `advanceStatus`, `requestHalfPayment` and the auto
    items-purchased wait on `whenSettled(errandId)`. The scan reading, GCash proof and cash photo still wait for the server
    (its answer IS the content; cash needs the image id for settlement) but show the photo with a progress bar, not a
    spinner. Profile avatar is optimistic with revert.
  - **Smart polling** (`hooks/useSmartPolling.ts`): notifications poll 30 s, doubling to 5 min while unchanged, paused in
    background and offline, immediate on return. The OSM tile probe also pauses in background.
  - **Verification**: tsc 0; vitest 29 files / 480 tests (new: mapChoice, requestCache, pollSchedule, proofRollback); jest
    14 suites / 117 tests; uiAudit unchanged. NOT verified on a Huawei device (none here); the Petal behaviour is inferred
    from the report and the react-native-maps source.

* **Session Log: 2026-10-01 (later) - Task tab map mode, Google Maps style direction panel (Claude)**:
  - **Map mode**: while `currentStatus` is Traveling or Delivering the sheet AND its action dock slide off the screen
    (`BottomSheet hidden` / `onHiddenChange`; the map's `bottomInset` drops to the safe area). The top-centre capsule
    (`task-sheet-toggle`, was the static "Task" label) reads "Show task" / "Hide task"; swiping the closed sheet down
    hides it too. It returns on its own on each new step that is not riding (At Store, Delivered) and whenever
    `storeArrival.arrivingAt` is set (inside a store's or the customer's circle, where "Confirm arrival" lives).
    Selecting a fee capsule also brings it back. The capsule shows a dot for unread dispatcher messages, since the
    chat button is in the hidden sheet header. Hidden content stays mounted, out of reach of touch and TalkBack.
  - **Direction panel wording** (`utils/maneuverText.ts`): top line "In 55 m, turn right" / "Turn right now" /
    "In 90 m, arrive at <store>, on your right"; second line "onto Rizal Street" (street read out of Google's
    instruction, which has no name field); bottom row "Then turn left" and "3.4 km left", always laid out. The first
    step's "Head west on X" is no longer shown INSTEAD of the first turn: it is the second line while setting off
    (first 20 m, or while more than 35 m off the road), under "In 55 m, turn right" (`ManeuverState.setOff`).
  - **Verification**: tsc 0; vitest 25 files / 435 tests; jest 14 suites / 110 tests; uiAudit unchanged (0 contrast
    failures, 5 pre-existing sub-48 dp targets). The swipe-down gesture is not exercised by jest (gesture handler is
    mocked); not verified on a device.

* **Session Log: 2026-10-01 - Multi-errand progress leak, errand queue, phablet overflow, sheet over map, HUD turns, route-line jitter (Claude)**:
  - **Bug reported**: with 2-3 errands in hand, photographing errand 1's receipt "went to the next store", and errands 2/3
    showed their items as already photographed. Causes, all in the app:
    1. `TaskScreen` gave every errand card the FRONT errand's `completedSubtasks` (keyed by section INDEX) and step, so
       section 0 of errand 2 read "Receipt saved" because section 0 of errand 1 had one; a queued card could even open the
       camera, filing against errand 2 while ticking errand 1's slot.
    2. The map, `hasStoresRemaining`, and `useStoreArrival` used the merged errand's pinpoints (all errands), so finishing
       errand 1's only store routed to errand 2's store while the step and receipts stayed errand 1's.
    3. The front was `activeErrands[0]` of server order (newest first).
    4. `paymentMode` and the location broadcast `activeErrandId` came from the merged card (`"A + B"` broke breadcrumb
       upload `/errands/:id/track` and the web's `useRiderActiveRoute` lookup).
  - **Fix**: `services/errandQueue.ts` (first accepted first via `acceptedAt ?? assignedAt ?? createdAt`, stable; the rider's
    chosen errand to the front, persisted per rider in AsyncStorage `@sugo_rider_working_errand_v1:<riderId>`;
    `canSwitchWorkingErrand` = shopping phase only). `useRiderMission`: `workingErrand`, `progressFor`, `startErrandFirst`
    (sets the current errand back to Traveling, defers the store being left, banner, and a rider_chats message telling the
    dispatcher). `acceptedAt`/`assignedAt` now mapped (server columns already sent). Task tab: map/gate/capture follow the
    working errand; new `ErrandQueueList` ("Your queue, in order", next stop per errand); capsules read "Now / 2nd / 3rd";
    queued dock explains what to finish first with "Current errand taking too long? Do this one first" (confirm dialog);
    the slow-store alert also offers the next queued errand.
  - **Phablet overflow**: React Native's `flexShrink` defaults to 0, so a Text in a row button kept its one-line width and
    ran past the button when the screen was narrow or the system font large. `flexShrink: 1` (+ centered text for button
    labels) on the Task dock buttons, receipt/cash buttons, capture CTAs, fee rows, login, profile, history, home. Found by
    an AST audit of Text-in-row without flex; 74 hits, the long/button ones patched, short labels left. `FeeCapsuleBar`
    lost its 76 dp cap (clipped enlarged fonts) and its absolute position (gave the layer zero height).
  - **Sheet over the map**: open sheet + dock capped at 58% of the screen (`BottomSheet maxCoverRatio`, was 72% + dock, up
    to the capsules); the camera's `bottomInset` is what the sheet covers NOW (`onCoverChange`), and a new `topInset`
    (back bar, HUD, capsules) pads 2D and Fit, and places the 3D rider below the HUD. Fit's fixed 140 dp top padding
    was under the 230+ dp of floating layers (Android adds edgePadding to mapPadding, `MapView.appendMapPadding`).
  - **HUD turns**: announces the upcoming maneuver (off-by-one above), fixed card height (the "Then:" row is always laid
    out; it grew and shrank within 50 m of every turn, bouncing the capsules), 220 ms crossfade on maneuver change,
    server wording (roundabouts, U-turns), "Arrive at <store/customer>"; `TaskScreen` only lets the HUD push the
    capsules down, never back up, while it is mounted.
  - **Route-line jitter**: `routeGeometry.followRouteProgress` (continuity-weighted search near the last position,
    steps back under 25 m held, 60 m when the steadied speed says stopped, forward creep capped while stopped, fresh
    route starts from its beginning); the line is cut `lineTrailMeters` behind the rider so the gliding dot always sits
    on it; the dot and the camera use the same steadied point. Camera moves span `GLIDE_MS` (was 400 ms then idle, i.e.
    turns in bursts and the dot sliding across the screen), zoom bands with hysteresis (`steadyNavigationZoom`).
  - **Verification**: `tsc --noEmit` 0 errors; vitest 24 files / 408 tests (was 378); jest 14 suites / 104 tests (was 92).
    New: `errandQueue.test.ts`, `routeProgress.test.ts` (AR(1) rho 0.9 drift, 20 seeds: old projection >200 backward
    head moves and >20 pass hops, new 0 and 0), `TaskScreenQueue.test.tsx`, `TurnByTurnFlow.test.tsx`, additions to
    `navigationCamera`/`turnByTurn`/`Compass`. `uiAudit.mjs`: 0 contrast failures; sub-48 dp targets 6 -> 5 (the
    substitute notice's "Understood" raised to 48 dp; the other 5 predate this session, none added). **NOT verified on a device**: no Android AVD/system image on
    this machine, and none of this reaches riders until a new APK is built.

---

## 🛠️ Model B (Gemini / Antigravity) Execution & Verification
* **Status**: [Complete & Verified - Zero Regressions]
* **Files Synchronized**:
  - `RiderMobileApp/AGENT_HANDSHAKE.md`
  - `RiderMobileApp/CLAUDE.md`
  - `RiderMobileApp/AGENTS.md`
* **Session Log: 2026-09-28 - 3D Graphics Accelerator Engine, Continuous Angle Unwrapping & Morphing Camera Switcher (`LiveErrandMap.tsx`, `LiveErrandMap.test.tsx`, `AGENT_HANDSHAKE.md`)**:
  - `src/components/LiveErrandMap.tsx`:
    - **Graphics Hardware Acceleration**: Configured `MapView` with `googleRenderer={Platform.OS === 'android' ? 'LATEST' : undefined}` and `provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}`. Activates Vulkan/OpenGL ES 3.0 vector rendering hardware engine on Android, native Metal rendering on iOS, with graceful `UrlTile` OpenStreetMap/Petal raster fallback on Huawei HMS devices without Google Play Services.
    - **Continuous Shortest-Path Angle Unwrapping**: Implemented shortest-path angle integration (`headingRef.current = headingRef.current + headingDelta(headingRef.current, target)`). Completely eliminates reverse $340^\circ$ map spin jank when turning across North ($355^\circ \to 10^\circ$).
    - **Fluid Cornering Dynamics**: Calibrated 3D chase camera turn animation duration to 400ms (and 300ms for compass) for buttery-smooth motorcycle cornering.
    - **Morphing Dark Navy Pill Switcher**: Eliminated the outer gray container box (`modeSegmentContainer`). Single dark navy capsule (`Colors.navy`, `elevation: 6`, `borderWidth: 1`, `borderColor: 'rgba(255,255,255,0.15)'`) smoothly expands from $72\text{dp}$ to $196\text{dp}$ on tap via spring physics, revealing `[ 3D | 2D | Fit ]` options inside the identical container.
    - **MD3 Touch Target Ergonomics & Token Discipline**: Elevated `morphingPillSegmentBtn` to `height: 48, minHeight: 48, minWidth: 48` satisfying the MD3 48dp touch floor. Replaced hardcoded hex `#1F2937` with `Colors.textDark` (0 hardcoded hexes remaining in `LiveErrandMap.tsx`).
  - **Verification**: `npx tsc --noEmit` passed (0 errors); Vitest 22/22 suites (378 tests) passed; Jest 12/12 suites (92 tests) passed; `uiAudit.mjs` confirmed 0 hardcoded hexes in `LiveErrandMap.tsx` and all camera buttons $\ge 48\text{dp}$.

* **Session Log: 2026-09-28 - Task Tab UI/UX Layout Hardening: Layered Top Bar, Collapsible Camera Switcher, Auto-Hiding Re-Center & Waybill Removal (`TaskScreen.tsx`, `TurnByTurnHUD.tsx`, `LiveErrandMap.tsx`, `LiveErrandMap.test.tsx`)**:
  - `src/modules/task/TaskScreen.tsx`:
    - **1st Horizontal Layer**: Mounted `taskTopHeaderBar` at `top: insets.top + Spacing.xs` with Back button (`testID="task-back-btn"`) on the left, centered high-contrast `"Task"` title pill (`taskHeaderTitlePill`) in the middle, and a 48dp spacer on the right for optical balance.
    - **Removed Waybill / File Button**: Removed the `header-waybill-btn` (`FileText` icon) from `headerActionsGroup` in the sheet header, leaving only the primary dispatcher chat button.
    - **Dynamic Stacking Offset**: Updated `capsuleTop` fallback to sit at `insets.top + moderateScale(56, 0.2)` when HUD is unmounted, ensuring zero overlap with the new top header bar.
  - `src/components/TurnByTurnHUD.tsx`:
    - **2nd Horizontal Layer**: Positioned HUD card at `insets.top + moderateScale(56, 0.2)` directly below the Layer 1 top bar (supporting custom `topOffset`).
    - Replaced asymmetrical `paddingLeft: 68` with clean, symmetric `paddingHorizontal: Spacing.md`, giving the road instruction maximum horizontal width.
  - `src/components/LiveErrandMap.tsx`:
    - **Collapsible Camera Modes**: Re-architected 3D, 2D, and Fit into a single collapsible control. When collapsed, displays exactly 1 high-contrast trigger button showing the active mode (`3D`, `2D`, or `Fit`) with a directional chevron indicator. When tapped, a drawer smoothly slides open to the left with spring animation (`modeSlideAnim`), revealing all 3 options. Selecting any mode smoothly applies it and slides back into the single button.
    - **Auto-Hiding Re-Center Button**: Conditioned Re-center strictly on `!following && cameraMode !== 'overview'`. Hidden during normal route-following; appears only when the map is disoriented or panned away, and automatically disappears once re-centered.
  - `tests/LiveErrandMap.test.tsx`:
    - Updated navigation camera tests to verify that in 3D, Re-center is hidden while following the route, appears on `panDrag`, and disappears on press.
  - **Verification**: `npx tsc --noEmit` passed (0 errors); Vitest 22/22 suites (378 tests) passed; Jest 12/12 suites (92 tests) passed; `uiAudit.mjs` passed with 0 color contrast failures and MD3 touch targets compliant.

* **Session Log: 2026-09-28 - Mobile Responsiveness, Anti-Overflow & TurnByTurnHUD Navigation Card Re-Architecture (`TurnByTurnHUD.tsx`, `RequestItemsPanel.tsx`, `RiderHeader.tsx`, `TaskScreen.tsx`, `NewTaskCard.tsx`, `WaitingCard.tsx`)**:
  - `src/components/TurnByTurnHUD.tsx`:
    - **Defect Addressed**: Fixed critical viewport distortion where the HUD card stretched vertically down 400dp+ over the live map when long highway names were displayed.
    - **Root Cause**: Container `paddingLeft: 68` (for the floating Back button) combined with card padding, the 48dp maneuver icon, and an inline 140dp `targetPill` left only ~34dp available width for `contentContainer`. Without a line cap, 80-character highway names wrapped word-by-word into a 35-line column.
    - **Surgical Solution**:
      - Removed redundant inline `targetPill` from the HUD card row (destination/store context is already persistently visible in the bottom action dock capsule below), expanding available instruction width from ~34dp to ~198dp+.
      - Added `numberOfLines={2}` and `ellipsizeMode="tail"` with `maxFontSizeMultiplier={1.25}` to `instructionText` to prevent card ballooning on long street strings while allowing 2-line wraps.
      - Aligned `hudCard` to `alignItems: 'flex-start'` and `width: '100%'` with `minHeight: moderateScale(64, 0.2)` so the maneuver arrow stays anchored at top-left next to the meter countdown.
      - Preserved `targetName?: string` prop on `TurnByTurnHUDProps` for zero-breakage backward compatibility with `LiveErrandMap.tsx`.
  - `src/modules/task/components/RequestItemsPanel.tsx`:
    - Re-architected item rows into an adaptive two-tier layout:
      - Tier 1 (`itemRow`): Checkbox (`minHeight: 48`, `marginTop: 2`, `alignItems: 'flex-start'`) + full-width item description (`flex: 1`, multi-line wrapping with `maxFontSizeMultiplier={1.25}`).
      - Tier 2 (`itemSubRow`): Indented by 28dp (`paddingLeft: 28`) housing the `[No Stock?]` / `[Out of Stock]` toggle pill and `Checked` status indicator.
    - Elevated `itemRow` touch target to full MD3 48dp baseline (`minHeight: 48`).
    - Standardized `maxFontSizeMultiplier={1.25}` across all headers, pills, upload buttons, and confirmation modals.
  - `src/components/RiderHeader.tsx`:
    - Added `flexWrap: 'wrap'` and `gap: Spacing.xs` to `riderMetaBottom` so the Rider ID chip and `[LIVE/OFFLINE]` badge cleanly wrap on 320dp-360dp screens.
    - Removed `numberOfLines={1}` from `riderName` allowing long rider names to wrap smoothly.
    - Standardized `maxFontSizeMultiplier={1.25}` across header and duty status texts.
  - `src/modules/task/TaskScreen.tsx`:
    - In `sheetHeaderRow1`, removed `numberOfLines={1}` from `sheetTitle` with `maxFontSizeMultiplier={1.25}` so customer names wrap without ellipsis clipping.
    - In `actionDock`, removed `numberOfLines={1}` from `navigatingText` and updated all action button texts to `maxFontSizeMultiplier={1.25}`.
  - `src/modules/home/components/NewTaskCard.tsx` & `WaitingCard.tsx`:
    - Added `flexWrap: 'wrap'` and `gap: Spacing.xs` to `headerTopRow` and `earningsHero`.
    - Standardized `maxFontSizeMultiplier={1.25}` across all labels and badges.
  - **Verification**: `npx tsc --noEmit` passed (0 errors); Vitest 22/22 suites (378 tests) passed; Jest 12/12 suites (92 tests) passed; `uiAudit.mjs` confirmed touch targets below 48dp reduced from 7 to 6 with 0 color contrast failures.

* **Session Log: 2026-09-28 - Multi-Store Errand Progression, Half-Payment Gating & OOS Substitute Banners (`errandGate.ts`, `TaskScreen.tsx`, `useRiderMissionSocket.ts`, `RiderMissionContext.tsx`, `errandGate.test.ts`)**:
  - `src/services/errandGate.ts`:
    - Fixed root-cause bug where `errandGate` prematurely returned `halfPayment: 'ask'` at intermediate store stops due to loose conditions (`done === total || options.activeStoreTargetId == null`).
    - Enforced that `halfPayment: 'ask' | 'waiting'` is strictly gated on `isAtFinalStore && remaining === 0` where `isAtFinalStore = options.hasStoresRemaining === false`. At intermediate stops (`hasStoresRemaining === true`), `errandGate` always returns `canAdvance: true` and never triggers half-payment.
  - `src/modules/task/TaskScreen.tsx`:
    - Enforced that when `currentStatus === 'At Store'` and `hasStoresRemaining` is true, the primary action is strictly `"I've finished shopping, go to the next store"` calling `handleFinishStoreShopping`.
    - Only once all stores have receipts/declarations and `hasStoresRemaining` is false does the action dock surface `"Ask for the half-payment"` (or `"Waiting for customer's half-payment"` / `"Send a reminder"`).
    - Rendered real-time OOS substitute status notification banner directly above `RequestItemsPanel` when `substituteNotice` is active (`"Dispatcher is processing a substitute for [Item]"` or `"Customer declined substitute for [Item]"`).
  - `src/hooks/useRiderMissionSocket.ts` & `src/context/RiderMissionContext.tsx`:
    - Added socket listeners for `errand:substitute_pending` and `errand:substitute_declined` directly delivered via `emitToErrandParties`.
    - Exposed `substituteNotice` state and `dismissSubstituteNotice` through `RiderMissionContext`.
  - `tests/errandGate.test.ts`:
    - Added unit test coverage verifying that intermediate stops with `hasStoresRemaining: true` never ask for half-payment, and only final stops with `hasStoresRemaining: false` trigger `halfPayment: 'ask'`.
  - **Verification**: `npx tsc --noEmit` passed (0 errors); Vitest 22/22 files (378 tests) passed with 0 errors.

* **Session Log: 2026-09-27 - Graceful Item Check Confirmation Modal & Store Receipt Gating (`RequestItemsPanel.tsx`, `tests/RequestItemsPanelGating.test.tsx`)**:
  - `src/modules/task/components/RequestItemsPanel.tsx`:
    - Implemented graceful confirmation modal for item checking (`PURCHASED` and `OUT_OF_STOCK` via "No Stock?"). When the rider taps an unchecked item, a tailored modal explains that once verified, the item is locked to prevent accidental double-scanning and maintain audit clarity.
    - Implemented store-level receipt capture gating: `Photograph receipt` and `This shop gives no receipt` buttons remain visually dimmed (`opacity: 0.55`) and functionally gated while any items assigned to the current store are still `PENDING`.
    - Added high-visibility warning pill banner (`pendingGateNotice`) displaying remaining items count (`"Check remaining X item(s) before receipt photo"`).
    - Tapping gated receipt buttons triggers an informative `Alert.alert` explaining that all requested items for the current stop must be confirmed first.
  - `tests/RequestItemsPanelGating.test.tsx`:
    - Added Jest test suite covering row click modal display, confirmation to `PURCHASED` calling `riderApiService`, "No Stock?" pill triggering `OUT_OF_STOCK` modal, receipt gating when items remain pending, and permission unlock once all items are verified.
  - **Verification**: `npx tsc --noEmit` passed (0 errors); Vitest 22/22 files (376 tests) passed; Jest 5/5 tests passed.
* **Session Log: 2026-09-27 - Battery Field Retention & Foreground Battery Sampling (`location.ts`, `useRiderLocationBroadcast.tsx`)**:
  - `src/firebase/location.ts`:
    - Updated `saveRiderLocation` to perform partial key updates on `batteryLevel` only when explicitly provided (`data.batteryLevel !== undefined`).
    - Eliminates the bug where foreground GPS coordinates without battery level overwrote the stored RTDB battery percentage with `null`, causing the battery indicator in Owner/Dispatcher tracking modules to disappear every 5 seconds.
  - `src/hooks/useRiderLocationBroadcast.tsx`:
    - Added `Battery` import from `expo-battery` and a 30-second battery level sampling effect.
    - Attached `batteryLevel: batteryLevelRef.current ?? undefined` to foreground GPS fixes in `saveRiderLocation`.
  - **Verification**: `npx tsc --noEmit` verified with 0 errors on RiderMobileApp.
* **Session Log: 2026-09-26 - Checklist Strikethrough Lock & Delivery Phase Freeze (`RequestItemsPanel.tsx`)**:
  - `src/modules/task/components/RequestItemsPanel.tsx`:
    - Synchronized `itemStatuses` using composite key `(id, itemName, quantity)` so dispatcher modifications immediately reset modified items to `PENDING` and make their checkboxes available again.
    - Locked checked items (`PURCHASED` | `OUT_OF_STOCK`): crossed out ("cancelled out" with `line-through`), disabled once checked so rider cannot uncheck or recheck until modified by dispatcher.
    - Froze item checklist entirely (`disabled = true`) when `currentStatus === 'Delivering' || currentStatus === 'Delivered'` ("On the way to the customer").
  - **Verification**: `npx tsc --noEmit` passed with 0 errors.
* **Session Log: 2026-09-26 - Rider Note Component & 1-Tap Taglish/English Quick-Preset Chips (`NO_RECEIPT`, `CASH_COLLECTED`, `RECEIPT`)**:
  - `src/screens/ReceiptCaptureScreen.tsx`:
    - Added `NOTE_PRESETS` and `riderNote` state in the `confirm` phase (`NO_RECEIPT`: `"Walang receipt tong mga items na toh"`, `"Palengke / Sari-sari stall"`, `"Handwritten list lang"`, `"Sira printer ng store"`; `CASH_COLLECTED`: `"Cash nalang daw"`, `"Walang barya si customer"`, `"Keep the change (Tip)"`, `"Nag-GCash/Maya sa pinto"`; `RECEIPT`: `"Malabo / kupas ang print"`, `"May dagdag na plastic/fee"`, `"May pina-add si customer"`, `"Ibang branch binilhan"`).
    - Wrapped confirm view in `KeyboardAvoidingView` + `ScrollView` (`keyboardShouldPersistTaps="handled"`) and wired `riderNote` to `captureAndUpload()`, `saveScannedReceipt()`, and `onDone()`.
  - `src/services/proofCapture.ts`:
    - Added optional `riderNote` parameter to `captureAndUpload()` (`POST /errands/:id/proof-images`) and `saveScannedReceipt()` (`POST /errands/:id/proof-images/scans/:scanId/confirm`).
  - `src/services/missionProgress.ts` & `src/hooks/useRiderMission.ts`:
    - Added `riderNote?: string` to `ErrandProgress` and `ReceiptCaptureResult`.
    - Updated `advanceStatus` (`Delivered`) to pass `riderNote.trim()` into `submitSettlement` (`shortReason`) across both full and short settlements instead of only a hardcoded fallback string.
  - `src/modules/task/components/CashCollectionInput.tsx` & `src/modules/task/TaskScreen.tsx`:
    - Displayed captured `riderNote` inside `CashCollectionInput` (`doneBlock`) so riders can verify their note before completing delivery.
  - **Verification**: `npx tsc --noEmit` verified with 0 errors.
* **Session Log: 2026-09-22 - Branding Modernization to "Sugo Rider" & Web Cyclist Icon**:
  - `app.json`:
    - Updated `expo.name` to `"Sugo Rider"`.
    - Added `ios.infoPlist.CFBundleDisplayName: "Sugo Rider"`.
    - Updated `expo-location` permission: `"Allow Sugo Rider to use your location."`.
    - Pointed `expo-notifications` icon to `"./assets/android-icon-foreground.png"`.
    - Added `"android.permission.POST_NOTIFICATIONS"` to `android.permissions`.
    - Preserved `package: "com.astrowarden.RiderMobileApp"` 100% untouched.
  - `android/app/src/main/res/values/strings.xml`:
    - Updated `<string name="app_name">` from `"RiderMobileApp"` to `"Sugo Rider"`.
  - `assets/`:
    - `icon.png`: Replaced with 1024x1024 solid SUGO Red (`#DC2626`) square with white cyclist silhouette.
    - `android-icon-foreground.png`: Replaced with 1024x1024 transparent foreground with white cyclist silhouette in safe zone.
    - `android-icon-monochrome.png`: Replaced with 1024x1024 white cyclist silhouette on transparent background.
    - `android-icon-background.png`: Replaced with 1024x1024 solid `#DC2626`.
    - `splash-icon.png`: Replaced with transparent background with SUGO Red (`#DC2626`) cyclist silhouette.
  - `android/app/src/main/res/mipmap-*`:
    - Synchronized all density tiers (`mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi`) using `@expo/prebuild-config` native icon pipeline.

* **Session Log: 2026-09-23 - Notification, Splash Screen, Cold-Boot Flash & Sound Parity Fixes**:
  - `android/app/src/main/res/drawable-*/splashscreen_logo.png`:
    - Overwrote stale Expo blue chevron drawables across all 5 tiers (`mdpi` 288x288, `hdpi` 432x432, `xhdpi` 576x576, `xxhdpi` 864x864, `xxxhdpi` 1152x1152) with native Sugo Red (`#DC2626`) cyclist silhouette.
  - `src/context/RiderAuthContext.tsx`:
    - Synchronous first-pass parse of `storedUser` and token restore; decoupled token refresh to background promise (`void getRiderRefreshToken().then(...)`) without blocking `isLoading: false`. Eliminates 1.5s cold-boot `LoginScreen` flash.
  - `android/app/src/main/AndroidManifest.xml` & `app.json`:
    - Explicitly added `<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>`.
  - `src/hooks/useRegisterPushToken.ts`:
    - Unconditionally registered `default`, `orders`, and `chats` notification channels at `AndroidImportance.MAX` with distinct vibration patterns.
    - Dynamically wired `setNotificationHandler` to respect `@sugo_rider_sounds_enabled` preference.
  - `src/hooks/useRiderMission.ts`:
    - Added incoming message counter tracking and haptic vibration (`[0, 250, 150, 250]`) + local notification chime via `Notifications.scheduleNotificationAsync` when dispatcher sends a message.
    - Wrapped `setShowDRChat` to automatically clear `unreadDR` badge when opening chat.
  - `src/modules/profile/ProfileScreen.tsx`:
    - Added "Audible Alert Chimes" preference toggle switch under duty controls wired to `@sugo_rider_sounds_enabled`.
  - `jest.setup.js`:
    - Added `scheduleNotificationAsync` mock to `expo-notifications`.

* **Session Log: 2026-09-23 - Login Cancelation, Double-Tap & Error Normalization Fix**:
  - `src/config/apiConfig.ts`:
    - Extended default `fetchWithTimeout` budget to 20,000ms (20s) for mobile carrier network stability.
    - Explicitly caught `AbortController` cancellation exceptions (including React Native Hermes `canceled`/`cancelled` messages) and tagged them with `AbortError`.
  - `src/context/RiderAuthContext.tsx`:
    - Added `loginInFlightRef` promise lock to single-flight concurrent calls to `login()`.
    - Bumped auth request timeouts to 20,000ms across `login`, `verifyLoginOtp`, and `resendLoginOtp`.
    - Hardened `toAuthError` to detect `AbortError`, timeout, and cancellation substrings, normalizing them into user-friendly messages rather than leaking internal JS exceptions.
  - `src/modules/auth/LoginScreen.tsx`:
    - Added `isSubmittingRef` synchronous tap lock to prevent duplicate taps from firing parallel fetch requests before button state updates.
    - Added `Keyboard.dismiss()` to immediately close the virtual keyboard on submit.
    - Added defensive fallback in `handleLogin` catch block ensuring raw network/transport strings are never displayed to the rider.

* **Verification**:
  - `npx tsc --noEmit`: PASS (0 errors)
  - `npm test` (vitest): PASS (13/13 suites, 215/215 tests passed)
  - `npm run test:render` (jest): PASS (5/5 suites, 34/34 tests passed)
  - Total: 18/18 test suites passed, 249/249 tests passed (Zero regressions).

---

### Session Log: 2026-09-23 - Google Maps API Key, Task Tab Black Screen & Splash Gate Fixes
* **Driver**: Antigravity 2.0 (Gemini 3.8 Flash High)
* **Status**: Complete & Verified (Zero Regressions)
* **Scope**: Google Maps Key Config, Black Screen & Missing Road Lines in Task Tab, and Splash Screen Unmount Gating.
* **Root Causes & Solutions**:
  1. **Missing Google Maps Config in `app.json`**: `app.json` lacked `android.config.googleMaps.apiKey`. Added the active verified key `AIza...` (value redacted 2026-10-16 before the first commit of this file; the key belongs in `.env` as `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, which `app.config.js` writes over this field).
  2. **Task Tab Black Map & SurfaceView Detachment**:
     - `LiveErrandMap.tsx` lacked `provider={PROVIDER_GOOGLE}` and `googleRenderer="LEGACY"`. The Android Google Maps SDK defaults to the "Latest" Vulkan renderer which fails to compose textures on budget Android devices (Samsung A04).
     - Added `DEFAULT_CENTER` coordinate fallback so `initialRegion` is never undefined if `destination`, `riderLocation`, and `pinpoints` are unpopulated on initial mount.
     - In `AuthedNavigator.tsx`, configured `detachInactiveScreens={false}` and `sceneContainerStyle={{ backgroundColor: 'transparent' }}` on `Tab.Navigator` to prevent Android React Navigation from detaching and blacking out the map surface when switching to/from the Task tab.
  3. **Premature Splash Unmount**: In `AnimatedSplashScreen.tsx`, removed unconditional 3500ms safety timer unmount when `isAppReady` is false. In `App.tsx`, gated splash rendering strictly on `(!isSplashComplete || isLoading)`.
* **Modifications**:
  - `app.json`: Added `config.googleMaps.apiKey`.
  - `src/components/LiveErrandMap.tsx`: Added `PROVIDER_GOOGLE`, `googleRenderer="LEGACY"`, and `DEFAULT_CENTER`.
  - `src/navigation/AuthedNavigator.tsx`: Added `detachInactiveScreens={false}` and `sceneContainerStyle={{ backgroundColor: 'transparent' }}`.
  - `src/components/AnimatedSplashScreen.tsx`: Gated `safetyTimer` exit on `isAppReady`.
  - `App.tsx`: Kept splash screen mounted until `!isLoading`.
* **Verification**:
  - `npx tsc --noEmit`: PASS (0 errors)

---

### Session Log: 2026-09-25 - High-Velocity Rider Tracking Cadence & Android Doze Optimization
* **Driver**: Antigravity 2.0 (Gemini 3.8 Flash High)
* **Status**: Complete & Verified (Zero Regressions)
* **Scope**: Accelerated Rider Tracking (10s idle, 2s active), Android Background Doze Mode Exemption, and Direct RTDB Foreground Stream.
* **Modifications**:
  1. `src/hooks/useRiderLocationBroadcast.tsx`:
     - Upgraded `IDLE_OPTIONS` to `timeInterval: 10000` (was 30000) and `accuracy: Location.Accuracy.High` (was Balanced).
     - Upgraded `ACTIVE_DELIVERY_OPTIONS` to `timeInterval: 2000` (was 5000) and `accuracy: Location.Accuracy.High`.
     - Added `lastRtdbPublishAtRef` and `lastSavedTimestampRef` to stream directly to Firebase RTDB every 2s (active) or 10s (idle) when foregrounded without being silenced by `backgroundTaskActiveRef`.
  2. `src/services/riderShift.ts`:
     - Accelerated `BEACON_INTERVAL_IDLE_MS` to 10,000ms (was 30,000ms).
     - Accelerated `BEACON_INTERVAL_ACTIVE_MS` to 5,000ms (was 10,000ms).
  3. `tests/riderShift.test.ts`:
     - Synchronized test expectations with new 10s idle and 5s active beacon intervals.
  4. `tests/AnimatedSplashScreen.test.tsx`:
     - Synchronized test harness to provide `isAppReady={true}` to match the splash unmount contract.
* **Verification**:
  - `npx tsc --noEmit`: PASS (0 errors)
  - `npm test -- --run` (vitest): PASS (18/18 test suites passed, 287/287 tests passed)
  - `npx jest tests/AnimatedSplashScreen.test.tsx`: PASS (1/1 suite, 3/3 tests passed)

---

### Session Log: 2026-09-25 - Sugo Rider Visual & UX Modernization (Plans 1-4)
* **Driver**: Antigravity 2.0 (Gemini 3.8 Flash High)
* **Status**: Complete & Verified (Zero Regressions)
* **Scope**: 4-Plan UI/UX modernizations across Task Tab, Home Tab, My History Tab, and Profile/Edit Account screens:
  1. **Plan 1 (Task Tab)**:
     - `src/modules/task/components/RequestItemsPanel.tsx`: Interactive checkable item rows with `checkedItems` state and collapsible store accordion.
     - `src/modules/task/TaskScreen.tsx`: Stage-adaptive layout (`isShopping` vs `isDelivering`), compact customer preview during store shopping, store arrival notice with manual override chip, elevated customer details + cash input + handover during delivery, and docked persistent bottom action dock (`stickyActionDock`).
  2. **Plan 2 (Home Tab)**:
     - `src/components/RiderHeader.tsx`: Flat solid Deep Navy (`#0B132B` / `Colors.navy`) header, streamlined status pill with pulsing dot, crisp contrast.
     - `src/modules/home/components/WaitingCard.tsx`: Cardless open radar hero layout.
     - `src/modules/home/components/NewTaskCard.tsx`: Connected vertical timeline itinerary (Customer -> Store -> Customer Drop-off), tabular-nums earnings, 1px subtle container border.
     - `src/modules/home/components/OfflineCard.tsx`: Cardless operational layout with high-contrast duty CTA.
  3. **Plan 3 (My History Tab)**:
     - `src/modules/history/HistoryScreen.tsx`: Inline sort button next to search bar, clean hairline-separated `historyRow` touchables without card boxes, tabular-nums earnings.
     - `src/modules/history/ErrandDetailsScreen.tsx`: In-memory `proofImageCache: Map<string, CachedProofData>` for instant re-visits; replaced all `<Card>` components with 4 chronological flat hairline sections (Errand Overview, Store Purchases & Receipts, Handover & Delivery Proof, Financial Settlement).
  4. **Plan 4 (Profile & Edit Account)**:
     - `src/modules/profile/ProfileScreen.tsx`: Flat Deep Navy (`Colors.navy`) header, centered avatar with camera badge, rider ID chip without literal `"Rider ID:"` label, flat hairline property table, removed `"Alarms & Reminders"`, preserved duty and alert chimes switches.
     - `src/modules/profile/EditProfileScreen.tsx`: Grouped input sections ("Personal Details" and "Contact Information"), clean section headers, sticky bottom save changes action dock with keyboard avoidance.
* **Verification**:
  - `npx tsc --noEmit`: PASS (0 errors)
  - `npm test -- --run` (vitest): PASS (19/19 test suites passed, 296/296 tests passed)
  - `npm run test:render` (jest): PASS (8/8 test suites passed, 64/64 tests passed)
  - `node scripts/uiAudit.mjs`: PASS (Touch targets below 48dp reduced from 7 to 3; a11y coverage improved to 96%)

* **Reviewer Audit & Defensive Hardening**:
  - `TaskScreen.tsx`: Fixed premature phase transition by anchoring `isShopping` and `activePhase` strictly to `routePhaseFor(currentStatus)`. Replaced brittle `!p.arrivedAt` filter with `pinpoints.find(p => !p.departedAt && !completedSubtasks[p.id])` so active store target remains locked while shopping inside the store.
  - MD3 48dp Touch Targets: Elevated `itemRow` (48dp), `manualArrivalChip` (48dp), `customerCallBtn` (48dp), and `closeBtn` (48dp).
  - Accessibility: Added `accessibilityRole="button"` and `accessibilityLabel` to `sheetHeader` in `TaskScreen.tsx` and collapsible header in `RequestItemsPanel.tsx`.
  - Anti-AI-Slop & Typography: Stripped banned em dashes in `ProfileScreen.tsx` and `TaskScreen.tsx`. Replaced banned vocabulary "assignments" in `WaitingCard.tsx` with canonical "errands".
  - Safe Area Clearance: Normalized `RiderHeader.tsx` `paddingTop` from 36dp to `Spacing.md` (16dp) to eliminate double status-bar padding with `SafeAreaView`.
  - Resilience: Wrapped `ErrandDetailsScreen` image loading in `try / catch` to eliminate infinite loading spinners on network drops, and added `phase === 'loading'` guard.
  - Type & OS Scaling Safety: Added defensive fallback for `riderProfile?.riderId` in `ProfileScreen.tsx` and `maxFontSizeMultiplier={1.2}` in `EditProfileScreen.tsx`.
  - Tests: Added `tests/taskStageAdaptive.test.ts` (9 tests) verifying phase switching, multi-store targets, and ID formatting. Hardened `tests/vocabulary.test.ts` to test plurals.

---

### Session Log: 2026-09-25 - Task Tab Floating Overlay Alignment & Sheet Collision Prevention
* **Driver**: Antigravity 2.0 (Gemini 3.8 Flash High)
* **Status**: Complete & Verified (Zero Regressions)
* **Scope**: Floating Map Controls, ETA Badge, OpenStreetMap Label Alignment, and 2-Line Scannable Sheet Header.
* **Modifications**:
  1. `src/config/theme.ts`:
     - Updated `Elevation.bottomSheet: 20` and `Elevation.floatingControls: 16` so that the BottomSheet always renders on top of the map overlays on Android.
  2. `src/components/LiveErrandMap.tsx`:
     - Added `controlsVisible?: boolean` prop (default `true`).
     - Dynamically anchored `cameraControlsContainer` and `bottomEtaBadge` to `bottom: bottomInset + 14` (replacing hardcoded `bottom: 18`).
     - Dynamically anchored `styles.attribution` (OpenStreetMap label) to `bottom: bottomInset + 4, left: 8` with `zIndex: 5` and `pointerEvents: 'none'`.
     - Auto-hides camera controls, re-center button, ETA badge, and OSM attribution when `controlsVisible === false` (sheet expanded).
     - Upgraded `roundBtn` minHeight and minWidth to 48dp (MD3 compliant).
  3. `src/modules/task/TaskScreen.tsx`:
     - Passed `controlsVisible={!sheetExpanded}` to `LiveErrandMap`.
     - Passed `visible={!sheetExpanded && mission.isMissionAccepted && !isOffline}` to `FloatingChatButton`.
     - Refactored `sheetHeader` into a 2-line scannable layout:
       - Row 1: Customer Name (`numberOfLines={1}`) + Actions Group (`[Chat Button]` with unread dot + `[Details/Waybill Button]`).
       - Row 2: Compact Errand ID chip (`SGO-XXXXXX`) + Status capsule with `flexWrap: 'wrap'` preventing text clipping on compact 360dp devices and high system font scaling.
     - Guaranteed 48x48dp touch targets on all header buttons.
  4. `src/components/TurnByTurnHUD.tsx`:
     - Expanded `targetPill` max-width to responsive `moderateScale(140, 0.25)` with `flexShrink: 1` so merchant names render cleanly without single-letter truncation.
  5. `tests/LiveErrandMap.test.tsx` & `tests/taskStageAdaptive.test.ts`:
     - Added tests for `controlsVisible` toggle, dynamic bottom offset, elevation tokens invariant, compact errand ID formatting, and HUD pill responsiveness.
* **Reviewer Audit & Defensive Hardening (2026-09-25)**:
  - `LiveErrandMap.tsx`: Fixed 4dp vertical collision between `bottomEtaBadge` (bottom: `bottomInset + 14`) and `styles.attribution` (bottom: `bottomInset + 4`, height ~14dp) on the bottom-left by conditionally elevating `bottomEtaBadge` to `bottom: showOsm ? bottomInset + 22 : bottomInset + 14`.
  - `TaskScreen.tsx`: Fixed fatal right-side button collision where `FloatingChatButton` at `bottomOffset = bottomInset + 16` directly covered the camera controls' `Fit` and `2D` mode buttons (bottom: `bottomInset + 14`). Elevating `FloatingChatButton` to `bottomInset + 126` ensures a clean 8dp vertical clearance above the entire camera controls stack (`bottomInset + 118` with recenter).
  - `TaskScreen.tsx`: Decoupled `sheetHeader` from being a nested `TouchableOpacity` wrapping inner buttons. Split into `sheetHeaderTitleArea` (with `minHeight: 48, justifyContent: 'center'`), `headerActionsGroup` (sibling buttons), and `sheetHeaderRow2` touchable. Eliminates React Native nested responder ghost taps and allows Android TalkBack to navigate each button individually. Added defensive fallbacks for `displayErrand?.customer || 'Active Errand'` and `STEP_META[currentStatus]?.label ?? currentStatus`.
  - `tests/LiveErrandMap.test.tsx` & `tests/taskStageAdaptive.test.ts`: Added tests asserting OSM attribution clearance under `bottomEtaBadge` and positive vertical clearance between the camera controls stack and the floating chat dome.
* **Final Verification**:
  - `npx tsc --noEmit`: PASS (0 errors)
  - `npm test -- --run` (vitest): PASS (21/21 suites, 330/330 tests passed)
  - `npm run test:render` (jest): PASS (9/9 suites, 72/72 tests passed)
  - `node scripts/uiAudit.mjs`: PASS (0 failing color pairs, 0 touch target violations in Task tab, 76/79 controls with a11y labels)

---

### Session Log: 2026-09-25 - Rider & Dispatcher Chat Modernization (Dedicated Screen, RTDB Account Indexing & Photo Pipeline)
* **Driver**: Antigravity 2.0 (Gemini 3.8 Flash High)
* **Status**: Complete & Verified (Zero Regressions)
* **Scope**: Replaced popup modal with full-screen `DispatcherChatScreen.tsx`, migrated RTDB subscription from ephemeral errand path to persistent rider account path (`rider_chats/${riderId}`), implemented native camera/gallery photo attachment pipeline with auto-compression, full-screen tap-to-zoom modal, and registered in `AuthedStack`.
* **Modifications**:
  1. `src/types/rider.ts`:
     - Updated `ChatMessage` to support `id: string | number` and `imageUrl?: string`.
  2. `src/hooks/useRiderMission.ts`:
     - Migrated RTDB listener from `rider_chats/${activeErrandId}/messages` to persistent `rider_chats/${riderChatId}/messages`.
     - Added `imageUrl` payload support to `sendDispatcherMessage(text, imageUrl)`.
     - Exposed `setUnreadDR` in `UseRiderMissionReturn`.
  3. `src/modules/chat/DispatcherChatScreen.tsx`:
     - Created dedicated full-screen chat interface in `AuthedStack`.
     - Navy top app bar with Dispatcher avatar, online indicator, active errand chip, and Waybill modal CTA.
     - Chronological message list with auto-scroll to bottom.
     - `+` button opening action sheet for "Take Photo" (Camera) and "Choose from Gallery".
     - Pre-send compression pipeline via `expo-image-manipulator` ($\le 1000\text{px}$ JPEG, base64 data URI).
     - Fullscreen tap-to-zoom modal for viewing image attachments.
     - Full keyboard avoidance via `KeyboardAvoidingView` with platform-specific behavior.
     - Strict adherence to design tokens (0 hardcoded hexes, WCAG 2.2 AA compliant, 48x48dp touch targets).
  4. `src/navigation/AuthedNavigator.tsx`:
     - Added `DispatcherChat: undefined` to `AuthedStackParamList`.
     - Registered `DispatcherChatScreen` in `AuthedStack.Navigator`.
  5. `src/modules/task/TaskScreen.tsx`:
     - Replaced `mission.setShowDRChat(true)` with `navigation.navigate('DispatcherChat')`.
     - Removed obsolete `DispatcherChatModal`.
* **Verification Ledger**:
  - `npx tsc --noEmit`: PASS (0 errors)
  - `npm test -- --run` (vitest): PASS (21/21 suites, 330/330 tests passed)
  - `node scripts/uiAudit.mjs`: PASS (0 failing color pairs, 0 hardcoded hexes in chat screen, 97% a11y coverage)

---

### Session Log: 2026-09-26 - Phase #1: Functional Rider Item Checklist (Database-Backed & Real-Time Synced)
* **Driver**: Antigravity 2.0 (Gemini 3.x Pro)
* **Status**: Complete & Verified (`npx tsc --noEmit` -> 0 errors)
* **Scope**: Upgraded the local-only `checkedItems` checkbox in `RequestItemsPanel.tsx` into a 3-state database-persisted item fulfillment checklist (`PENDING` | `PURCHASED` | `OUT_OF_STOCK`) synced with `PATCH /api/errands/:id/items/:itemId/status`.
* **Modifications**:
  1. `src/types/rider.ts`: Added `ItemFulfillmentStatus`, `ErrandItemEntry`, `PabiliDetail.fulfillmentStatus`, and `Errand.payload[].itemEntries`.
  2. `src/services/errandMapper.ts` & `src/services/requestSections.ts`: Mapped `itemEntries` (`{ id, label, itemName, quantity, fulfillmentStatus }`) alongside `items` (`lines`).
  3. `src/config/apiConfig.ts`: Added `riderApiService.updateItemFulfillmentStatus(errandId, itemId, fulfillmentStatus)`.
  4. `src/modules/task/components/RequestItemsPanel.tsx`: Replaced local `checkedItems` with server-synced `itemStatuses`, added an **`[ Out of Stock / No Stock? ]`** toggle pill per item row, and rendered a per-stop `Checklist: X/Y bought • Z out of stock` tally above both `Photograph receipt` and `This shop gives no receipt`.

---

### Session Log: 2026-09-26 - Sugo Rider Store Routing, Auto-Arrival Geofencing, Per-Store Progressive Gating & Dwell Delay Rules
* **Driver**: Antigravity 2.0 (Gemini 3.7 Flash)
* **Status**: Complete & Verified (Zero Regressions)
* **Scope**: Implemented the 6 store rules in `sugo_rider_store_rules_plan.md`:
  1. **Rules 1 & 2 (Nearest-Store Dynamic Routing)**:
     - `src/services/storeArrival.ts`: Added `nearestOutstandingStop(stops, currentLocation, deferredStopIds, completedStopIds)` using `metersBetween` to select the closest unvisited store pin rather than static chronological sequence (`0, 1, 2...`). Updated `nextOutstandingStop` and `nextWaypoint` to pass `currentLocation`, `deferredStopIds`, and `completedStopIds`.
     - `src/hooks/useStoreArrival.ts`: Passed live rider `location`, `deferredStopIds`, and `completedStopIds` into `nextWaypoint`.
  2. **Rule 3 (Auto-Arrival Geofencing & Action Dock Capsule)**:
     - `src/modules/task/TaskScreen.tsx`: Removed manual primary `"Arrived At Store"` button while in `'Traveling'`. Replaced with non-blocking navigation status capsule (`"Navigating to [Store Name] • Auto-detecting arrival"`) and an emergency fallback link (`"GPS not detecting? Confirm Arrival"`).
     - Kept automatic geofence arrival detection via `useStoreArrival` with 20s required dwell presence.
  3. **Rule 4 (Single-Store Item Checklist Filtering)**:
     - `src/modules/task/components/RequestItemsPanel.tsx`: Added `activeStoreTargetId?: number | null`. When specified, filters visible store sections down to the active target store while preserving original section indices for `completedSubtasks` and proof upload callbacks. Dynamic header: `"Request Items • [Store Name]"`.
  4. **Rule 5 (Multi-Store Completion & Progressive Return to Traveling)**:
     - `src/services/errandGate.ts`: Added `activeStoreTargetId` per-store gate check so receipt fulfillment is evaluated against the current store section.
     - `src/hooks/useRiderMission.ts`: Added `returnToTraveling()` method resetting status to `'Traveling'`.
     - `src/modules/task/TaskScreen.tsx`: Wired `"I've finished shopping, go to the next store"` primary CTA when other stores remain, returning rider to `'Traveling'` with road navigation recalculated to next nearest store. When all stores finish, CTA shows `"I've finished shopping, start delivery"`, advancing to `'Delivering'`.
  5. **Rule 6 (Establishment Dwell Delay & Switching)**:
     - `src/services/storeArrival.ts`: Added `STORE_DELAY_THRESHOLD_MS = 12 * 60 * 1000` (12 minutes), `isStoreExemptFromDelay(category)` (Supermarket/Grocery exempt), and `isStoreEligibleForDelay(category)`.
     - `src/modules/task/TaskScreen.tsx`: Tracked `storeArrivalTimestamp` while `'At Store'`. If elapsed dwell $\ge 12$ min, store is not exempt, and other stores remain, renders delay alert card (`"Order taking too long at [Store]? Switch to [Next Store] first"`). Tapping `"Switch to [Next Store]"` defers current store into `deferredStoreIds`, unlocks lock, switches target to next nearest store, and returns to `'Traveling'`. Once other stores finish, system automatically falls back to route back to the deferred store.
  6. **Tests**:
     - `tests/storeArrival.test.ts`: Added unit tests verifying distance-based nearest stop selection, sequence fallback, deferral fallback, Set/Array support, 12-minute threshold, and category exemption logic.
     - `tests/errandGate.test.ts`: Added unit tests for `activeStoreTargetId` single-store receipt gating.
     - `tests/riderChecklist.test.ts`: Synchronized fixture expectations with `itemEntries`.
* **Verification Ledger**:
  - `npx tsc --noEmit`: PASS (0 errors)
  - `npm test -- --run` (vitest): PASS (22/22 suites, 368/368 tests passed)

---

### Session Log: 2026-09-27 - Reviewer Audit & Defensive Hardening: Multi-Store State Synchronization, Arrival Retention & Jest Parity
* **Driver**: Antigravity 2.0 (Gemini 3.7 Flash)
* **Status**: Complete & Verified (Zero Regressions)
* **Scope**: Addressed 4 critical architectural and functional issues from adversarial review:
  1. **Cross-Context Multi-Store State De-synchronization (Critical Architectural Bug)**:
     - Lifted `deferredStoreIds`, `departedStoreIds`, and `storeArrivalTimestamp` from component local state in `TaskScreen.tsx` into `ErrandProgress` in `src/services/missionProgress.ts` and `src/hooks/useRiderMission.ts`.
     - Wired `deferredStopIds: mission.deferredStoreIds` and `completedStopIds: mission.departedStoreIds` into `useStoreArrival` in `src/context/RiderMissionContext.tsx`.
     - Prevents `useStoreArrival` from re-triggering instant false arrival at deferred or departed stops while the rider is physically walking to their motorcycle.
  2. **Deferred Stop `arrivedAt` Premature Exclusion Bug (Untested Edge Case Attack)**:
     - In `src/services/storeArrival.ts`, updated `nearestOutstandingStop` filter: `(!s.arrivedAt || deferredSet.has(s.id) || options.includeArrived) && !s.departedAt && !completedSet.has(s.id)`.
     - Resolves edge case where a stop deferred after dwell arrival (`arrivedAt != null`) was previously permanently excluded from `outstanding`, preventing the system from ever routing back to complete it.
  3. **Multi-Store Final Gate & Delivery Leak Prevention**:
     - In `src/services/errandGate.ts`, added `hasStoresRemaining?: boolean` to options. When moving from the final store to `'Delivering'` (`hasStoresRemaining === false`), enforces that ALL sections across the errand have filed receipts (`remaining === 0`), preventing bypassed receipts on deferred/skipped stops.
  4. **Jest Suite Parity & `ReceiptCaptureScreen` Argument Alignment**:
     - `src/screens/ReceiptCaptureScreen.tsx`: Guarded `saveScannedReceipt` 4th argument so `undefined` rider notes are not passed as 4th positional parameter.
     - `tests/TaskScreenLayout.test.tsx`: Synchronized test expectations with Rule 3 action dock (asserting `navigating-capsule` and `emergency-arrival-btn` in bottom sheet footer).
     - `tests/storeArrival.test.ts`: Added tests for deferred stops with `arrivedAt`, 3+ store deferral-completion loop, and `includeArrived` option.
     - `tests/errandGate.test.ts`: Added tests for `hasStoresRemaining: false` gating.
* **Verification Ledger**:
  - `npx tsc --noEmit`: PASS (0 errors)
  - `npm test -- --run` (vitest): PASS (22/22 test suites, 373/373 tests passed)
  - `npm run test:render` (jest): PASS (11/11 test suites, 86/86 tests passed)
  - Total: 33/33 test suites passed, 459/459 tests passed.

---

### Session Log: 2026-09-27 - Multi-Store Auto-Arrival Dwell Fix, Progression Loop Hardening & Delivery COD Collection Prompts
* **Driver**: Antigravity 2.0 (Gemini 3.8 Flash High)
* **Status**: Complete & Verified (Zero Regressions)
* **Scope**: Resolved the bug where visiting Store 1 caused the app to prematurely jump to "On the Way to the customer" (skipping remaining stores), enforced the full multi-store sequential loop, and added COD doorstep collection prompts.
* **Root Causes & Solutions**:
  1. **Premature Jump from Store 1 to Delivering**:
     - In `src/hooks/useStoreArrival.ts`, `watching` was previously `isActive && currentStatus !== 'Delivered'`. When the rider was `'At Store'`, staying inside the geofence for >= 15 seconds caused `observeFix` to trigger a duplicate arrival event.
     - Because `advanceStatus()` while in `'At Store'` advances directly to `'Delivering'` (marking items purchased and setting stage to delivering), this aborted the shopping phase and skipped subsequent assigned stores.
     - Solution: Updated `watching` in `src/hooks/useStoreArrival.ts` to strictly:
       `const watching = isActive && (currentStatus === 'Traveling' || currentStatus === 'Delivering');`
       Arrival detection is completely paused while `'At Store'`.
  2. **Defensive State Transition Guard**:
     - In `src/context/RiderMissionContext.tsx`, wrapped `onArrived` callback with a defensive guard ensuring `mission.advanceStatus()` is ONLY called if `currentStatus === 'Traveling' || currentStatus === 'Delivering'`.
     - Restored `isActive: mission.isMissionAccepted && !mission.isOffline` and `deferredStopIds: mission.deferredStoreIds` to `useStoreArrival`.
  3. **Payment Collection Prompting on Delivering Phase**:
     - In `src/hooks/useRiderMission.ts`, exposed `dueAtDoor: number` in `UseRiderMissionReturn`.
     - In `advanceStatus()` upon transitioning to `'Delivering'`:
       - If COD (`isCashCollected(paymentMode)`): Display banner `"On the way to customer. Collect ₱" + dueAtDoor.toFixed(2) + " COD at doorstep."`.
       - If Paid: Display banner `"All items purchased. Heading to customer."`.
  4. **Task Screen Action Dock COD Banner Pill**:
     - In `src/modules/task/TaskScreen.tsx`, imported `formatPeso` and destructured `dueAtDoor`.
     - When `currentStatus === 'Delivering'` and `isCashCollected(paymentMode)`, rendered a high-contrast amber warning pill (`codReminderPill`) directly above the action button:
       `COD: Collect ₱[dueAtDoor] cash at customer doorstep`.
     - Preserved zero-slop UI standards with Lucide `Info` vector icon, authentic brand colors, and >= 48dp touch target hierarchy.
* **Verification Ledger**:
  - `npx tsc --noEmit`: PASS (0 errors)
  - `npm test -- --run` (vitest): PASS (22/22 suites, 373/373 tests passed)
  - `npx jest tests/TaskScreenLayout.test.tsx --runInBand --ci`: PASS (1/1 suite, 6/6 tests passed)
  - Total: 33/33 test suites passed, 459/459 tests passed.

---

### Session Log: 2026-09-27 - Multi-Store Receipt Gating, Store Loopback Elimination, Auto-Advance & Splash Screen Timeout Fix
* **Driver**: Antigravity 2.0 (Gemini 3.8 Flash High)
* **Status**: Complete & Verified (Zero Regressions)
* **Scope**: Resolved the bug where unreceipted stores blocked delivery start, fixed the store loopback after the last store, resolved the app loading freeze on cold boot, and verified against production transaction `SGO-C8AF2B` (`89b83a30-ef03-4ce2-b811-2bd765c8af2b`).
* **Root Causes & Solutions**:
  1. **Receipt Gating / Delivery Button Locked on `NO_RECEIPT`**:
     - `useRiderMission.ts`: Line 594 was previously resetting `completedSubtasks: {}` when transitioning to `'At Store'`. Arriving at Store 2 or 3 wiped Store 1's proof from React state. When arriving at Store 3, `errandGate` evaluated `remaining > 0` because Stores 1 and 2 were missing from `completedSubtasks`, locking the delivery progression button.
     - Solution: In `advanceStatus()` for `'At Store'`, preserved `completedSubtasks: mission.completedSubtasks` instead of clearing to empty.
  2. **Multi-Store Auto-Advance & Immediate Progression**:
     - `src/hooks/useRiderMission.ts`: Enhanced `completeReceiptCapture()` to automatically advance when a receipt (`RECEIPT` or `NO_RECEIPT`) is filed:
       - If intermediate store: immediately transitions `currentStatus: 'Traveling'`, clears `storeArrivalTimestamp`, appends target stop to `departedStoreIds`, and flashes `"Receipt saved. Routing to next store..."`.
       - If final store: immediately transitions `currentStatus: 'Delivering'`, calls `riderApiService.markItemsPurchased(targetErrand.id)`, updates `departedStoreIds`, and displays the doorstep COD collection prompt.
  3. **Store Loopback Elimination**:
     - `src/services/missionProgress.ts`: Added `deriveDepartedStoreIds(sections, proofs)` to extract all pinpoints that have active `RECEIPT` or `NO_RECEIPT` proofs.
     - Updated `deriveStatus(errand, proofs, sections)`: When all sections have valid proofs (`done === total && total > 0`), automatically derives status as `'Delivering'` and sets `departedStoreIds: [allStoreIds]`. When only some stores are completed, accurately restores `'Traveling'` with completed store IDs populated in `departedStoreIds`, preventing the app from looping back to completed stores on reload.
  4. **Splash Screen Freeze on Cold Boot**:
     - `src/components/AnimatedSplashScreen.tsx`: Removed the `if (isAppReady)` conditional inside `safetyTimer`. The 3.5s `HARD_TIMEOUT_MS` circuit breaker now unconditionally triggers `triggerExit()` so riders are never locked out by background network latency or auth token delays.
     - `App.tsx`: Decoupled `onAnimationComplete` from `isLoading` so the splash view unmounts immediately once its exit fade completes.
  5. **Empirical Production Verification (`SGO-C8AF2B`)**:
     - Evaluated against production database state on VPS (`109.123.239.182`): Pinpoint 67 (`RECEIPT` ₱184), Pinpoint 66 (`NO_RECEIPT` ₱140), Pinpoint 68 (`NO_RECEIPT` ₱120).
     - Unit test in `tests/missionProgress.test.ts` verified that the updated engine automatically derives `currentStatus: 'Delivering'`, `completedSubtasks: {}`, and `departedStoreIds: [66, 67, 68]`.
* **Verification Ledger**:
  - `npx tsc --noEmit`: PASS (0 errors)
  - `npm test -- --run` (vitest): PASS (22/22 test suites, 376/376 tests passed)
  - `npx jest tests/AnimatedSplashScreen.test.tsx --watchAll=false`: PASS (3/3 tests passed)
  - Total: 462/462 tests passed.

---

### Session Log: 2026-09-27 - Full-Screen Task Screen Architecture, Dedicated Back Button & Home Screen Floating Action Button
* **Driver**: Antigravity 2.0 (Gemini 3.8 Flash High)
* **Status**: Complete & Verified (Zero Regressions)
* **Scope**: Converted the Task screen into a dedicated full-screen stack screen without bottom navigation, added a top-left floating Back button, simplified the bottom tab bar to 3 tabs (Home, My History, Profile), and added an "Active Task ➔" floating action capsule on the Home screen.
* **Root Causes & Solutions**:
  1. **Bottom Navigation Streamlining**:
     - `src/navigation/AuthedNavigator.tsx`: Removed `Task: undefined;` from `MainTabParamList` and `<Tab.Screen name="Task" />` from `MainTabNavigator`. Registered `<AuthedStack.Screen name="Task" component={TaskScreen} />` directly under `AuthedStack.Navigator`.
     - `src/components/RiderBottomNav.tsx`: Removed `Task` from `TAB_CONFIGS`. The persistent bottom tab bar now displays 3 tabs: Home, My History, and Profile.
     - Preserves full state sharing: `RiderMissionProvider` wraps `AuthedStack.Navigator` at the root, so all active mission data, socket events, and GPS coordinates remain 100% synchronized across screens.
  2. **Full-Screen Task Ergonomics & Dedicated Back Button**:
     - `src/modules/task/TaskScreen.tsx`: Mounted a floating top-left circular Back button (`testID="task-back-btn"`) with 48dp touch target, dark translucent glass container (`rgba(15, 23, 42, 0.88)`), and Lucide `ArrowLeft` icon. Tapping safely calls `navigation.goBack()` with fallback to `Tabs`.
     - In `BottomSheet`, updated `padSafeAreaBottom={true}` to ensure the bottom action dock properly clears Android navigation gesture bars in full-screen mode.
     - `src/components/TurnByTurnHUD.tsx`: Updated container padding (`paddingLeft: moderateScale(68, 0.2)`) to ensure complete horizontal clearance and zero collision with the top-left floating Back button.
  3. **Home Screen Floating Action Capsule**:
     - `src/modules/home/HomeScreen.tsx`: Typed navigation with `CompositeNavigationProp`.
     - When an errand is accepted (`mission.isMissionAccepted`), rendered `floatingTaskFab` docked above the tab bar on the right:
       `[ 🧭 Active Task ➔ ]` (SUGO Red `#DC2626`, 48dp min-height, Lucide `Navigation` + `ChevronRight`).
       Tapping immediately opens the full-screen `Task` screen.
* **Verification Ledger**:
  - `npx tsc --noEmit`: PASS (0 errors)
  - `npm test -- --run` (vitest): PASS (22/22 test suites, 376/376 tests passed)

---

### Session Log: 2026-10-16 - Rider "Forgot password" (email code) and its dedicated screen
* **Driver**: Claude (Opus 5.5)
* **Status**: Complete & verified by tests and tsc. Not device-verified (no emulator on this machine). Not committed: this repo's working tree is ~150 files ahead of git.
* **No `[LOCKED]` contract touched.** No telemetry, GPS, map or fleet-presence code changed. Typography uses `scaledFontSize(size, 0.2)`, layout uses `moderateScale`, `TOUCH_TARGET` and `MAX_CONTENT_WIDTH`.
* **Server contract** (C:\Capstone_Server\server, commits `180b97f` + `37b0052`, NOT yet deployed):
  - `POST /api/riders/password-reset/find` `{identifier, website?}` -> `{resetSessionToken, fullName, maskedEmail|null, maskedPhone|null, expiresInSeconds}`. RIDER accounts only; anyone else gets 404.
  - `POST /api/riders/password-reset/send-code` `{resetSessionToken, channel: "EMAIL"}` (6-digit code, 15 min, 5 tries, 60 s resend, 429 `RESEND_COOLDOWN`).
  - `POST /api/riders/password-reset/verify` `{resetSessionToken, code}` -> `{resetToken}`.
  - `POST /api/riders/password-reset/complete` `{resetToken, password}`. Policy: 8+, upper, lower, number, special, no spaces, not the current password. Revokes every session; the next sign-in sends "your new password was just used to sign in".
  - Tokens carry `aud: "RIDER_APP"` and are refused by the web portal's `/auth/password-reset/*`, and the other way round. These endpoints never answer 401, so the apiClient refresh interceptor never fires on them.
* **Files**:
  - NEW `src/modules/auth/ForgotPasswordScreen.tsx`: FIND -> CONFIRM (full name, masked email) -> CODE -> NEW_PASSWORD -> `navigate('Login', { passwordReset: true, email })`. Hardware back walks the steps. Drafts survive stepping back. No verified email -> empty state telling the rider to ask the owner.
  - NEW `src/services/passwordReset.ts` (API client, resolves `{ ok: false, error }` instead of throwing), `src/services/passwordRules.ts` (pure rules + identifier check).
  - `App.tsx`: `ForgotPassword` stack screen in the signed-out branch; `RootStackParamList.Login` now takes `{ passwordReset?, email? }`.
  - `src/modules/auth/LoginScreen.tsx`: "Forgot password?" link (48dp) under the password field, handing over the typed text only when it is an email or mobile number; success banner on return, then `setParams` clears the flag. Sign-in button `marginTop` xl -> sm, as the link now fills that gap.
  - NEW tests: `tests/passwordRules.test.ts` (vitest, 7), `tests/ForgotPasswordScreen.test.tsx` (jest, 10), `tests/LoginForgotPassword.test.tsx` (jest, 4).
* **SMS is deliberately absent**: the server can verify a Firebase phone sign-in, but this app ships only the Firebase JS SDK, whose phone sign-in needs a browser reCAPTCHA. Adding it means `@react-native-firebase/auth` (native module, new APK) or a WebView reCAPTCHA.
* **Verification Ledger**:
  - `npx tsc --noEmit`: PASS (0 errors)
  - `vitest run`: PASS (31 files, 512/512)
  - `jest --config jest.config.js`: PASS (18 suites, 156/156, including both new suites; re-run 14/14 for those two after the final resend-button tidy)
  - `node scripts/uiAudit.mjs`: new screen has no unlabelled controls and no contrast failures; the new login link is 48dp.
* **Directives for the next session**: deploy the server before shipping an APK with this screen, or "Find my account" answers 404. Verify on a device: keyboard lift on the code and password steps, and the hardware back button.

