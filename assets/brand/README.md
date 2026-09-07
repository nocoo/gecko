# Gecko brand assets

A warm place to pause. The exact existing transparent source bytes and native canvas are retained. No image-generation request was made; the before/after foregrounds deliberately match.

## Use by surface

| Surface | Asset | Treatment |
| --- | --- | --- |
| README / large gallery | `assets/brand/icon-rounded.png` | Selected rounded presentation at 128 px in README |
| Web sidebar and loading | `apps/web-dashboard/public/logo-{24,80}.png` | Transparent retained foreground |
| Web browser | `apps/web-dashboard/src/app/icon.png and favicon.ico` | Transparent 32 px PNG and 16/32/48 ICO via Next metadata |
| Apple touch / social | `apps/web-dashboard/src/app/apple-icon.png and opengraph-image.png` | Square 180 px touch; rounded tile on existing 1200 × 630 social canvas |
| Native app icon | `apps/mac-client/Gecko/Resources/Assets.xcassets/AppIcon.appiconset` | Ten images from the separate inset native canvas |
| Native About view | `GeckoLogo.imageset/gecko_logo{,@2x,@3x}.png` | Rounded presentation at 128/256/384 px; extra SwiftUI crop removed |
| Menu-bar templates | `MenuBarIcon.imageset` | Exact existing templates retained with the unchanged animal |

Root `logo.png` is the canonical 2048 × 2048 transparent foreground. `assets/brand/icon.png` and `icon-rounded.png` preserve the independent square and rounded presentation. Small UI and browser marks use the foreground with its original proportions and alpha, without a background tile, glow, color filter or additional mask. Native app and touch icons follow their platform's separate masking contract.

## Rebuild and evidence

```sh
uv run --with pillow python scripts/resize-logos.py
```

Selected study `2026-09-07-01`, finishing `01`. Existing native margins are preserved exactly (114.5 px nearest rounded-outline clearance; no clipping). They are not retroactively changed to meet a new-drawing inset.

The presentation uses **Sandstone shelves**, with base `#926d60`, light `#d4ad8b`, shade `#654842` and motif `#49312e`. Geometry, fine grain and shallow shadows remain separate from the foreground; product UI colors remain independent. [source.json](source.json) records exact master checksums and the previous identity.

- [Individual before/after page](https://hexly.ai/logos/gecko)
- [Complete artwork and finishing archive](https://github.com/nocoo/hexly.ai/tree/main/artwork/logo-family/gecko/2026-09-07-01)
- [Local static review](https://index.dev.hexly.ai/artwork/logo-family/gecko/2026-09-07-01/review.html)
- [Shared usage SOP](https://github.com/nocoo/hexly.ai/blob/main/docs/07-logo-usage-sop.md)
