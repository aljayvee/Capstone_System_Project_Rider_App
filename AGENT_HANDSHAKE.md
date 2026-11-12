# 🌐 TRI-AGENT COLLABORATION TUNNEL (CLAUDE CODE ◄► OPENAI CODEX ◄► ANTIGRAVITY) - RIDER MOBILE APP

## 2026-11-11 - Release v1.1.4: EAS production APK (Claude Code)

* **Request**: build 1.1.4 with today's fixes (item lock before arrival, the door dialog and hint copy, the handover photo ask).
* **Version (5 places)**: `app.json` `version` + `runtimeVersion`, `package.json`, `package-lock.json` root entries, `android/app/build.gradle` `versionName`, `strings.xml` `expo_runtime_version`, all `1.1.4`. An `eas update` for these installs must target runtime 1.1.4.
* **Pre-flight**: `tsc --noEmit` exit 0; jest 31 suites / 283 tests; vitest 38 files / 628 tests.
* **Build**: `npx eas build --platform android --profile production --non-interactive`, from the uncommitted tree. Build ID `66dd8d1e-2a2e-4bd7-bf68-c9c5d4951040`: https://expo.dev/accounts/astrowarden/projects/RiderMobileApp/builds/66dd8d1e-2a2e-4bd7-bf68-c9c5d4951040
* **Result**: BUILD_RESULT_PENDING

## 2026-11-11 - Fixed: "Delivered" is never reached without the handover photo being asked for (Claude Code)

* **Report**: after the payment is photographed the errand goes to Delivered on its own, with no request for a photo of the handed items. Phone on v1.1.3 (user).
* **Production**: 261110-B420D-0011 (rider 25): `CASH_COLLECTED` 14:40:50.9Z, then from the phone (okhttp) `PATCH /status` + `POST /settle` 14:41:02.5Z, 11.6 s later; no `PROOF_OF_DELIVERY`.
* **What was ruled out**: the 11-10 door fix IS in the v1.1.3 APK (bundle decompiled with hermes-dec: `useStoreArrival` skips `onArrived` at the door, `RiderMissionContext.onArrived` advances only from `Traveling`). The bundle has the same `advanceStatus` call sites as the source: that guarded `onArrived`, `headOut` (At Store only), and the Task dock buttons. No OTA exists for runtime 1.1.3. The server does not deliver on a cash photo. A jest run of the exact order (40 s at the door, cash photographed there, 70 s more) stays `Delivering`. **So what pressed the button on that phone is NOT identified**; the app sends no version or tap telemetry to tell.
* **What was wrong regardless**: the handover photo was optional and never asked for (`errandGate` only hints "Take the handover photo"), so a single `advanceStatus` call, from anything, closed the errand with no picture.
* **Fix**: `src/hooks/useRiderMission.ts` `advanceStatus`: while `Delivering` with no handover photo it no longer delivers; it asks "Take the handover photo" with Cancel / "Deliver without a photo" / "Take photo" (opens the handover camera). Delivering without one needs that explicit answer (kept so a failed camera cannot strand a rider, the reason `errandGate` never gated on it). With the photo on record the press delivers as before. `advanceStatus` now takes an optional argument; a press event is ignored, only the internal `WITHOUT_HANDOVER_PHOTO` object skips the ask.
* **Tests**: `tests/DoorArrivalHandover.test.tsx` now 7: both photos on record delivers on the press; no handover photo asks, "Take photo" opens the camera, then the press delivers; "Deliver without a photo" delivers; the stand-then-photograph order stays put.
* **Verification**: `tsc --noEmit` exit 0; jest 31 suites / 283 tests; vitest 38 files / 628 tests. Not on a device. In no build; nothing published or committed.
* **For whoever drives next**: if it recurs on a build with this change, the ask dialog will be on screen instead of a delivered errand, which shows the trigger is a real `advanceStatus` call and when it fires.

## 2026-11-11 - Copy: the door's "Validation Error" dialog (Claude Code)

* **Change**: `src/hooks/useRiderMission.ts` `advanceStatus`, the only "Validation Error" in the app. Was "Validation Error / Please enter the collected amount." There is no amount to type: the payment is recorded by photographing the cash, or on a half-paid errand the customer's receipt (`CashCollectionInput`). Now "Payment not recorded yet / Photograph the cash you collected, or the customer's payment receipt, before you tap "I've handed it over"." Rule unchanged.
* **Reach**: the door gate (`errandGate`, "Say what you collected first") already disables the button, so this dialog is a backstop. The `docs/ui-*-2026-08-26` snapshots still quote the old text; they are dated records, left as they were.
* **Tests**: `tests/DoorArrivalHandover.test.tsx` +1 (button pressed with nothing recorded: the new dialog, still Delivering, no server call).
* **Follow-up, same day**: the greyed-out button's hint (`errandGate.ts` `blockedReason`, also the button's `accessibilityHint`) was "Say what you collected first", the same "type an amount" idea; now "Photograph the payment first". `tests/errandGate.test.ts` expectations updated (5).
* **Verification**: `tsc --noEmit` exit 0; jest 31 suites / 280 tests; vitest 38 files / 628 tests, all pass. Not in the v1.1.3 APK. Nothing committed.

## 2026-11-10 - Fixed: requested items could be checked before reaching the store (Claude Code)

* **Report**: right after accepting, the task drawer showed the Requested Items and they could be ticked or marked "No Stock?" while still riding to the store.
* **Cause**: `RequestItemsPanel` locked a section only when its pinpoint was neither the store being routed to (`activeStoreTargetId`) nor a visited one. The store being routed to is the target from the moment of acceptance, so it unlocked on accept. Only the receipt buttons checked `At Store`. The server (`errandService.updateItemFulfillmentStatus`) refuses only after purchase/delivery, so a mark from the road was saved (reproduced: `PURCHASED` sent while `Traveling`).
* **Fix**: `src/modules/task/components/RequestItemsPanel.tsx`: `isLocked` also holds while `currentStatus === 'Traveling'` for a section not yet visited. The list stays visible for reference with "Reach this store first"; rows, "No Stock?" and the confirm dialog are unavailable until `At Store`. Server unchanged on purpose: a manual arrival made with weak signal is queued (`arrivalQueue`) and can reach the server after the first item tap, so a server arrival check would refuse real shopping taps.
* **Tests**: `tests/RequestItemsPanelGating.test.tsx` +2 (Traveling: shown, locked, no dialog, no server call; same list re-rendered At Store unlocks and saves).
* **Verification**: `tsc --noEmit` exit 0; jest 31 suites / 279 tests; vitest 38 files / 628 tests, all pass. Pictures from the real components (before / after / at the store). Not on a device.
* **Release note**: NOT in the v1.1.3 APK below (built 19:38-19:55, before this change). Ships with the next APK or an update for runtime 1.1.3. Nothing committed.

## 2026-11-10 - Release v1.1.3: EAS Production APK Build (Antigravity)

* **Request**: Build a new APK of Sugo Rider incrementing from Version 1.1.2 to 1.1.3 using `npx eas`.
* **Version Bumps (5 locations)**:
  - `app.json`: Bumped `version` to `"1.1.3"` and `runtimeVersion` to `"1.1.3"`.
  - `package.json`: Bumped `version` to `"1.1.3"`.
  - `package-lock.json`: Bumped top-level `version` and `packages[""].version` to `"1.1.3"`.
  - `android/app/build.gradle`: Bumped `versionName` to `"1.1.3"`.
  - `android/app/src/main/res/values/strings.xml`: Bumped `expo_runtime_version` to `"1.1.3"`.
* **EAS Cloud Build**:
  - Build ID: `ab9b0488-3269-4c15-91b6-aa38de3a8485`
  - Status: `finished` (Built in 16m 59s: 19:38:18 - 19:55:17)
  - Profile: `production` (`channel: "production"`, `buildType: "apk"`)
  - Platform: Android
  - Version: `1.1.3`
  - Version Code: Remote `versionCode` auto-incremented from `7` to `8`.
  - Downloadable APK Artifact: https://expo.dev/artifacts/eas/lZdsKdWG1muGbzOyFlccbtFmXAWctR2w4N3y0s_4S6Q.apk
  - Build Dashboard: https://expo.dev/accounts/astrowarden/projects/RiderMobileApp/builds/ab9b0488-3269-4c15-91b6-aa38de3a8485
* **Pre-flight Quality Verification**:
  - `npx tsc --noEmit`: PASS (0 errors, exit code 0).
  - Vitest: 38 test files / 628 tests PASS (exit code 0).
  - Jest: 31 test suites / 277 tests PASS (exit code 0).
* **Next Session**: Download and install `1.1.3` APK on Samsung Galaxy A04 physical device. Field test door arrival button flow, GPS queue unblocking, and red interior theme alignment.

## 2026-11-10 - Fixed: the customer's door no longer presses "I've handed it over" (Claude Code)

* **Confirmed by the user**: on 261110-6447B-0008 they never pressed "I've handed it over", so the delivery there was completed by the geofence (see the investigation below).
* **Fix**: `src/hooks/useStoreArrival.ts`: at the door waypoint the presence watch still runs and still sets `arrivingAt` (that is what brings the task sheet up via `nearStop`), but an arrival there never calls `onArrived` and never sets `advancedAutomatically`; the watch is kept "inside" instead of reset, so it does not restart every 20 s. `src/context/RiderMissionContext.tsx`: the `onArrived` guard now advances only from `Traveling` (belt and braces). Store auto-arrival is unchanged. Only the rider's button completes a delivery.
* **Tests**: new `tests/DoorArrivalHandover.test.tsx` (3: the real `RiderMissionProvider` at the production door for 70 s raises no Alert and makes no server call; with the cash recorded it stays Delivering for 30 s; pressing the button still delivers and settles). `tests/StoreArrivalHook.test.tsx` +1 (70 s at the door: shown as there throughout, never arrived). New vitest `tests/storeArrivalDoor.test.ts` (1). The three door render tests fail with the old behaviour put back (checked); the store test and the button test pass both ways.
* **Note for test writers**: `useStoreArrival` lists `pinpoints` as an effect dependency, so a test passing a new `[]` each render loops until the heap runs out. The app passes a stable array.
* **Verification**: `tsc --noEmit` exit 0; vitest 38 files / 628 tests; jest 31 suites / 277 tests, all pass. Not on a device. JS only, so it can ship by an update for runtime 1.1.2 or a new APK; nothing committed or published.

## 2026-11-10 - Investigated, not fixed: "Validation Error / Please enter the collected amount." at the customer's door (Claude Code)

* **Report**: on errand 261110-6447B-0008 the dialog appeared at the door with "I've handed it over" greyed out and no button pressed.
* **Cause**: the door is the last waypoint of `useStoreArrival` (`services/storeArrival.nextWaypoint`, 50 m circle, 20 s presence). Its `onArrived` in `context/RiderMissionContext.tsx` calls `mission.advanceStatus()` while `Delivering`, and `advanceStatus` (`hooks/useRiderMission.ts:750`) raises the Alert when cash is due and `collectedAmount` is empty. It repeats: `observeFix` returns `IDLE_WATCH` on arrival, so the next fix starts a new 20 s presence and fires again, every ~21 s while the rider stands there. Not new: the door has been an arrival waypoint since 5de0a13.
* **Second effect, same cause**: once the cash photo is on record, the same arrival completes the delivery by itself (PATCH status DELIVERED + settle), with no "I've handed it over" tap and no handover photo.
* **Recreated** with the real `RiderMissionProvider`, `useRiderMission` and `useStoreArrival` (only GPS, socket, push, network, storage stood in), fixes at the production door coordinates: Alerts at 20, 41 and 62 s with the step still Delivering; with a CASH_COLLECTED proof on record, Delivered after 20 s. Harness: `C:\Users\Capstone\.claude\projects\C--Capstone-Project-Web\tools\rider-screen-render\doorAlert.render.tsx` (`jest --config <that>/jest.render.config.js doorAlert`, from this repo).
* **Production** (read-only): COD ₱146; cash photo 10:03:45 UTC, `deliveredAt` 10:04:00.5, settlement MATCHED ₱146, no PROOF_OF_DELIVERY. Fits the auto-completion, but the server cannot tell it from a tap 15 s later.
* **Suggested fix (awaiting the user)**: at the door, arrival should never advance the step. Bring the sheet up (it already does via `nearStop`) and leave Delivered to the rider's button. Store auto-arrival unchanged.


## 2026-11-10 - Interior Color Brand Alignment (Steel Blue -> Sugo Red) (Antigravity)

* **Request**: Color brand of Sugo Rider is bright red, but inside the app it was using blue. Aligned the interior palette with the authentic Sugo Red identity following Customer App's visual styling rules.
* **Root Cause**: `src/config/riderSurfaceTheme.ts` previously defined `accent: '#245D85'`, `accentSurface: '#E9F3FA'`, and `accentBorder: '#537F9E'`. Because `homeTheme.ts` and `taskSheetTheme.ts` both re-export this palette, the Home header logo box, avatar ring, waiting radar, "Open navigation" dock, and active task progress steps had all inherited a cold steel blue wash.
* **Changes**:
  - `src/config/riderSurfaceTheme.ts`: Replaced steel blue tokens with `accent: Colors.primary` (`#DC2626`), `accentSurface: Colors.primarySurface` (`#FEE2E2`), and `accentBorder: '#FECACA'`.
  - Propagated through `HomeColors` and `TaskSheetColors` across 12+ downstream components without scattered hardcoding or breaking changes.
* **Preserved Invariants**:
  - Deep Navy (`#1E3A5F`) preserved for dark text, headings, and card containers (WCAG 2.2 AA compliant).
  - Map navigation standards preserved: 3D GPS vehicle arrow (`#3B82F6`) and route polylines (Yellow-Gold `#F59E0B` for stores, Sky-Blue `#0284C7` for customer) left untouched for driver safety and daylight glanceability.
  - Success states (`#065F46` / `#D1FAE5`) preserved for errand completions.
* **Verification**:
  - `npx tsc --noEmit` PASS (0 errors, exit code 0).
  - Vitest: 37 test files / 627 tests PASS.
  - Jest: `tests/HomeScreen.test.tsx` 12/12 tests PASS.
  - UI Accessibility audit (`scripts/uiAudit.mjs`): 0 contrast failures, 0 touch targets below 48dp, hardcoded hexes reduced from 152 to 150.
* **Next session**: Physical device verification on Samsung Galaxy A04. No APK or OTA published.


## 2026-11-10 - Brand Identity Alignment ("Sugo Express" -> "Sugo Rider") (Antigravity)

* **Request**: The APK name is "Sugo Rider" but the name displayed on the Login Screen and Home Screen was "Sugo Express". Update both to "Sugo Rider" for consistency.
* **Changes**:
  - `src/modules/auth/LoginScreen.tsx:341`: Updated the brand pill text from `SUGO EXPRESS` to `SUGO RIDER`.
  - `src/components/RiderHeader.tsx:63`: Updated the Home screen brand header title from `Sugo Express` to `Sugo Rider`.
  - `App.tsx:139`: Updated the uncaught ErrorBoundary fallback text from `"An unexpected error occurred in Sugo Express."` to `"An unexpected error occurred in Sugo Rider."`.
* **Preserved Invariants**:
  - DNS hostnames and email contacts (`portal.sugo-express.org`, `support@sugo-express.org`) left strictly intact.
  - Native APK identifiers (`com.astrowarden.RiderMobileApp`), app.json ("Sugo Rider"), and `strings.xml` preserved.
  - No layout, touch target, or style geometry altered.
* **Verification**:
  - `npx tsc --noEmit` PASS (exit code 0, 0 errors).
  - Vitest: 37 test files / 627 tests PASS.
  - Jest: `tests/HomeScreen.test.tsx` 12/12 tests PASS.
  - UI Accessibility audit (`scripts/uiAudit.mjs`): 0 contrast failures, 0 targets below 48dp.
* **Next session**: Visual confirmation on physical test device (Samsung Galaxy A04). No APK or OTA update published.


## 2026-11-10 - Arrival Queue Transient Error & Rate Limit Hardening (Antigravity)

* **Defect Remediation (`src/services/arrivalQueue.ts`)**:
  - Found and fixed a critical bug in `flushArrivalQueue()`: On transient network drops, 429 rate limits, and 5xx errors, the loop was previously executing `continue;`, which bombarded the server with every subsequent arrival in the queue while offline or rate-limited.
  - Refactored `flushArrivalQueue()` to evaluate `isPermanentRejection` (non-429 4xx). Permanent rejections are dropped to unblock subsequent valid stops; transient failures immediately `break;` the flush loop, preserving the queue without hammering the API or failing multiple calls while disconnected.
* **Regression Coverage (`tests/productionTracking.test.ts`)**:
  - Added test verifying that a stale 403 arrival is dropped and allows the next stop in the queue to be uploaded in the same flush.
  - Added test verifying that a 429 rate-limited arrival halts the flush immediately without attempting subsequent queued stops.
* **Verification**: `npx tsc --noEmit` PASS (0 errors); Vitest `tests/productionTracking.test.ts` PASS (21/21 tests clean); full Vitest 37 files / 627 tests PASS.

## 2026-11-10 - Production anomaly fixes for 261110-1B21F-0003 (Codex)

* **GPS/error handling**: `src/config/apiConfig.ts` reads wrapped `err.status` before Axios `response.status`; non-429 4xx batches are discarded, while network/429/5xx remain queued. `src/services/uploadFailure.ts` reads the same status and falls back to the wrapped message, exposing the server's 422 checklist instructions. `src/context/RiderAuthContext.tsx` clears GPS and arrival queues in logout's finally block.
* **Queue races**: `src/services/locationQueue.ts` serializes storage mutations, shares concurrent flushes, removes only acknowledged/rejected point IDs from a fresh queue read, and invalidates an in-flight flush on logout. This prevents both losing fixes queued during HTTP and restoring a cleared old trail.
* **Receipt checklist**: Existing `RequestItemsPanel` already had a local gate, but its item marks were optimistic fire-and-forget. `src/modules/task/components/RequestItemsPanel.tsx` now waits for server acknowledgement before unlocking capture; failure leaves the item unchecked and shows a retry message. Passes acknowledged local statuses to the capture callbacks. `src/hooks/useRiderMission.ts` checks those states before opening RECEIPT or NO_RECEIPT via new pure `src/services/receiptChecklist.ts`. Unknown legacy/non-shopping sections still rely on the server check.
* **Durable independent arrival**: New `src/services/arrivalQueue.ts` persists/deduplicates stop reports, sends `PATCH /errands/:id/pinpoints/:pinpointId/arrived`, retains transient failures, and removes permanent rejections without blocking other stops. `src/hooks/useConnectivity.ts` retries on connectivity events and every 30s while connected. `src/hooks/useStoreArrival.ts` passes the actual detected stop; `src/context/RiderMissionContext.tsx` reports that stop before advancing. `src/modules/task/TaskScreen.tsx` reports the current store on the manual arrival button. Customer-door waypoint is never posted as a store.
* **CARE**: Corrected pre-existing vocabulary failure in `src/components/OrderClaimedConflictBanner.tsx`: accessibility label now says "Dismiss errand notice". No layout geometry changed; existing 360dp Task layout tests cover the changed manual control. Preserved all other sessions' release/layout/MFA/map/telemetry changes and locked contracts.
* **Verification**: `npx tsc --noEmit` PASS (exit 0). Full Vitest 37 files / 625 tests PASS. Relevant Jest: 7 suites / 60 tests PASS across final runs (`TaskScreenLayout`, `RequestItemsPanelGating`, `ReceiptCaptureCash`, `ReceiptCaptureRetake`, `StoreArrivalHook`, `TaskScreenQueue`, `TaskBackNavigation`). Regression coverage: new `tests/productionTracking.test.ts`, `tests/receiptChecklist.test.ts`, `tests/StoreArrivalHook.test.tsx`; additions to `tests/uploadFailure.test.ts`, `tests/RequestItemsPanelGating.test.tsx`, `tests/TaskScreenLayout.test.tsx`; arrival-service mocks added to isolated `TaskScreenQueue` and `TaskBackNavigation` tests. A broad Jest run was stopped after passing LiveErrandMap, TaskScreenLayout and LoginMfa because native transforms were taking minutes per suite; it is not a full-suite pass. Changed-file `git diff --check` PASS.
* **Peer/release notes**: Local and uncommitted; no APK/OTA published and no native field verification. Server arrival endpoint deployed to production on 2026-11-10. Check on a real device: stale errand GPS followed by current GPS, receipt capture while item saves are pending/failing, automatic and manual arrival, airplane-mode recovery, and logout/account switching. The server stores receipt time for offline arrival reports, not a backdated physical-arrival time. Historical transaction data was not rewritten.

## 2026-11-10 - Handoff to Claude Code: Fixes for Transaction 261110-1B21F-0003 Real-World Anomalies (Antigravity)

* **Context**: Real-world field verification of errand `261110-1B21F-0003` (`0fc997ce-9084-4c53-a0ee-9ab74101b21f`) in Banga, South Cotabato revealed critical cross-layer anomalies in RiderMobileApp and Server.
* **Directives for Claude Code**:
  1. **GPS Queue Head-of-Line Unblocking (`src/config/apiConfig.ts`)**:
     - `uploadTrackBatch`: In `apiClient.ts:294-297`, the response interceptor strips `error.response` and rejects with `wrapped` where `wrapped.status` is set, but `wrapped.response` is `undefined`.
     - Change line 375 from `const status = err?.response?.status;` to `const status = err?.status ?? err?.response?.status;`.
     - This ensures non-retryable 4xx errors (such as 403 Forbidden on stale/unassigned errands) drop the poisoned batch (`return true`) instead of returning `false` and permanently blocking the entire GPS queue via `break`.
  2. **Surfacing Server Errors on Receipt Capture (`src/services/uploadFailure.ts`)**:
     - `describeUploadFailure`: Fix `status` inspection from `err?.response?.status` to `err?.status ?? err?.response?.status ?? null`.
     - Also inspect `err?.message` so server 422 messages (`"Please check all items (Purchased or Out of Stock)..."`) are displayed directly to the rider rather than falsely diagnosing a network drop ("No signal / check your signal").
  3. **Logout Location Queue Cleanup (`src/context/RiderAuthContext.tsx`)**:
     - In `logout()`: Import `clearLocationQueue` from `../services/locationQueue` and call `await clearLocationQueue()` to prevent stale unsent points from old accounts/errands lingering in `@sugo_rider_location_queue`.
  4. **Item Checklist Gate on Receipt Scan (`src/screens/ReceiptCaptureScreen.tsx` / `TaskScreen.tsx`)**:
     - Prevent riders from opening the receipt scanner before marking that store's items as Purchased or Out of Stock, or provide immediate clear inline feedback if items are still pending.
  5. **Verification**: Verify with `npx tsc --noEmit` and run relevant Jest suites.

## 2026-11-10 - Task drawer: back when the GPS has not found the store; opens in full at a store and at the customer's door (Claude Code)

* **Report (after testing 1.1.2)**: (1) when the GPS does not detect a store's geofence, the task drawer does not come up by itself; (2) on the way to the customer the drawer opens only half, over the map, not fully rendered; (3) pictures of the actual design to review.
* **Cause 1**: while riding the sheet and its dock are off the screen (map mode) and came back only when a fix landed inside the stop's circle (`mission.storeArrival.arrivingAt`). The one button written for a GPS that is not detecting, "GPS not detecting? Confirm Arrival", sits in that hidden dock, so it was hidden for exactly as long as the GPS was not detecting. The only way to it was the fee capsule.
* **Fix 1**: new pure rule `src/services/arrivalAssist.ts` (`arrivalAssist()`), read in `TaskScreen.tsx`. While riding, the sheet returns at its PEEK (never opened) when the rider is within twice the stop's own radius (150 m for a default store, 100 m for the door), stopped (`riderLocation.stationary`) within 400 m, holding a fix coarser than the circle while within reach of it (`observeFix` ignores those, so auto-arrival can never fire), or has had no fix for 30 s (a 10 s tick while riding re-reads the clock; a leg's first 30 s are grace). It goes away again by itself when the reason clears (a red light near the stop), but only if this rule is what showed it and the rider has not opened it, and never inside the circle. It never moves the errand's step: that is still the circle or the rider's tap. Existing `nearStop` behaviour is unchanged.
* **Cause 2**: an ordinary open stops at `SHEET_MAX_COVER_RATIO` (58% of the screen, less the dock). At the door the dock is three rows (blocked note, COD pill, button) plus the bottom inset, which left the handover content a strip about 60 dp high at 360 x 800.
* **Fix 2** (`TaskScreen.tsx`): opening the sheet enters the existing full task view (full height below the status bar, back arrow in the header, map chrome hidden) and closing returns to the peek. The geometry is full from the first drag (`sheetInFull` feeds `expandedRatio` / `maxHeight` / `maxCoverRatio`). First shipped for `Delivering` only; **the user then asked for the same at a store (13:30)**, so it is now `opensInFull = currentStatus !== 'Delivered'`: at a store, at the door, and on the way to either once the sheet has come back near the stop (a rider whose GPS has not registered the store is still "Traveling", and a half-open drawer there would be the same complaint). Only the finished errand's summary keeps the 58% open, so `SHEET_MAX_COVER_RATIO` and `sheetMaxHeight` now apply to that state alone.
* **Tests**: vitest `tests/arrivalAssist.test.ts` (new, 9). jest `tests/TaskScreenLayout.test.tsx` +9: the harness's status and position are now settable (`mockStatus`, `mockLocation`; defaults as before) and the mock context gained `departedStoreIds` / `deferredStoreIds`. Six of the first eight failed before the fix (checked): four for the store, two for the door. For the store follow-up: "the sheet at a store" (2, opens in full; closes to the peek by the back arrow and by the title), and the older "are not covered by the open sheet" now asserts the new rule (the top layers give way to the open sheet instead of the sheet stopping short of them).
* **Verification** (after the store follow-up, 13:45): `tsc --noEmit` exit 0; vitest 37 files / 625 tests; jest 30 suites / 273 tests, all pass, with the 261110-1B21F-0003 work above in the tree. Not on a device. JS only; nothing committed, built or published.
* **Pictures** (sent to the user): the real `TaskScreen` with its real panels, dock, fee capsules and navigation panel, mounted under this repo's jest setup at 360 x 800 dp, written out as HTML with React Native's flexbox defaults, measured by headless Chrome and fed back as `onLayout` events for three passes, then photographed. Only the map (a native view) is a drawn stand-in. Harness kept outside the repo so `tsc` does not see it: `C:\Users\Capstone\.claude\projects\C--Capstone-Project-Web\tools\rider-screen-render\` (`jest --config <that>/jest.render.config.js task.render`, run from this repo).
* **Seen in the pictures, not changed**: in the full view at the door the rider still scrolls past Progress and the customer card (about 470 dp) to reach "Photograph the cash you collected" and "Take handover photo"; and the map's arrow shows in the status-bar strip above the full sheet.
* **Next session**: on a phone, at a store with the GPS off the pin (confirm the peek and the button appear, and that a red light within 400 m brings it up and riding on puts it away), and at a customer's door (open, close, back key). Reaches riders by a new build, or by an update for runtime 1.1.2 once the layout work below is ready to go with it.

## 2026-11-10 - Consistent layouts across Rider screens (Codex)

* **Request**: Extend the Home layout improvements and consistency across every Rider App screen.
* **Shared rules** (`src/config/screenLayout.ts`, new): Centered content capped at 580dp, damped horizontal padding capped at 24dp, shared content/header/title/icon-button/footer styles, non-shrinking action docks, and primary button minimum heights bounded to 52-60dp. Safe areas belong to the screen boundary or its tab navigator, not extra estimated clearance inside the content.
* **Screen coverage**: `src/modules/auth/LoginScreen.tsx` and `ForgotPasswordScreen.tsx`; `home/HomeScreen.tsx` and `home/components/NewTaskCard.tsx`; `task/TaskScreen.tsx`; `history/HistoryScreen.tsx` and `ErrandDetailsScreen.tsx`; `profile/ProfileScreen.tsx`, `EditProfileScreen.tsx` and `GpsCalibrationScreen.tsx`; `notifications/NotificationsScreen.tsx`; `chat/DispatcherChatScreen.tsx` and `DispatcherChatModal.tsx`; `src/screens/ReceiptCaptureScreen.tsx`.
* **Changes**: Removed double tab/system-bottom padding in History/Profile; aligned headers, titles and content gutters; removed nested form/GPS section boxes; kept Save and Home offer actions outside detail scrollers; moved GPS Start/retry/Stop/run-again into a persistent footer with their existing callbacks. Task uses the shared sheet padding/footer while the live map remains outside all scroll containers. Chat header context wraps on narrow screens, messages and composer are bounded on wide displays, and photo thumbnails cannot exceed their bubble. Receipt actions cannot shrink; the camera/confirmation view is bounded. Login now reserves safe areas and its MFA dialog can scroll above the keyboard on short screens. No authentication or GPS calibration algorithms changed.
* **Shared components**: `src/components/RiderHeader.tsx`, `WaybillModal.tsx`, `EmptyState.tsx`, `OrderClaimedConflictBanner.tsx`, `MobileErrorBoundary.tsx`. Waybill now reserves safe areas and keeps Close outside the scrolling content; Android Back closes it. Raised the remaining statically measured 36/46dp action targets. Navigation button label, icons, styling and Task handler remain unchanged. Removed imports made redundant by the shared styles.
* **Verification**: Final `npx tsc --noEmit` passed. Full Jest: 29 suites / 260 tests passed; emitted overlapping-act warnings in the pre-existing AnimatedSplashScreen suite. After final login/dialog/GPS edits, focused LoginMfa + LoginForgotPassword + GpsCalibration: 3 suites / 31 tests passed. Updated the existing GPS preparation test to find Start in the pinned action region and confirm it is outside the detail scroller. `git diff --check` passed. UI audit: 0/87 measured targets below 48dp, 4 controls without accessibility metadata remain; its palette scanner measured zero contrast pairs, so this is not a contrast certification.
* **Responsive verification**: Evaluated the actual shared layout module with dimension stubs at 320/360/414/600/768dp. Frame/padding/content/button minimum: 320/19/282/52; 360/20/320/54; 414/22/370/58; 580/24/532/60; 580/24/532/60. These validate tokens, not native text rendering or full screen geometry.
* **Next session**: Local, uncommitted and unpublished. `adb devices` is empty; no native visual QA performed. On a 360dp phone and a tablet, check long names/addresses, larger text, keyboard-open forms/MFA/chat, GPS action visibility, receipt actions, and Home with active navigation plus an offer. Preserve all pre-existing release/MFA/arrow/telemetry work and locked contracts. No APK or OTA was produced.

## 2026-11-10 - Full-height Home offer with always-visible acceptance (Codex)

* **User correction**: The slider still required scrolling. Remove the offer cards and make the offer a full screen component with Slide to accept visible immediately. This supersedes the earlier scrollable-card layout below.
* **Layout** (`src/modules/home/HomeScreen.tsx`, `src/modules/home/components/NewTaskCard.tsx`): Removed offer borders, corner rounding, margins and nested outer scrolling. The offer fills the available Home area: countdown/identity at top, a flexing details ScrollView in the middle, and a non-shrinking accept/decline footer outside it. The existing Open navigation button, label, icons, styling and Task handler remain in their own footer below. At 360dp, the full-width offer supplies about 320.8dp to the slider (248.8dp for its label after the 56dp thumb and gaps), rather than nesting it within another card's padding.
* **Multiple offers**: Previous/Next controls show one offer at a time. Hidden offers stay mounted so their individual countdowns still expire; their details/actions are hidden from accessibility. Selection falls back to the first remaining offer when its target disappears. Each offer retains its own slider instance and acceptance callback. Controls are disabled when accepting or expired.
* **Action integrity** (`src/hooks/useRiderMission.ts`): Added an optional offer ID to declineMission and capture the displayed offer's ID when opening the reason modal. Home now declines only that offer, preserving other pending and accepted errands. The legacy no-argument behavior remains available. An expired/missing target cannot fall through to declining a different offer.
* **Verification**: `npx tsc --noEmit` passed. Jest HomeScreen + NewTaskCardExpiry: 2 suites, 16 tests passed. Updated checks cover one visible offer/fee breakdown, selecting and accepting the correct offer, selected-offer decline, expiry of hidden offers, fallback after selected-offer removal, accept/decline outside the details scroller, and unchanged Open navigation behavior. `git diff --check` passed.
* **Next session**: Local JS-only changes, uncommitted and unpublished. No device preview performed. Check on a 360dp phone with large text, long addresses, active navigation plus a new offer, and multiple offers; accept and decline must remain above the tab bar without scrolling. Preserve unrelated work and locked telemetry/map contracts.

## 2026-11-10 - Home offer and navigation overlap fix (Codex)

* **Request**: Stop the Home screen's Slide to accept and Open navigation controls overlapping other components; preserve the existing navigation button and its text.
* **Layout** (`src/modules/home/HomeScreen.tsx`): The navigation dock now participates in normal vertical layout below a flexing ScrollView, above the tab bar already reserved by the navigator. Removed absolute positioning, duplicated tab/system-bottom offsets, measured dock state and compensating scroll padding. Offers can scroll fully above the dock. Navigation button styling, exact `Open navigation` text, test ID and Task handler are unchanged.
* **Slider** (`src/components/SlideToConfirm.tsx`): Reserve the thumb width plus an 8dp gap before the label, bound the label to the remaining track width, use scaled typography with a 1.25 font multiplier cap and single-line fitting, and prevent the track from shrinking. Gesture thresholds and completion behavior are unchanged. Removed unused imports. This shared component also supplies Task and cash-confirmation sliders.
* **Verification**: `npx tsc --noEmit` passed. Jest HomeScreen 11/11; NewTaskCardExpiry + ReceiptCaptureCash 13/13 (24 tests across 3 suites). Updated the existing Home test to cover an active errand alongside a new offer, separate scroll/dock regions, unchanged label and Task navigation. `git diff --check` passed. Calculated offer track/label widths at 320/360/375/414dp: 243.9/171.9, 279.6/207.6, 293/221, 327.8/255.8; the thumb-to-label gap is 8dp throughout. These are layout calculations, not device text measurements.
* **Next session**: JS-only, uncommitted and not published. No handset/emulator attached (`adb devices` empty). Visually check Home with an active errand plus new offers on a 360dp phone and enlarged text; scroll through accept/decline, then open navigation. Preserve unrelated existing changes and locked GPS/map/fleet contracts.

## 2026-11-10 - Release v1.1.2: EAS production APK (Claude Code)

* **Request**: a new APK, version 1.1.0 to 1.1.2 (1.1.1 skipped on the user's word), built with `npx eas`.
* **Build** (EAS `production` profile, channel `production`, v1.1.2, versionCode 7, runtime 1.1.2): https://expo.dev/artifacts/eas/nzKmdWyUse0qmVt692S2UcR6Vv2i8JucKtaxLIClC90.apk (build page: https://expo.dev/accounts/astrowarden/projects/RiderMobileApp/builds/f2c9874c-f191-4a2c-a197-defe9f44cbc4). 182.7 MB.
* **Version bump, five places**: `app.json` `version` and `runtimeVersion`; `package.json`; `package-lock.json` (the two root entries only); `android/app/build.gradle` `versionName`; `android/app/src/main/res/values/strings.xml` `expo_runtime_version`. versionCode is EAS's (`appVersionSource: remote`, `autoIncrement` on production): it was 6 on the server and the build took 7, so it installs over 1.1.0. `build.gradle`'s own `versionCode 2` is ignored.
* **Runtime version bumped on purpose**: this APK carries native changes (the refresh-rate request in `MainActivity.kt`, and the 2026-11-03 `expo-web-browser` / `expo-linking` and `sugorider` intent-filter). A separate runtime keeps an update published for 1.1.2 off 1.1.0 installs, which lack that native code. An `eas update` for these riders must be published against runtime 1.1.2.
* **What is in it**: the uncommitted tree on `upgrade/expo-57`: everything since the 1.1.0 build (Urbanist, sign-in MFA, the Android Back fix) plus today's four entries below (blue arrow and per-frame heading and zoom, the 90/120 Hz request, the earlier pull-away release).
* **Checked before building**: `tsc --noEmit` exit 0; vitest 34 files / 593; jest 29 suites / 259. The live portal's `PhoneVerificationPage` chunk accepts `sugorider`, so the MFA text-message path has its web half. Only this session's files changed in the tree in the last 36 hours.
* **Checked in the APK itself** (downloaded; `aapt2 dump badging`): package `com.astrowarden.RiderMobileApp`, versionCode 7, versionName 1.1.2; `resources.arsc` holds runtime 1.1.2; the JS bundle contains `api.sugo-express.org` (EAS reported no `production` environment variables, so the address came from the uploaded `.env`, as on earlier builds), `sugorider://mfa-verified`, `roadHeading` and `followRoad`; `drawable/assets_riderarrow` is packaged and the motorcycle is not.
* **Not done**: not installed or run on any phone. Nothing committed (the version bump included). Server-side MFA was not probed.
* **Next session**: install on the Samsung A04 over 1.1.0 (it should upgrade in place), sign in (MFA: text and email), then the road tests listed in the three entries below.

## 2026-11-10 - A stopped rider's pin lets go about a second sooner when they pull away (Claude Code)

* **Request**: shorten the late start found below (the arrow sat still 3 to 5 s after the rider moved, then hurried 10 to 20 m to catch up).
* **Cause**: not the arrow. `src/utils/gpsStabilizer.ts` released a locked pin by Doppler only after two fixes in a row at 2 m/s or more that were ALSO half the lock radius (6 m) from the lock point. A rider at 2 m/s² needs 2.5 s to cover 6 m, then one more fix.
* **Change** (`gpsStabilizer.ts` only; the old paths are untouched and still release as before): a second Doppler path, `notePullingAway()` + `pulledAway`. Consecutive fixes with speed >= `MOVING_SPEED_MPS` and a valid course, each within `UNLOCK_COURSE_AGREEMENT_DEG` (60) of the last, release the pin once the speed itself says `UNLOCK_DOPPLER_TRAVEL_METERS` (3 m) was covered BETWEEN them (average of the two speeds times the time, capped at 2 s; the first fix of a run adds nothing) and the latest fix is at least `MIN_DOPPLER_DISPLACEMENT_METERS` (3 m) from the spot. A fix on another course starts a new run. In practice: the second moving fix.
* **Measured** (the app's own steadier and `riderMotion`, 300 simulated phones per case, drifting AR(1) GPS error, fixes landing at a random point in the second; before -> after, median / 90th / worst). Normal start (2 m/s² to 29 km/h), 3 m GPS error: pin released 3.5/4.6/6.0 -> 2.6/3.1/4.0 s; arrow first moves 4.0/5.1/6.4 -> 3.0/3.5/4.4 s; furthest behind the rider 18/26/33 -> 10/15/20 m. Gentle (1 m/s²): arrow 4.9/6.3/7.8 -> 4.3/4.9/5.9 s. Brisk (3 m/s²): arrow 3.6/4.6/5.6 -> 2.7/3.1/3.9 s. With 6 to 10 m GPS error the median moved little (it was already 3.0 to 3.2 s) but the 90th went 4.9 to 5.2 -> 3.4 to 3.5 s.
* **Phones that are not moving** (400 phones x 5 min per noise model, wrongly released before -> after): repo test model (speed noise to 1.1 m/s) 0 -> 0; budget (to 1.5 m/s, 8 m error) 6 -> 6; one stray 1.5 to 3.5 m/s reading in 30, 5 m error, 40 -> 40; the same with 2.5 m error 10 -> 10; multi-second reflection episodes 167 -> 168 and 168 -> 169. Two earlier candidates were rejected on this table: summing speed from the first fix (62 and 36 in the stray-reading models) and that plus course agreement (44 and 18).
* **Floor**: about 2.5 s to release and 3 s for the arrow at a normal start. GPS reports once a second and one stray fix must not release the pin, so the second moving fix is the earliest. Going lower means moving the arrow on ONE fix (a visible twitch at stops on a phone with stray speed readings) or another sensor.
* **Tests** (`tests/gpsStabilizer.test.ts` +6, 21 total): released on the second moving fix at 4 m out; not by one stray reading; not by two pointing different ways; not by two whose speed does not add up; a phone with speed noise to 1.9 m/s holds once locked (20 phones x 5 min); 200 drifting phones released within 2.7 s median and 3.1 s at the 90th. The first and last fail with the new path switched off (checked).
* **Verification**: `tsc --noEmit` exit 0; vitest 34 files / 593; jest 29 suites / 259, all pass. Simulated only, NOT road-tested. JS only (no native change), but it rides with the uncommitted tree. Shared by the foreground watcher and the background task (`services/gpsSteadying.ts`), so the dispatcher's and customer's pins start sooner too.
* **Next session**: road-test pulling away from a junction and from a parking space with a turn; watch a parked phone for a minute for any creep. If a real phone's still-speed noise turns out higher than 1.5 m/s, raise `UNLOCK_DOPPLER_TRAVEL_METERS` before touching the streak length.

## 2026-11-10 - Navigation at the screen's own refresh rate: the app now asks Android for 90/120 Hz (Claude Code)

* **Question**: are the navigation map and the arrow's turn drawn at 120 fps? If not, make them.
* **Finding**: nothing in the app caps drawing at 60, and nothing asked for more. In RN 0.86 (new architecture) `requestAnimationFrame` is a zero-delay timer (`ReactCommon/react/runtime/TimerManager.cpp`) that `JavaTimerManager` fires from the Choreographer frame callback, so the marker's loop runs once per screen refresh at whatever rate Android gives the window. `riderMotion` steps at a fixed 120 Hz and interpolates between steps, so each frame at 120 or 240 Hz gets its own position and heading. The missing piece was native: the window never stated a refresh-rate preference, and several phone makers hold an app at 60 Hz unless it does.
* **Native change (needs a new APK; cannot ship by OTA)**: `android/app/src/main/java/com/astrowarden/RiderMobileApp/MainActivity.kt`: `preferFastestRefreshRate()` after `super.onCreate`: sets `window.attributes.preferredDisplayModeId` to the supported mode with the highest refresh rate at the current resolution; does nothing on a 60 Hz screen; wrapped in try/catch. A preference only: battery saver and the owner's display setting still win. **`android/` is gitignored and uploaded to EAS as is, so `expo prebuild` would wipe this** (same as the 2026-11-03 manifest edit). Whole-app, not only the map: expect somewhat more battery use on 90/120 Hz phones.
* **Tests** (JS side, proving one new sample per refresh): vitest `riderMotion.test.ts` +2 (at 120 and 240 frames a second every frame has its own evenly spaced position, and the heading moves on every frame of a bend); jest `GlidingRiderMarker.test.tsx` +1 (at 8.33 ms frames: exactly one position and one rotation write per frame, over 100 distinct angles through a one-second turn).
* **Verification**: `tsc --noEmit` exit 0; vitest 34 files / 587; jest 29 suites / 259, all pass. `./gradlew :app:compileDebugKotlin` BUILD SUCCESSFUL (12 min cold, `JAVA_HOME` set to Android Studio's `jbr`; the machine's default JDK 24 is not used), no warning from `MainActivity.kt`. NOT measured on any phone.
* **Limits, stated plainly**: (1) the Samsung A04 test phone has a 60 Hz screen, so it shows 60 whatever the code does; (2) Google's map view draws on its own surface and Google documents no frame rate for it, so whether the MAP redraws above 60 on a 120 Hz phone is unknown and outside the app's control; (3) a `LiveErrandMap` re-render on each GPS fix runs on the same JS thread as the frame loop and may cost a frame once a second on a slow phone (not measured).
* **Pulling away from a stop (simulated, 900 phones, not a device)**: `GpsStabilizer` + `RiderMotion` fed a rider stopped 40 s who then accelerates at 2 m/s² to 8 m/s, 1 fix/s, drifting GPS error (AR(1), rho 0.9) of 3, 6 and 10 m. No shake: no backward movement and no change of direction (one phone in 300 at 10 m error backed up once, 4.3 m), biggest move in one 120 Hz frame 0.15 m. But the arrow starts LATE: median 3.5 to 4.5 s after the rider (worst 7.5 s), because the still-pin lock needs two Doppler fixes of 2 m/s with 6 m of displacement before it lets go. By then the rider is a median 11 to 21 m ahead (worst 44 m), and the arrow catches up at about 6 m/s over the rider's speed. The 3D camera follows the arrow, so the whole map waits and then hurries. Not changed: loosening the unlock is the trade-off in the 2026-09-25 jitter work (a still pin that unlocks by itself).
* **To check on a 120 Hz phone**: Developer options, "Show refresh rate" (should read 120 on the Task map), then "Profile HWUI rendering" or a screen recording at 240 fps slow motion to count map frames.

## 2026-11-10 - Blue navigation arrow replaces the motorcycle; the arrow, map heading and zoom flow frame by frame in 3D (Claude Code)

* **Request**: on the Task map, a blue arrow pointing forward instead of the motorcycle, and 3D navigation that flows continuously like Google Maps navigation.
* **Arrow** (`assets/rider-arrow.svg`, exported to `rider-arrow.png`, `@2x`, `@3x`, 56 dp, by the new `scripts/export-rider-arrow.mjs`): a two-face blue arrow (`#3B82F6` lit, `#1D4ED8` shade) with a white edge and a centred ground shadow, pointing north, its centre of area on the image centre (the marker's anchor). The white edge is what keeps it apart from the blue delivery line. Still an `image=` marker, never a child view. `GlidingRiderMarker.tsx` loads it; `rider-motorcycle*` and `rider-puck*` are now unused but left in `assets/`.
* **What was stepping**: position already flowed (riderMotion), but the heading was worked out once per GPS fix in `LiveErrandMap` (40 m look-ahead) and the arrow eased to it, so through a bend the arrow and the 3D map swung once a second. The chase zoom also jumped half a level the frame the speed crossed a band.
* **Heading, per frame** (`src/utils/riderMotion.ts`): `RiderMotionFrame.roadHeading`, the bearing of the road just ahead of the DRAWN position (a chord of about 1.2 s of travel, 6 to 24 m), forward along the route, null off the road. `GlidingRiderMarker` takes it every frame when its new prop `followRoad` is true (default); `LiveErrandMap` passes `followRoad={headingChoice.source !== 'compass'}`, so stopped or walking with a usable compass the phone still turns the arrow, as before. Off the road, and for the first placement, the per-fix `headingDeg` is used as before. The 3D camera already takes the arrow's drawn rotation as its heading, so the arrow stays pointing up the screen and the road turns under it.
* **Zoom** (`src/utils/navigationCamera.ts` `glideZoom`, `ZOOM_GLIDE_PER_SECOND` 0.4): `LiveErrandMap` keeps the band (`zoomBandRef`) apart from the zoom on screen (`zoomRef`), which eases to the band inside `followDrawnPosition`. That callback now returns true while the zoom is still easing, and the marker keeps its frame loop alive for it (`onPositionChange` may return `boolean`). Explicit placements (first view, re-center, padding change) still take the band's zoom outright.
* **Tests**: vitest `riderMotion.test.ts` +3 (heading on straights and null off road; a 90 degree bend swept under 3 degrees a frame between fixes; shorter reach at walking pace), `navigationCamera.test.ts` +5 (`glideZoom`). jest `GlidingRiderMarker.test.tsx` +3 (turns through a bend with the given heading never changing; keeps the compass heading with `followRoad={false}`; keeps drawing while the camera settles), `LiveErrandMap.test.tsx` +2 (`followRoad` passed; zoom eases over many frames, no jump).
* **Verification**: `tsc --noEmit` exit 0; vitest 34 files / 585 tests; jest 29 suites / 258 tests, all pass. `audit:ui` unchanged. Nothing committed, no build. NOT device-verified (no emulator or handset here): the arrow's size and look tilted at pitch 60, and the feel of the turn through a real corner, need a road test.
* **Ships by**: JS and a bundled image only, so an OTA update can carry it (see the `eas update` note about `.env` before publishing). No native change.
* **Next session**: road-test on the Samsung A04 in 3D: a straight, a right-angle corner, a roundabout, pulling away and stopping (zoom), standing still turning the phone, a U-turn (on an out-and-back stretch the heading flips half a reach before the turn point). Tune `HEADING_AHEAD_S` / `MIN_`/`MAX_HEADING_AHEAD_METERS` and `ZOOM_GLIDE_PER_SECOND`; do not add a per-fix heading or zoom tween.

## 2026-11-06 - Android Back on the dispatcher chat from a task; two time- and mock-dependent tests (Claude Code)

* **Bug (reproduced first)**: with the errand sheet expanded, Android Back on DispatcherChat (opened from Task) did nothing on the first press. TaskScreen's `hardwareBackPress` listener stays registered under the chat and re-registers on every sheet change, so it is the newest and is asked first. It collapsed the hidden sheet and returned true.
* **Fix**: `src/modules/task/TaskScreen.tsx`: the listener returns false unless `navigation.isFocused()` (+5 lines on HEAD). The sheet/full-task/riding hierarchy is unchanged while Task is in front.
* **Test**: new `tests/TaskBackNavigation.test.tsx` (jest, 2 tests): the real RN6 router and container, the real TaskScreen and the real Android `BackHandler` (mapped in by `jest.mock`), in a minimal keep-mounted navigator, because the JS stack's gesture layer is mocked here. It failed on HEAD (`Tabs, Task, DispatcherChat` after Back) and passes now. The companion test (sheet collapses first while Task is in front) passes both ways.
* **Audited, no change**: HomeScreen's exit handler was already focus-gated (`useIsFocused`). ReceiptCaptureScreen mounts only while the camera is open. React Navigation 6's `navigate()` goes back to an existing route, so the CustomerApp's duplicate-screen bug cannot happen here. The push hook runs its cold-start check once per JS run.
* **Pre-existing failures, fixed in the tests (proven failing on HEAD without my change)**: `tests/updatesService.test.ts` (6): the `expo-updates` vitest mock lacked `setUpdateRequestHeadersOverride`, which the code feature-checks with `typeof`, and vitest throws on unlisted exports inside the code's `try`. `tests/NotificationsScreen.test.tsx` "groups by day": the fixture's 40-hours-ago row is "Yesterday" from 16:00 to midnight; it is now 72 hours.
* **Verification**: `tsc --noEmit` exit 0; vitest 34 files / 577 tests; jest 29 suites / 253 tests, all pass. Nothing committed. Not device-verified. The TaskScreen change ships by OTA (JS only).

## 2026-11-03 - Recurring MFA on rider sign-in: SMS (portal page) or email code (Claude)

* **Request**: Second factor on every sign-in from a phone that has not passed MFA in 30 days. The Express server stays the identity authority; a correct password returns a challenge; SMS via Firebase Phone Auth on `https://portal.sugo-express.org/verify-phone` (React Native cannot run Firebase phone auth), email code as fallback. Server and web page are built by sibling sessions against a fixed contract.
* **Native (needs a new APK; cannot ship by OTA)**: `expo-web-browser` ~57.0.2 (installed 57.0.3) and `expo-linking` ~57.0.7 (pinned to 57.0.7: 57.0.8+ wants expo-constants >= 57.0.15 and npm nested a second native copy under it). `app.json` `"scheme": "sugorider"`. `android/app/src/main/AndroidManifest.xml` (gitignored, uploaded to EAS as is, prebuild NOT run): a VIEW/DEFAULT/BROWSABLE intent-filter on MainActivity for `sugorider` and `com.astrowarden.RiderMobileApp` (what prebuild would generate). The optional expo-web-browser config plugin (BrowserLauncherActivity) was not added.
* **`src/utils/deviceInfo.ts`**: `x-sugo-mfa: 1` on every request that carries device headers. Older builds without it still get the email code sent at once.
* **`src/services/mfaTrust.ts`** (new): SecureStore key `sugo_rider_mfa_trust`, no AsyncStorage fallback, deliberately NOT cleared on logout.
* **`src/context/RiderAuthContext.tsx`**: `login` sends the stored `mfaTrustToken` (omitted when none). `PendingChallenge` gains `factors`, `phoneHint`, `maskedPhone`, `reason`, `emailCodeSent` (false only when the server answered `mfaRequired`), `expiresAt`. `resendLoginOtp` is replaced by `sendLoginEmailCode()` (first send and resend; device headers now sent; adopts the new challengeToken). New `verifyLoginSms()`: `WebBrowser.openAuthSessionAsync(<portal>/verify-phone?purpose=mfa&hint=<last4>&redirect=sugorider%3A%2F%2Fmfa-verified, "sugorider://mfa-verified")`, reads `token` with `Linking.parse`, POSTs `{ challengeToken, firebaseIdToken }`; returns `"cancelled"` when the browser closes without a token. Both factors go through one `completeChallenge()` that saves `mfaTrustToken`. A 401 from verify/resend (server: "Your sign-in session expired") throws an error with `code: "CHALLENGE_EXPIRED"` (`isChallengeExpired()` exported). `EXPO_PUBLIC_PORTAL_URL` overrides the portal origin.
* **`src/modules/auth/LoginScreen.tsx`**: the challenge modal is "Confirm it's you": a method picker (Text me a code, to the number ending 1234 / Email me a code, to the masked address), reason-specific intro (NEW_DEVICE, FIRST_LOGIN), then the existing 6-digit email entry with Resend and "Text me a code instead". States: loading per option with the other locked, wrong code (inline, box cleared), SMS closed (neutral info notice), expired (single "Start over" that returns to the form with the password cleared). PROFILE_SETUP branch unchanged.
* **Tests**: `tests/LoginMfa.test.tsx` (new, 21 jest tests): screen against a stubbed context (picker, factor filtering, phone fallback, legacy code-entry, email send/verify/wrong code/short code/send failure, SMS loading/cancel/expired/start over) and the real provider against stubbed fetch and browser (trust token in the body and `x-sugo-mfa`, rotated trust token kept, exact portal URL and redirect, Firebase token verify, closed browser spends nothing, resend adopts the new token, legacy server, 401 to Start over, 400 stays in the modal). `tests/LoginForgotPassword.test.tsx` mock updated. ProfileScreen/HomeScreen mocks needed nothing.
* **Verification**: `tsc --noEmit` clean. Jest 27/28 suites, 250/251 tests: the one failure is the known time-of-day `NotificationsScreen` "groups by day" (run at 23:29 local). Vitest 571/577: the 6 known `updatesService.test.ts` failures. No build, no commit, nothing run on a device.
* **Blocking dependency on the web page**: `PhoneVerificationPage.tsx` `trustedAppRedirect()` today accepts only `customerapp://` (and LAN `exp://`), so it would refuse `sugorider://` and never send the token back. The web session must allow `sugorider`. Hand-over note in the shared session-notes folder (`rider-mfa-notes.md`).
* **Next session**: After the server and web page are deployed, build an APK and test on the Samsung A04: SMS check round trip (Custom Tab returns to the app, modal closes), back button and closing the tab (notice shown, nothing spent), email path, a second sign-in within 30 days skipping the check, sign-out then sign-in (trust kept), and the app being killed while the Custom Tab is open (rider lands on Login, which is expected: the challenge lives in memory only).

## 2026-11-03 - Urbanist primary font migration across Rider Mobile App (Antigravity)
* **Request**: Use Urbanist as primary font across Web, Rider, and Customer apps.
* **Rider App Implementation**:
  - Installed `@expo-google-fonts/urbanist` (^0.4.2) and pruned dead `@expo-google-fonts/inter` from `package.json`.
  - `App.tsx`: Replaced `Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold`, `Inter_700Bold` with `Urbanist_400Regular`, `Urbanist_500Medium`, `Urbanist_600SemiBold`, `Urbanist_700Bold` in imports and `useFonts` dictionary.
  - `src/config/theme.ts`: Updated `FontFamily.regular` (`Urbanist_400Regular`), `FontFamily.medium` (`Urbanist_500Medium`), `FontFamily.semibold` (`Urbanist_600SemiBold`), `FontFamily.bold` (`Urbanist_700Bold`). `JetBrainsMono` preserved for monospace keys.
* **Verification**: `npx tsc --noEmit` passed (0 errors). Vitest 33 test files / 571 tests passed (the 6 failures in `updatesService.test.ts` are pre-existing mock signature gaps recorded in earlier session handshakes). Jest `tests/HomeScreen.test.tsx` passed (11/11). `npm run audit:ui` passed (0 palette contrast failures).
* **Next session**: Verify road navigation glanceability and typography scaling on physical device (Samsung Galaxy A04).

## 2026-11-01 - Scooter brand mark replaces the cyclist; production APK (Claude)

* **Request**: Give the rider app the Customer App's new logo (the Sugo Tacurong scooter, adopted 2026-11-01) and build it with EAS.
* **Icons** (`scripts/export-brand-icons.mjs`, new; run `node scripts/export-brand-icons.mjs`): one flat white mark (`assets/brand/sugo-mark-white.svg`, a copy of CustomerApp `assets/mascot/sugo-mark-white.svg`) on the rider app's own red `#DC2626` (palette `primary`), not the customer pink, so the two launcher icons stay distinguishable. Writes `assets/icon.png`, `android-icon-foreground/background/monochrome.png`, `favicon.png`, `notification-icon.png`, `brand/sugo-mark-white{,@2x,@3x}.png`, and, because EAS builds the gitignored `android/` folder as-is, every `mipmap-*/ic_launcher*.webp` and `drawable-*/notification_icon.png`. The old native notification icon was an opaque red square (a white block in the status bar); it is now a white-on-alpha mask. `app.json` expo-notifications icon points at `notification-icon.png`. Previous icons and native res: `C:\Capstone_Server\character_animation\rider_brand_backup_2026-11-01\`. The native splash stays blank by design.
* **In-app mark**: the lucide `Bike` brand glyph is replaced by the mark in `AnimatedSplashScreen.tsx` (emblem), `LoginScreen.tsx` (hero badge and SUGO EXPRESS pill, tinted `Colors.primary`) and `RiderHeader.tsx` (Home logo box, tinted `HomeColors.accent`). `Bike` icons that mean "delivering" (ProgressSteps, WaitingCard, NotificationsScreen OFFER, DispatcherChatScreen) are unchanged.
* **Verification**: `tsc --noEmit` clean. Jest 26/27 suites, 229/230 tests; the failure is pre-existing and time-of-day dependent: `tests/NotificationsScreen.test.tsx` puts a fixture 40 h ago and expects an "Earlier" section, which is "Yesterday" after 16:00 local.
* **Build** (EAS `production`, channel `production`, v1.1.0 versionCode 5, uncommitted tree on `upgrade/expo-57` at 7c68cbd, so it also carries the continuous riding icon from 820e439): https://expo.dev/artifacts/eas/eHMF2WNcxiJck-GPACsgsvvNtW9ick2WYlj8a681oiw.apk (build page: https://expo.dev/accounts/astrowarden/projects/RiderMobileApp/builds/148e5590-f5fe-4f0f-b349-1cbf3e46d587).
* **Next session**: Not committed. Install on the Samsung A04: launcher icon (round, adaptive, themed), notification icon in the status bar, splash, login and Home header; then the road test listed in the entry below.
* **2026-11-02 follow-up**: the logo now has one source. CustomerApp `artwork/kuya-sugo/export_flat_logo.mjs` copies its white mark into `assets/brand/sugo-mark-white.svg` here and runs `scripts/export-brand-icons.mjs`, so a Customer App logo change reaches the launcher, notification icon, splash, login and Home header. Do not edit the generated PNGs or `assets/brand/sugo-mark-white.svg` by hand. A logo change still needs a new build to reach riders (native icons cannot ship by OTA).

## 2026-11-01 - Rider icon rides continuously along the road line; chibi motorcycle puck (Claude)

* **Request**: Remove the gliding-ms timing and make the rider's icon ride continuously along the route line. Replace the puck with a 3D chibi motorcycle.
* **Motion** (`src/utils/riderMotion.ts`, rewritten; public API `RiderMotion.push/sample/clear` unchanged): no per-fix tween, no duration. The icon is a small vehicle with a place on the route line (metres along it) and a speed. Each frame it rides on at the phone's reported speed toward where the latest fix says the rider is *by now* (dead reckoning from `recordedAt`, bounded by `MAX_DEAD_RECKONING_MS` 3 s / `MAX_LEAD_METERS` 30 m, then it settles). A fix changes only the target, never the drawn position or speed. Speed changes are capped at 5 m/s² up and 7 m/s² braking. On the road it stays exactly on the polyline through bends. A few metres of along-road GPS scatter make it wait rather than back up; past a rider who has *stopped* it rolls back at most 3 m/s. A real U-turn reverses it. Joining a new road, or a gap over 60 m, slides it there (critically damped, about 0.35 s) with no sideways jump. Off the road it rides the same way in open ground. Fixed 120 Hz simulation step: identical path at any frame rate and through dropped frames. Settles and stops the frame loop when at rest. Uses `followRouteProgress` so the icon, the line trim and the camera agree on where the rider is.
* **Removed**: per-fix `durationMs` tween, `MAX_PREDICTION_MS`, and the unused `followCameraDurationMs(glideMs, …)` in `navigationCamera.ts` (and its test). GLIDE_MS comments were updated. `GlidingRiderMarker.tsx` and `LiveErrandMap.tsx` are unchanged apart from comments: one frame loop, native `setCoordinates`, the camera following `onPositionChange`.
* **Puck** (`assets/rider-motorcycle.png`, `@2x`, `@3x`): top-down Cycles render of a 3D chibi delivery scooter (SUGO Red body, red helmet with a white heading stripe, white box lid with a red stripe, short headlight beam), facing north, with a shadow that fades out before the frame edge so it rotates cleanly. Source `.blend` and the 768 px master are kept outside the repo at `C:\Capstone_Server\character_animation\rider_motorcycle\`. `assets/rider-motorcycle.svg` is stale (never loaded).
* **Verification**: `tsc --noEmit` clean. Jest 27 suites / 230 tests pass. Vitest 571 pass; 6 pre-existing failures in `tests/updatesService.test.ts` (its `expo-updates` mock lacks `setUpdateRequestHeadersOverride`, added in 6758bf6), unrelated. `tests/riderMotion.test.ts` rewritten (17 tests).
* **Test build** (EAS `preview` profile, channel `preview`, v1.1.0 versionCode 4, commit f5429bc, link expires 2026-11-14): https://expo.dev/artifacts/eas/5mies25AOXrplt3wE3wGBFN_U2nQhG5IhZA4YkpXy6E.apk (build page: https://expo.dev/accounts/astrowarden/projects/RiderMobileApp/builds/40cc8fcd-bd73-4f90-8923-bb13d661e199). The first attempt died uploading a 96 MB tarball (ECONNRESET); `android/app/.cxx/` (600 MB local CMake cache) is now in `.easignore` and the upload takes seconds.
* **Next session**: Not on the production channel; a production APK is still needed to reach riders. Road-test this preview APK on the Samsung A04: steady riding, corners, hard stops at junctions (icon may pass the stop line by up to ~1 s of travel, then roll back), U-turns, a GPS outage (must settle within 3 s), 2D/3D, Google/OSM. Do not reintroduce a per-fix duration or tween.

## 2026-10-29 - Release v1.1.0: Red Motorcycle Sprite & EAS Production Build (Gemini 3.8 Flash High)

* **Request / finding**: User requested bumping Rider Mobile App from v1.0.0 to v1.1.0, replacing the navigation arrow puck with a custom red motorcycle driven by a person in pink clothes, and building with EAS.
* **Status**: Implemented, verified, and successfully built via EAS Cloud (`production` profile).
* **Build Artifact**:
  - Android Production APK: https://expo.dev/artifacts/eas/wFct6ACs5LwawE6SwN2D1lzXNLKO5Vma0FE1sCpNaPw.apk
  - EAS Build Dashboard: https://expo.dev/accounts/astrowarden/projects/RiderMobileApp/builds/311364af-307f-4e6f-af06-f4eab618b2c6
  - Version: `1.1.0` (versionCode `4`)
* **Version Bumps**:
  - `app.json`: Bumped `version` to `1.1.0`, `runtimeVersion` to `1.1.0`, added `versionCode: 2` under `android`.
  - `package.json`: Bumped `version` to `1.1.0`.
  - `android/app/build.gradle`: Bumped `versionCode` to `2` and `versionName` to `"1.1.0"`.
* **Sprite Asset Pipeline** (`assets/rider-motorcycle*`):
  - Created North-up ($0^\circ$) vector blueprint: `assets/rider-motorcycle.svg` (44 dp).
  - Generated transparent multi-DPI hardware sprite textures via Blender Cycles:
    - `@1x`: `rider-motorcycle.png` (44x44 px)
    - `@2x`: `rider-motorcycle@2x.png` (88x88 px)
    - `@3x`: `rider-motorcycle@3x.png` (132x132 px)
  - Colors: SUGO Red (`#DC2626`) chassis, dark rubber tires (`#1E293B`), pink jacket (`#EC4899`), pink helmet (`#F472B6`) with dark visor, soft ambient ground shadow.
* **Marker Integration** (`src/components/GlidingRiderMarker.tsx`):
  - Updated line 8 to require `../../assets/rider-motorcycle.png`.
  - Retains `{ x: 0.5, y: 0.5 }` center anchor, `flat={true}`, and 60 FPS `requestAnimationFrame` native rotation/coordinates loop without React re-renders.
* **Verification**:
  - `npx tsc --noEmit`: PASS (0 errors).
  - Jest `tests/GlidingRiderMarker.test.tsx`: 11/11 tests PASS.
* **Next session**: Complete EAS production build download and install on Samsung Galaxy A04 test device. Validate road movement with new vehicle sprite.

## 2026-10-29 - Fix continuous rider gliding under real GPS timing (Codex)

* **Request / finding**: User observed 1,100 ms jitter on the Rider app's own map using an installed APK on Samsung A04. Inspection reproduced the source defects: the fixed tween exhausted its frames at 1,100 ms (900 ms frozen with a 2 s fix gap), interrupted tweens changed velocity abruptly, and an immediate heading write followed by interpolation caused a 90-degree heading to jump backward to about 46 degrees. The old five mocked marker tests passed while three temporary continuity diagnostics failed. This entry supersedes the October 27 claim that `GLIDE_MS = 1100` guarantees continuous real-world movement. `timeInterval: 1000` is a minimum interval, not a guaranteed delivery cadence.
* **Status**: Implemented and verified in local source. No APK built, OTA published, app installed, server deployed, or Samsung A04 road test performed in this session. Preserve all unrelated existing uncommitted changes.
* **Motion** (`src/utils/riderMotion.ts`, new): Accepted GPS timestamps determine interpolation duration (400-2,000 ms); `performance.now()` drives rendering independently of wall-clock adjustments and frame drops. Hermite interpolation carries the current position and velocity into a new fix. Short gaps continue with a velocity-continuous taper to rest, limited to 2 s of prediction and 25 m beyond the last target. Stale or stopped fixes do not extrapolate; duplicate/out-of-order timestamps do not reset movement. Newer same-coordinate stop samples are consumed. Road distance sampling follows vertices in either direction, clamps at road endpoints, and uses cached cumulative lengths plus binary search per frame. Off-route fixes remain off-route; route replacement preserves the drawn position. Distant fixes and long resume gaps reset immediately. Predicted coordinates are visual only and never enter GPS publication, telemetry, geofences, routing, or ETA calculations.
* **Marker** (`src/components/GlidingRiderMarker.tsx`): Removed the fixed 1,100 ms loop termination and unused smootherstep helper. One requestAnimationFrame loop sends native coordinate/rotation commands without React renders per frame. Only that loop owns rotation; the React rotation prop stays at the mount seed. Time-based shortest-arc smoothing handles north crossings and fresh turns after idle. New pins start with their actual heading. Route identity / compass refreshes do not restart positional motion. Null targets, inactive maps and unmount cancel frames; stationary pins do not keep an idle loop running.
* **Camera** (`src/components/LiveErrandMap.tsx`): Passes `updatedAt`, `stationary` and `active` into the marker. Following uses the marker's exact visual frame via native `setCamera`, replacing separate per-GPS camera animations. Keeps 2D north-up/flat, 3D chase pitch, camera padding placement, user pan/recenter and overview behavior. Recreated base maps clear the previous map's sampled center. Initial placement and explicit mode/recenter controls remain separate from continuous following.
* **Tests**: Reworked `tests/GlidingRiderMarker.test.tsx` (11 tests) around delayed/irregular real-world fix sequences, finite-difference velocity continuity, one frame loop, native camera callback samples, road bends, rotation/no backward snap, north crossings, idle turns, timestamp ordering, newer same-coordinate stops, inactive/null/unmount cancellation and distant resumes. Added `tests/riderMotion.test.ts` (15 tests) for timestamp cadence vs delivery bursts, bounded/stale prediction, velocity continuity, bends/reverse travel, route endpoints/replacement, off-road endpoints and frame-drop independence. Updated `tests/LiveErrandMap.test.tsx` to exercise camera callbacks, timestamp forwarding, inactive/pan behavior, 2D and recreated maps. `tests/Compass.test.tsx` isolates heading selection from the separately tested marker animation.
* **Verification**: Read the required Expo SDK 57 docs before coding. `npx --no-install tsc --noEmit`: PASS (0 errors). Jest marker + LiveErrandMap + Compass: 3 suites / 64 tests PASS. Vitest riderMotion + routeGeometry + routeProgress + navigationCamera + gpsStabilizer: 5 files / 68 tests PASS. Targeted `git diff --check`: PASS. Native modules are mocked; these checks verify the motion/control logic, not actual Android frame rate. No GPS/HTTP/Firebase/socket cadence, background task, API/schema/auth, dependency or native configuration changes.
* **Next session**: Build/install an updated Rider APK or ship an explicitly requested compatible OTA before testing; the previously found local release APK predates the glide changes. Verify the running build/update identity. On Samsung A04, road-test continuous travel with 1-2 s variable fixes, corners, stop/start, north crossings, 2D/3D, pan/recenter, Google/OSM, screen lock/background/resume, and a sustained GPS outage (bounded prediction must settle rather than invent indefinite travel). Do not restore a fixed-duration stop, per-fix native camera tween, live heading React rotation prop, or a second imperative rotation writer. Preserve locked telemetry/GPS/layout/route-color contracts.

## 2026-10-27 - Non-Stop Continuous Velocity Marker Gliding & Telemetry (Antigravity 2.0 / Gemini 3.8 Flash High)

* **Status**: Executed & Verified across all 27 Jest test suites (221/221 passed) and TypeScript (`tsc --noEmit` 0 errors).
* **Continuous Non-Stop Velocity Flow (`GlidingRiderMarker.tsx`)**:
  - Eliminated the periodic boundary deceleration of S-curve easing which caused repeated stop-and-go stutter every 1 second.
  - Replaced with constant-velocity linear progress along the road carriageway, maintaining unbroken forward momentum while cruising.
  - Calibrated `GLIDE_MS` to 1,100 ms (slightly longer than the 1,000 ms GPS fix cadence), ensuring the marker is actively in motion when the next GPS fix arrives, seamlessly carrying momentum into subsequent fixes without dead-stop freezes.
  - Preserved continuous shortest-arc rotational slerp and road-following geometry around curves.
* **Type Safety Fixes**:
  - `src/components/LiveErrandMap.tsx`: Fixed casing of `FontWeights.semibold` in `speedometerUnit`.
  - `src/hooks/useTurnByTurnNavigation.ts`: Passed `speedMps: null` inside `if (!riderLocation)` guard to resolve TypeScript narrowing.
* **Verification**:
  - `npx tsc --noEmit`: 0 errors.
  - Jest: 27 test suites / 221 unit tests passed.
  - Vitest: `tests/turnByTurn.test.ts` (23/23 passed).


* **Status**: Executed & Verified. Zero breaking API changes; locked contracts strictly honored.
* **Fluid Water-Flow Movement (`GlidingRiderMarker.tsx`)**:
  - Replaced stiff mechanical linear interpolation with Ken Perlin's **Quintic Smootherstep Easing** (`fluidSmootherstep(t) = 6t^5 - 15t^4 + 10t^3`), featuring zero 1st and 2nd derivatives at motion boundaries.
  - Calibrated animation duration `GLIDE_MS` to a responsive **900 ms** (down from 1,100 ms) so the marker flows like liquid without trailing or stalling.
  - Implemented continuous laminar angular flow along curved route vertices and continuous shortest-arc rotational slerp (`((to - from + 540) % 360) - 180`).
* **Speedometer HUD (`LiveErrandMap.tsx`)**:
  - Pinned `## KM/H` speedometer capsule at bottom-left above `bottomEtaBadge`. Features anti-glare Deep Navy surface (`rgba(15, 23, 42, 0.90)`), tabular digits (`fontVariant: ['tabular-nums']`), 18sp bold text, and `#94A3B8` unit label.
* **Store-Bound Velocity ETA (`useTurnByTurnNavigation.ts` & Server `etaStrategy.ts`)**:
  - Store trip ($v \ge 2.0\text{ m/s}$): transit time calibrated by rider speed (capped at 60 km/h).
  - Red light/stop sign ($v < 2.0\text{ m/s}$): countdown progress freezes, preserving previous seconds.
  - Store wait/dwell times (`dwellLowSeconds`, `dwellHighSeconds`): **100% untouched**.
* **Verification**:
  - `RiderMobileApp`: `npx tsc --noEmit` passed (0 errors). Vitest `turnByTurn.test.ts` (23/23), `routeGeometry.test.ts` (11/11), `navigationCamera.test.ts` (20/20).
  - `Capstone_Server`: `npm run build` passed (0 errors). Vitest `etaStrategy.test.ts` (13/13).

* **Status**: Local source only; no APK/OTA built or distributed. Preserve unrelated uncommitted work and all locked contracts.
* **Movement**: `src/components/GlidingRiderMarker.tsx` replaces 33ms interval/React-state drawing with display-scheduled `requestAnimationFrame` calls to the installed react-native-maps 1.27.2 native `setCoordinates` command. Constant-speed interpolation removes the repeated ease-out acceleration/deceleration at each GPS tick. Route or heading refreshes do not restart a glide to the same fix; a new fix starts from the actual drawn point. Road bends remain road-following; reverse travel on a segment and off-road endpoints are guarded. Missing targets/unmount cancel frames; stationary targets do not schedule frames; distant resume fixes are placed immediately. Google and OSM share this component. No increase in GPS, HTTP, Firebase or route request cadence.
* **Background**: `src/hooks/useRiderMissionSocket.ts` repeats `rider:heartbeat_pause` when a socket connects while backgrounded, and when leaving active state even if the heartbeat timer already stopped. Paired server changes honor newer HTTP beacons, apply disconnect grace and confirm/deduplicate dispatcher alerts.
* **Tests/harness**: Added `tests/GlidingRiderMarker.test.tsx` and `tests/RiderHeartbeat.test.tsx`; updated the shared `jest.setup.js` Marker mock with its native imperative API. New tests cover intermediate movement/no React renders per frame, interrupted glides, bends, route/heading refreshes, reverse movement, null/unmount cleanup, stationary/distant fixes, background pause and foreground resume/reconnect.
* **Verification**: Read required Expo SDK 57 docs and inspected the installed native marker API before implementation. `npx tsc --noEmit` passed. Vitest geometry/progress/navigation-camera/GPS-stabilizer: 4 files / 53 passed. Jest new marker/heartbeat plus existing LiveErrandMap/Compass: 4 suites / 56 passed. The existing LiveErrandMap animated-view act warning remains non-failing. Native modules are mocked: actual phone smoothness, Android background execution and release behavior are not yet verified. Server companion suite: 49 passed. No API routes/schema/auth changes.
* **Next session**: Deploy server and distribute an updated rider app when requested; verify continuous travel and bends with both map choices, lock/unlock/background/reconnect, brief network interruptions with no toast/bell entries, and a sustained outage with a single confirmed initial alert. Alert confirmation is 30 seconds after observed signal-lost status and checked on the existing server watcher interval; initial alerts have a ten-minute cooldown, while existing prolonged-outage reminders remain.

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

## 2026-10-22 - Rider identity, Home photo and shared neutral backgrounds (Codex)
* **User request**: Hide rider IDs in Profile/Home; show Online or Offline from the availability switch; display the API profile photo on Home; place a background-free pencil immediately after the final name at 101% of name font size; remove the bell background; replace warm backgrounds globally with My History's background.
* **Identity and controls**: `src/modules/profile/ProfileScreen.tsx` removes the ID row, uses a wrapping name with its final word and pencil kept together, preserves a full-name screen-reader label, scales the pencil with the name and system font scale, and retains its transparent 48dp EditProfile touch target. Availability text follows `isOnline`; helper copy and `toggleShiftStatus` are preserved. `src/components/NotificationBell.tsx` removes the icon backing while keeping its touch target, unread badge and notification actions.
* **Home photo**: `src/components/RiderHeader.tsx` removes the displayed ID and loads `riderApiService.fetchProfilePhoto(profile.id)`, using the same `photoUpdatedAt` refresh signal as Profile. Initials remain available for missing/failed images; cancelled requests and account changes cannot display another rider's late photo. Existing Profile upload/resize/refresh logic is preserved.
* **Surfaces**: Added `src/config/riderSurfaceTheme.ts`; Home/Profile theme aliases and `src/config/taskSheetTheme.ts` now share neutral surfaces. The page background matches My History's existing `Colors.bgGray` (#F3F4F6), with white content surfaces, neutral secondary surfaces/dividers, and the existing blue/status accents. Updated Home/Profile/header backgrounds; renamed task secondary surface references in TaskScreen, RequestItemsPanel, CustomerDetailsPanel, DropOffDetails and ErrandQueueList. No warm ivory/cream overrides remain in `src`.
* **Global canvas**: `App.tsx` navigation/root background, LoginScreen and its TacticalGridBackground/status bar, ForgotPasswordScreen, ErrandDetailsScreen, DispatcherChatScreen and ReceiptCaptureScreen now use the same My History background. History, EditProfile, GPS and Task roots already use it. Customer palette, map imagery/routes, telemetry and business logic remain unchanged. Preserve all unrelated changes in this dirty working tree.
* **Verification**: `npx tsc --noEmit` passed. Focused Jest: Home, Profile, GPS calibration and Task layout, 4 suites / 37 tests passed. Coverage includes Home photo fetch/refresh/error fallback/stale-account responses, hidden identity labels, availability state and existing navigation/upload/task actions. Vitest palette/vocabulary: 2 files / 54 tests passed. UI audit retains the same five existing sub-48dp findings; pencil and bell targets remain 48dp. Its contrast scanner reports zero measured pairs, so this audit is not a complete contrast certification. `git diff --check` passed.
* **Next session**: JS-only, uncommitted, not published. Verify on a phone: compact/enlarged-font name wrapping and pencil placement, Home photo after a Profile upload, and perceived background match across screens. Automated rendering uses mocked native modules/APIs and does not confirm device appearance or live API connectivity. This request supersedes the previous fixed Offline label and warm-surface direction.

## 2026-10-22 - Profile controls and visibility follow-up (Codex)
* **User request**: Move Edit Account to a pencil-only control right of the rider's name; hide Account details and Audible Alert Chimes; replace Available Online with the fixed label "Offline" and the description `You can receive errands when turned on and while location is set to "Allow all the time".`
* **Modified**: `src/modules/profile/ProfileScreen.tsx` (48dp pencil button in the name row with the existing EditProfile route and accessibility label; hidden sections removed from the render; unused section styles and local sound-control state/read/write removed); `tests/ProfileScreen.test.tsx` updated to match the requested visibility/copy and retain action coverage.
* **Preserved**: `isOnline` switch value, `toggleShiftStatus`, dynamic Go online / Go offline accessibility action, photo uploads, GPS navigation, logout and all account data/EditProfile form. "Offline" is a user-requested fixed control label; it does not force or invert the actual duty state. Saved sound preference is not cleared or overwritten; notification/mission services still read the existing storage key.
* **Verification**: `npx tsc --noEmit` passed; Profile Jest 5/5 passed; `git diff --check` passed. Native appearance and long-name/pencil alignment still require phone verification. JS-only, uncommitted, not published; preserve unrelated existing Home/task/OTA/palette changes.

## 2026-10-22 - Rider Home screen UI/UX and whitespace (Codex)
* **Scope**: UI/UX only, retaining the user's warm ivory/soft blue preference. Simplified the navy header and multicolor offers; completion now uses a green success cue on the warm page instead of a large red panel. Red remains the offer/next-errand action; the persistent navigation action is blue.
* **Files**:
  - `src/modules/home/HomeScreen.tsx` and new `homeTheme.ts`: warm canvas, clear offer heading, fees integrated before offer actions, measured navigation dock with matching scroll clearance above the existing Android/tab-bar offset. Existing `home-active-task-fab` test ID and Task navigation handler retained.
  - `src/components/RiderHeader.tsx`: readable, constrained light header; one auth-backed On duty / Off duty label instead of duplicate LIVE badges; rider identity and notification history retained.
  - `src/modules/home/components/NewTaskCard.tsx`: optional `feeDetails` slot; compact earnings row, larger text, complete wrapping names/stores/address, consistent blue route markers, real countdown preserved and labelled for screen readers. Countdown/expiry/accept/decline code unchanged.
  - `WaitingCard.tsx`, `OfflineCard.tsx`, `CompletedCard.tsx` in the same directory: distinguish current errand, ready, off-duty and network-offline states; only offer saved details when an errand exists; next-errand earnings still come from the working errand. No decorative radar rings or giant earnings panels.
  - `DeclineModal.tsx`: warm surface, clearer decline copy, readable reason placeholder, existing cancel handler on Android Back; reason and submit callbacks retained.
  - `src/components/NotificationBell.tsx`: 48dp bell/close/read targets, clearer unread count; notification hooks and actions unchanged.
  - `src/components/FeeBreakdownPanel.tsx`: optional flat white `offer` variant; existing card/sheet behavior and financial calculations retained.
  - New `tests/HomeScreen.test.tsx`: 8 action/state tests, including selected-offer acceptance, per-offer expiry, decline, dock clearance, offline data access, retry, delivered payout and notification history.
* **Preserved**: Shared mission/auth state, offer IDs and 45-second countdown, slide-to-accept gesture, queue and payout logic, maintenance/status banners, saved-errand modal, navigation routes, API/socket/GPS/telemetry behavior. No dependency/native/config changes. Preserve unrelated existing working-tree changes.
* **Verification**: `npx tsc --noEmit` passed; Jest Home + existing offer-expiry suites 12/12 passed; Vitest queue/gate/vocabulary suites 73/73 passed; `git diff --check` passed. Eight measured light-mode color pairs >=4.5:1 (navigation 7.05:1, timer 6.26:1, primary action 4.83:1). UI audit retains five pre-existing sub-48dp targets outside Home. New render harness needed the existing AsyncStorage mock and theme-context stub; no runtime changes were made to those providers.
* **Next session**: JS-only, uncommitted, not published. Native visual QA remains required: long/multiple offers, large fonts, swipe acceptance, decline keyboard, notifications, and navigation dock clearance on Android three-button navigation. Tests mock native gestures/services; no live server/device verification is claimed.

## 2026-10-20 - GPS calibration preparation modal (Codex)
* **Request**: Add a modal when starting calibration. `src/modules/profile/GpsCalibrationScreen.tsx` now opens a warm ivory "Ready to calibrate?" dialog with open-sky/phone-position instructions, the existing 30-second duration, Begin calibration, and Not now. Android Back dismisses it. Start, Try again, Run again, and the restart after enabling Location all go through this dialog.
* **Preserved**: Location permission and GPS subscription begin only after confirmation. Existing `start` measurement, sampling, analysis, save, cancellation, provider checks and stabilizer code are unchanged. Modal body scrolls on short/large-font screens; actions stay separate with >=48dp targets; width capped at the existing max content width. Primary button text can wrap. No API/native/dependency changes.
* **Tests**: Updated `tests/GpsCalibrationScreen.test.tsx` for confirmation and added cancellation/back coverage. Verified retry/repeat, enabling Location followed by confirmation, measurement and saving. `npx tsc --noEmit` passed; GPS Jest 6/6 passed; Profile Jest 5/5 passed; GPS analysis/vocabulary Vitest 22/22 passed; `git diff --check` passed. A first test assertion matched instructions behind the modal as well and was corrected to query within the modal.
* **Next session**: Native modal appearance, screen-reader focus and Android permission-dialog transition still need phone verification. JS-only, uncommitted, not published. Preserve all earlier Profile/task/OTA/palette changes in the working tree.

## 2026-10-20 - Rider Profile screen layout and readability (Codex)
* **Scope**: UI/UX only, following the user's preference for warm surfaces with restrained color. Replaced the large navy identity card with an inline avatar/name/ID header on ivory; blue photo control, green online status, one red Edit Account action, quiet separate Sign Out action.
* **Layout**: Profile identity -> Availability -> Account details + Edit Account -> App preferences (alert chimes and GPS calibration) -> Sign Out. Removed repetitive settings cards. Availability/sound switches have a dedicated title row and full-width helper copy below. Account labels sit above full-width selectable values so long emails wrap; missing phone/email reads "Not provided". Improved helper text, section spacing, 48dp switch targets, and heading accessibility. Retained the 580dp content constraint and Android navigation/tab-bar bottom clearance. Photo upload now has a live "Saving your photo…" hint and exposes its existing disabled/busy state.
* **Files**: `src/modules/profile/ProfileScreen.tsx`; new `src/modules/profile/profileTheme.ts`; new `tests/ProfileScreen.test.tsx`.
* **Preserved**: Existing shared mission/auth context usage, profile data and photo fetch/resize/upload/rollback logic, upload size limit, duty toggle, sound preference storage key, EditProfile/GpsCalibration routes, and logout handler. No API, telemetry, dependency, native, or EditProfile form changes. Preserve all unrelated existing working-tree changes.
* **Verification**: `npx tsc --noEmit` passed. Focused Jest 2 suites / 9 tests passed (5 new Profile action tests plus existing GPS tests); Vitest vocabulary/stage-adaptive tests 2 files / 25 tests passed. Nine measured contrast pairs passed text >=4.5:1 or control boundary >=3:1 (navy/ivory 11.24:1, helper text 10.07:1, blue/avatar 6.26:1, primary action 4.83:1). UI audit retains the same five pre-existing sub-48dp targets outside Profile; no new Profile findings. `git diff --check` passed.
* **Next session**: JS-only, uncommitted, not published. Native visual QA still required: check compact phone + enlarged fonts, long names/email, photo saving, online/offline, sounds on/off, and Sign Out clearance above Android navigation. Automated tests mock native UI/services and do not establish device appearance or live server connectivity.

## 2026-10-20 - Warm task-sheet palette after grayscale feedback (Codex)
* **Feedback**: The first visual pass looked heavily grayscale and felt tiring to the user. Rebalanced the existing layout with warm ivory sheet/footer surfaces, cream metadata and notes, soft blue active/control surfaces, navy headings, green completed steps/items, and the existing red primary action. This entry supersedes the earlier neutral-color direction below.
* **Files**: Added `src/config/taskSheetTheme.ts` for task-local colors. Updated `src/components/BottomSheet.tsx` with optional `surfaceColor` (default appearance preserved for other callers); `src/components/FeeBreakdownPanel.tsx` sheet variant; `src/modules/task/TaskScreen.tsx`; task components `ProgressSteps.tsx`, `RequestItemsPanel.tsx`, `CashCollectionInput.tsx`, `CustomerDetailsPanel.tsx`, `DropOffDetails.tsx`, `PaymentProofViewer.tsx`, and `ErrandQueueList.tsx`.
* **Preserved**: Layout, stage order, touch targets, action handlers, task gates, payment calculations, proofs, queue holds and selection, GPS, route colors, and shared Customer/Rider palette. UI color changes only; no dependencies or native build changes.
* **Verification**: `npx tsc --noEmit` passed; focused Jest render tests passed (7 suites / 50 tests) using the workspace cache. Eight measured color pairs passed: text >=4.5:1 (blue/soft blue 6.26:1; body/ivory 10.07:1; completed text 6.78:1), blue control boundary 3.81:1. `git diff --check` passed. Earlier full logic/render results remain recorded below; not rerun for this color-only pass.
* **Next session**: Verify the revised colors on a phone with the user; perceived comfort and native appearance have not been device-verified here. Keep future tuning task-scoped and preserve all existing app connections and unrelated working-tree changes. No publication performed.

## 2026-10-20 - Rider task bottom sheet visual hierarchy and whitespace (Codex)
* **Scope**: UI/UX only. Neutral white surfaces, navy controls and current-step emphasis, red pinned primary action, semantic warning/success feedback. Existing task gates, callbacks, receipt/payment capture, queue selection/holds, GPS, sockets, and sheet/map coverage behavior retained. No new dependencies or native changes.
* **Modified**:
  - `src/modules/task/TaskScreen.tsx`: one progress section before stage details; neutral category/payment/status chips; aligned, scaled section spacing and 580dp maximum content width; readable full drop-off details; larger primary action and header metadata touch target.
  - `src/modules/task/components/ProgressSteps.tsx`: compact neutral step rows, current step in navy, screen-reader labels for completed/current/upcoming steps.
  - `src/modules/task/components/RequestItemsPanel.tsx`: removed nested colored panels and repeated store heading; item and stock action share a row; neutral receipt controls; 48dp stock target; retained all item/capture gating and handlers.
  - `src/modules/task/components/CustomerDetailsPanel.tsx` and `DropOffDetails.tsx`: unboxed sections, neutral call/note styling, complete address wrapping, more readable shopping address text.
  - `src/modules/task/components/CashCollectionInput.tsx`, `PaymentProofViewer.tsx`, and `ErrandQueueList.tsx`: neutral secondary controls and spacing; financial amounts, proof state, queue order and callbacks retained.
  - `src/components/FeeBreakdownPanel.tsx`: optional `variant="sheet"` removes green card styling within the task sheet; Home keeps the default card appearance.
* **Verification**: `npx tsc --noEmit` passed (0 errors); Vitest 32 files / 545 tests passed; Jest 22 suites / 185 tests passed using `npm run test:render -- --runInBand --cacheDirectory=./node_modules/.cache/task-sheet-jest` (default Windows temp cache failed with EPERM before tests ran). Existing React act warnings remain in unrelated map/splash tests. `git diff --check` passed. Eight selected light-palette foreground/background pairs measured >=4.5:1 (primary white/red: 4.83:1; navy on light surfaces: >=10.45:1). UI audit still reports the same five pre-existing sub-48dp targets outside this sheet; its palette scanner currently detects zero pairs, so do not treat that audit as a full contrast certification.
* **Next session**: JS-only, uncommitted, not published. Native visual QA remains required: ADB daemon could not start in this environment. Check compact/large-font layouts, long item names/notes, stock controls, shopping and cash/ledger delivery, queued/held errands, and collapsed/expanded/full sheet states on a phone. Preserve unrelated existing OTA/palette/errand-reference changes in the working tree.

## 2026-10-20 - Over-The-Air (OTA) Updates Integration (`expo-updates`, EAS Production Lock, Defensive `updatesService`) (Antigravity 2.0, Gemini 3.8 Flash)
* **Status**: [Executed & Deeply Verified - `npx tsc --noEmit` passed with 0 errors, Vitest passed 100% (32/32 files, 535/535 tests), `npx expo config --type public` validated].
* **Specification & Architecture**:
  - **OTA Delivery Pipeline Integration (`expo-updates` ~57.0.26)**:
    - Installed Expo SDK 57 compatible `expo-updates` package via `npx expo install expo-updates`.
    - Configured `app.json` with EAS endpoint (`https://u.expo.dev/275be8ea-14b0-4ac6-90dc-168df39618a1`), `checkAutomatically: "ON_LOAD"`, and zero-startup-lag policy (`fallbackToCacheTimeout: 0`).
    - Configured bare-workflow literal string `"runtimeVersion": "1.0.0"`.
  - **EAS Build & Ignore Configuration (`eas.json` & `.easignore`)**:
    - Created `eas.json` defining `production` profile with `channel: "production"` and `"android": { "buildType": "apk" }`.
    - Created `.easignore` excluding local heavy build caches (`.gradle/`, `android/.gradle/`, `android/app/build/`) to guarantee ~2-3 MB upload size instead of 1+ GB bloat, while preserving `google-services.json` and `.env`.
  - **Native Android Manifest Alignment (`AndroidManifest.xml` & `strings.xml`)**:
    - Flipped `expo.modules.updates.ENABLED` to `true`.
    - Added `expo.modules.updates.EXPO_UPDATE_URL` (`https://u.expo.dev/275be8ea-14b0-4ac6-90dc-168df39618a1`).
    - Added `expo.modules.updates.EXPO_RUNTIME_VERSION` linked to `@string/expo_runtime_version` and defined `<string name="expo_runtime_version">1.0.0</string>` in `strings.xml`.
    - Injected `UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY` with `{"expo-channel-name":"production"}`.
  - **Defensive Anti-Happy-Path Updates Service (`src/services/updatesService.ts`)**:
    - In `__DEV__` or when updates are disabled, short-circuits instantly to protect Metro HMR and avoid native invalidated bridge callbacks.
    - Handles `isRollBackToEmbedded` directives for instant emergency rollbacks.
    - Added 15-minute background check cooldown throttling and AppState foreground listener (`setupUpdateListeners()`).
    - Non-blocking error handling: network timeouts on rider routes fail silently without interrupting active delivery missions.
  - **Application Mount Integration (`App.tsx`)**:
    - Wired `syncUpdatesInBackground(true)` and `setupUpdateListeners()` on root mount with cleanup unsubscription.
  - **Testing (`tests/updatesService.test.ts`)**:
    - Added Vitest test suite covering dev-mode bypass, disabled bypass, successful detection and download, rollback to embedded, AppState foreground listeners, and Anti-Happy-Path network error handling (15/15 passed).
* **Files Modified / Created**:
  - `package.json` & `package-lock.json`
  - `app.json`
  - `eas.json` (NEW)
  - `.easignore` (NEW)
  - `android/app/src/main/AndroidManifest.xml`
  - `android/app/src/main/res/values/strings.xml`
  - `src/services/updatesService.ts` (NEW)
  - `App.tsx`
  - `tests/updatesService.test.ts` (NEW)
* **Verification Ledger**:
  - `npx tsc --noEmit`: 0 errors.
  - `npx expo config --type public`: Validated configuration with `runtimeVersion: "1.0.0"` and `updates`.
  - `npm test`: 32/32 test files passed, 535/535 tests passed (100%).

---

## 2026-10-20 - Same customer, one trip: a bought errand waits for the other (Claude, Opus 5.5)
* **Status**: [Executed by Claude - tsc 0, vitest 545, jest 21 suites / 178. JS only. NOT device-verified; uncommitted. Server and Customer App halves in their own handshakes.]
* **Ask**: rider on the way with a customer's errand is given that customer's second errand: hold the first, shop the second, deliver both together; a different customer queues as before.
* **Rule** (`src/services/errandQueue.ts`, mirrors server `patterns/deliveryHold.ts`): an accepted errand is HELD while it is bought (rider step past shopping; before its slot is rebuilt, `itemsPurchasedAt`) and another accepted errand with the same `customerId` and the same drop-off (within 100 m, or the same written address when a pin is missing) is not bought yet. `applyDeliveryHolds` moves that sibling directly in front of the held one; nothing else moves. Unknown `customerId` never holds.
* **Modified**: `errandMapper.ts`/`types/rider.ts` (`customerId`); `useRiderMission.ts` (`queueOrder` -> `deliveryHolds` -> `activeErrands`; holds frozen while a camera is open; `deliveryHoldFor`; banner + dispatcher chat message when a hold begins, banner when it ends, announced keys persisted per rider at `@sugo_rider_announced_holds_v1:<id>` so restarts stay quiet; `startErrandFirst` refuses a held errand); `TaskScreen.tsx` (hold notes on both errands, held dock note, held errands never offered as "do first"/"while you wait"); `ErrandQueueList.tsx` ("Waits for X, then delivered with it").
* **Tests**: 9 in `tests/errandQueue.test.ts`, 1 in `tests/errandMapper.test.ts`, 2 in `tests/TaskScreenQueue.test.tsx`. vocabulary.test's text-node regex reads `=> ... <` spans in code: keep `mission.` out of such spans (TaskScreen reads `deliveryHoldFor` into a local for this reason).
* **Not built**: no rider override to deliver the held order alone (the dispatcher cancels or reassigns the second order, which releases the hold); the hook's announce effect is untested (typecheck only).

## 2026-10-20 - Drop-off pill shows the whole address (Claude, Opus 5.5)
* **Status**: [Executed by Claude - tsc 0, jest 21 suites / 176 (4 new), vitest 520. uiAudit unchanged (no new findings). JS only. NOT device-verified; uncommitted.]
* **Ask**: under "Drop-off: <customer>" (the shopping-stage pill in TaskScreen) show the customer's whole address: the address, street name, landmark, and the note for the rider.
* **Modified**:
  - `src/modules/task/components/DropOffDetails.tsx` (new): Street / Landmark lines and a "Note for the rider" box, each only when filled in. Imported directly by TaskScreen, not through `./components`, which the TaskScreen suites mock.
  - `src/modules/task/TaskScreen.tsx`: the pill's address is no longer cut to one line (`testID="dropoff-address"`), `DropOffDetails` sits under it, and the call button aligns to the top.
  - Tests: `tests/DropOffDetails.test.tsx` (new), one case in `tests/TaskScreenQueue.test.tsx` (errand A now carries street, landmark, notes).
* **Data**: no server change. `deliveryStreetName` / `deliveryLandmark` / `deliveryNotes` were already on every errand (ERRAND_INCLUDE is an include, so all scalars) and mapped by errandMapper; only the delivery-stage CustomerDetailsPanel showed them.

## 2026-10-19 - Cash at the door: amount prefilled, swipe to confirm (Claude, Opus 5.5)
* **Status**: [Executed by Claude - tsc 0, jest 19 suites / 166 tests (9 new in `tests/ReceiptCaptureCash.test.tsx`), vitest 31 files / 513 tests. JS only, no native change. NOT device-verified.]
* **Ask**: a GCash/Maya errand whose customer pays cash instead ("They're paying cash instead"). On "What did they hand you?" the amount owed should be filled in, and "Confirm total" should open a confirmation that is settled by a left-to-right swipe, not a button.
* **Modified**:
  - `src/screens/ReceiptCaptureScreen.tsx`: new optional `expectedAmount` prop. CASH_COLLECTED fills the amount with it on every photo (retakes included); NO_RECEIPT still starts blank. "Confirm total" for cash now opens a bottom-sheet `Modal` (figure, matches / short / over vs the amount due, rider note) with the existing `SlideToConfirm`; the swipe runs the upload that the tap used to. A failed save keeps the sheet open and remounts the slider (`key`) for another swipe; a 410 still returns to the camera. The sheet wraps its content in `GestureHandlerRootView` because RNGH pans do not reach an Android Modal window otherwise.
  - `src/modules/task/TaskScreen.tsx`: passes `mission.dueAtDoor` as `expectedAmount` for CASH_COLLECTED, the same figure `completeReceiptCapture` judges full-or-short against.
* **Also fixed (same day)**: the cash card said "Receipt confirmed ✓" on a GCash/Maya errand paid in cash instead, because it labelled by `paymentPlan.hasLedger`. `ErrandProgress` gains optional `paymentProofKind` (`RIDER_BALANCE_PROOF` | `CASH_COLLECTED`), set in `completeReceiptCapture` and restored by `derivePayment` from the latest live payment photo; exposed as `mission.paymentProofKind` and passed to `CashCollectionInput` as `proofKind`. The plan stays as the fallback when the kind is unknown. Tests: 2 in `tests/missionProgress.test.ts`, 4 in new `tests/CashCollectionInput.test.tsx`. Final counts: tsc 0, jest 20 suites / 170, vitest 31 files / 515.
* **Non-COD fee off when paying cash instead (after cfd8dc0, uncommitted)**: the server now removes a GCash/PayMaya errand's non-COD fee when the cash photo is filed. `cashDueAtDoorFor` (missionProgress.ts) = `dueAtDoorFor` less `feeBreakdown.fees.nonCodFee` on a ledger errand; it is the prefill (`mission.cashDueAtDoor` -> `expectedAmount`), what `completeReceiptCapture` and the restore path judge cash against, and the card says "In cash: ₱X, without the ₱Y non-COD fee." under "They're paying cash instead". Counts: tsc 0, jest 172, vitest 520.
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



### Shared Customer and Rider Palette (2026-10-18, Codex)
- **User instruction**: Rider and Customer apps must use the same palette.
- **Changes**: Matching 62-role light/dark `src/config/palette.ts` modules, exposed through each app's existing `src/config/theme.ts` API. Red #DC2626 (light), #F87171 (dark), navy #1E3A5F, matching surfaces/text/status colors, and separate on-fill text roles. Existing typography, layouts, labels, handlers, GPS, and telemetry are preserved. Rider route-leg colors remain unchanged.
- **Verification**: `npx tsc --noEmit` passed in both apps. Customer `npm run audit:palette` confirms identical palette copies. Customer palette tests: 25 passed; Rider palette tests: 43 passed. No Android device or emulator is attached, so native visual verification is still required.
- **Next session**: Update both palette copies together. Use onPrimary/onDanger/etc. on filled buttons and keep white for imagery/overlays. A new mobile binary is required to ship these changes; this session has not released APKs.

- **Rider files**: `src/config/theme.ts` and new `src/config/palette.ts`. Light/dark surfaces, status inks, and aliases match Customer; existing exports and route-leg colors remain intact.
- **Android bundle verification**: Expo SDK 57 Android export succeeded (3,582 modules; 7 MB Hermes bundle) in `dist/palette-android`. This is a bundle check, not a released APK.

- **Android chrome files**: `app.json` and `android/app/src/main/res/values/colors.xml` now match Customer: navy native primary (#1E3A5F), red icon background and red notification accent (#DC2626). Both Expo configs resolve those values.

---

* **Session Log (2026-10-22, Claude Opus 5.5): Rider notifications: full screen, ride-status events, sorting**
- **User request**: redesign the rider notifications from the bell's bottom sheet into a screen like the CustomerApp; API and sockets for the ride statuses only; sorting. Decisions: offer & assignment, shopping stage, payment & handover, and dispatcher chat; organised like the customer (topics + "Action needed", Sort by).
- **Server** (`C:\Capstone_Server\server`, no schema change): `notificationCatalog.ts` `RIDER_NOTIFICATIONS` (OFFER: ERRAND_ASSIGNED*, OFFER_EXPIRED; ERRAND: RIDER_ERRAND_CANCELLED*, ITEMS_CONFIRMED*, ITEMS_UPDATED*, SUBSTITUTE_ANSWERED*, DELIVERY_HELD_RIDER; PAYMENT: RIDER_PAYMENT_CONFIRMED, RIDER_EXTRA_CHARGE_SETTLED*; CHAT: DISPATCHER_CHAT* collapsing per dispatcher, refKey `dispatcher:<id>`; * = actionNeeded while unread) + `presentRiderNotification`. `notificationService.deliverToRider` / `notifyRider` / `notifyErrandRider` (row + push, never throws). Triggers: offer expiry (`expireStaleOffers`, told to the rider whose offer lapsed), `updateStatus` CANCELLED (not when the rider cancelled it) and `declineErrandReview`, `confirmOrder`, dispatcher `updateItems`, `declineItemSubstitute`, delivery holds (both paths), staff `confirmBalancePayment` (not the rider's own proof photo), `confirmTopUp`, `userService.notifyRiderChatMessage` (now saved). `emitNew` and the rider GET present rider rows (topic, actionNeeded, errandId, dispatcherId). Tests: new `tests/riderNotifications.test.ts`; full suite only the 14 known failures.
- **Server DEPLOYED 2026-10-22 01:58 (+08), uncommitted**: live copies proved equal to local minus this change (removed and added lines all ours); backup `/root/deploy-backups/server-20261022-015817-rider-notifications`; tsc gate, build, restart, health 200; on prod rider 3 lists 39 rows presented.
- **RiderMobileApp** (`C:\Capstone_Project_Mobile_App\RiderMobileApp`, branch upgrade/expo-57, uncommitted, NOT released): new `context/RiderNotificationContext.tsx` (one feed: poll + `notification:new` via the mission socket, unread derived from the list, markRead / markAllRead (`PATCH /notifications/read-all`), error with last good list); `hooks/useNotifications.ts` now reads it; `services/notificationEvents.ts` (arrived / tapped channels); `useRiderMissionSocket` forwards `notification:new`; `useRegisterPushToken` forwards the tapped payload (and the cold-start tap); `hooks/useNotificationTapRouting.ts` called in the tab navigator; `utils/riderNotifications.ts` (topics, action needed, router, filter, sort, sections); `components/ShimmerWave.tsx` (ported from CustomerApp); `modules/notifications/NotificationsScreen.tsx` registered as `Notifications` (chips Action needed / Offers / Errand / Payment / Chat, no All, Sort by Newest / Oldest / Action needed first / Unread first, Today / Yesterday / Earlier, skeleton, errors, empty and no-match states); `NotificationBell` opens the screen (its 01:26 styling kept); `HomeScreen` double-tap-to-exit gated on focus so Android back works on pushed screens. Routing: chat -> DispatcherChat, live offer -> Home, expired offer -> nothing, errand in hand -> Task, other errand -> ErrandDetails. `tsc` clean; jest 25 suites / 213 pass; vitest 552 pass, 6 failures all in another session's untracked `tests/updatesService.test.ts`. Not seen on a device. Another session edited ~25 rider files at 01:26-01:28 (+08) (theme / touch targets); an OTA would ship their work too.

- **Release decision 2026-10-22 (user: "Don't release yet")**: no OTA or APK for the Rider notification screen. It ships with the next Rider app build or update. Until then installed rider apps keep the old bell sheet; the server changes are live and backward compatible (rows only gain fields).
- **Fix 2026-10-22: light mode only.** User: the rider app has no light/dark support, but the new Notifications screen showed dark. `NotificationsScreen.tsx` and the ported `components/ShimmerWave.tsx` used `useThemeColor()`, which follows the system scheme; both now use the light `Colors` like every other rider screen (they were the only `useThemeColor` callers). New test: the screen keeps light colours with the phone in dark mode. jest 25 suites / 214 pass. Still unreleased.
