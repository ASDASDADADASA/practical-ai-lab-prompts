# Gate Sync QA fixes · 2026-10-31 Asia/Shanghai

Shippable pass after playtest. Files touched: `js/game.js`, `index.html`, `howto.html`, this note.

## 1. Far-rail unfair

**Was:** Rails only cycled forward. On 3 rails a far neighbor needed two taps; several L2/L3 gaps were ~140px (~460–530ms).

**Fix:**
- Bidirectional switch: pointer on left half of canvas → previous rail; right half → next rail. Space / Right Arrow still cycle forward; Left Arrow cycles back.
- Re-spaced L2/L3 so every 2-forward-rail jump after a wall/gate is ≥ `speed * 0.75` px (≥750ms). L2 gaps for those beats ≥240px @ 264px/s; L3 ≥260px @ ~304px/s.

## 2. Twin lock trap

**Was:** Optional lock tap inside the twin window; a mistimed tap kicked you off the correct rail. Window was 0.45s; third twin hint started on the nearby wall.

**Fix:**
- Removed lock-tap entirely. Twin success = being on the correct rail at hit.
- `twinWindow` raised to **0.9s**. Hint text is the target color, e.g. `Aim AMBER`.
- Amber window bar shrinks as time runs out.
- Third twin placed so hint starts before the nearby wall (hint ~2467, wall 2500, twin 2740).

## 3. WALL contrast

**Was:** `COLORS.wall` `#3a3f4b` blended into the dark track.

**Fix:**
- Wall fill `#e8edf7`, dark `#1a1f2a` label, thick `#f4a261` stroke.
- Safe-gap dash/label brightened (`rgba(255,255,255,0.45)` / `rgba(232,237,247,0.85)`).
- Inactive rail stroke brightened to `#2a3344`.

## 4. Stars lie

**Was:** HUD showed `★ ★ ★` whenever `levelIndex === 2`, including mid-run before clear. Replay did not clear stars.

**Fix:**
- `updateHUD` only shows stars when `stars > 0` (set on L3 clear only).
- `stars = 0` on Replay (allclear → L1) and at bind / L1 restart.
- Clear / allclear overlays still report earned stars after L3.

## 5. Sound tip under overlay

**Was:** “Tap to enable sound” chip sat under the start overlay (lower z / covered), easy to miss.

**Fix:**
- Standalone tip chip stays `hidden`; audio unlocks on **Play**.
- Start overlay subtext: “Sound unlocks on Play.”
- howto / FAQ updated to match (no tip chip instruction).

## Also

- howto Controls + Level 3 + Sound sections updated for left/right tap and no lock-tap.
- Abstract visuals only; no Pulse Lane naming; zero cash; no external assets.
