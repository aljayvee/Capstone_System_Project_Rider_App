# RiderMobileApp Mobile Rules (Claude Protocol)

This file contains the mobile rules and instructions for Claude App / Claude Desktop.

---

## 🌐 Dual-Agent Tunnel Invariant (Always Active in All Sessions)
1. **Boot-Time Handshake Check (Step 0)**: In every session, ALWAYS inspect `AGENT_HANDSHAKE.md` in this directory before designing or modifying rider mobile components.
2. **Locked Contract Invariant**: NEVER alter telemetry broadcast logic or map hierarchies marked `[LOCKED]` in `AGENT_HANDSHAKE.md`.
3. **Surgical Diffs**: Always generate precise, minimal edits.

---

## Core Rider App & Telemetry Invariants

### 1. Dev-Mode Headless Task Guarding
- In `__DEV__`, NEVER run native background location tasks (`startLocationUpdatesAsync`) while in foreground.
- Use `watchPositionAsync` broadcast directly to Firebase RTDB (`saveRiderLocation`).

### 2. React Native Maps Layout Rule
- NEVER embed `MapView` inside a `ScrollView` or `FlatList`.

### 3. Progressive Single Active Leg Navigation
- **Store Phase**: Draw ONLY the active path ($R \to S_{\text{active}}$) in Yellow-Gold (`routeToStore`).
- **Delivery Phase**: Draw ONLY final delivery path ($R \to C$) in Blue-Light (`routeToCustomer`).
- Snapping: All route anchors snapped to road-network centerline.

### 4. Zero-Overlap Vertical Stacking
- `TurnByTurnHUD` at `top: insets.top + Spacing.xs`.
- `FeeCapsuleBar` offset to `top: insets.top + 82` when HUD is mounted.
- `StatusBanner` at `top: insets.top + 138` when HUD is mounted.
