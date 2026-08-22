# tools/

Not part of the app. Nothing here is linked from `index.html` or precached by
`sw.js` — these are verification harnesses, served only if you open them directly.

## mood-measure.html

Rasterises each `moods/*.svg` in a real browser and composites it over the real
page base at the real layer opacity, then checks three invariants that are easy
to break and impossible to eyeball reliably:

- **Earn order** — every unlock must be a step up. Measured on *effective* alpha
  (raw SVG density × the per-mood `k` in `MOODS`), because that is what reaches
  the eye. Two unlocks were downgrades before `k` existed.
- **Card elevation** — the page behind the card band must stay darker than the
  opaque `--surface-1` cards (L* 7.4), or cards invert into holes.
- **Warmth** — a warm mood must read warm, via a *chroma-weighted circular* hue
  mean. A linear hue mean is worse than useless here: violet + gold averages to
  green, a colour that appears nowhere in the art.

Two constants are hand-mirrored from `index.html` and will silently rot if only
one side changes: `MK` (must match `MOODS[].k`) and `MASK` (must match the
`mask-image` stops on `#moodLayer::before`).

`?k=` overrides the layer opacity; the default 0.308 is deep flow.
`window.__sweep([...])` sweeps candidate mask falloffs and reports the
worst-case card-band L* each produces — how the shipped stops were chosen.

## mood-sixup.html

Visual proof. Replicates the real `#moodLayer` stack — gradients plus the masked
art layer — for all six moods, with opaque cards sitting in the card band so
elevation is visible. `?m=` sets momentum (`?m=8` vs `?m=100` is the
"does this look identical at 8 and 88" check).
