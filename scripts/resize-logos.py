#!/usr/bin/env python3
"""
resize-logos.py — Generate all derived logo assets from the master logo.png.

Single-source pattern: ONE master logo.png (2048x2048 RGBA) at project root.
Run this script after changing the master logo.

Usage:
    python3 scripts/resize-logos.py

Outputs:
    1. public/         — Basalt B-3 standard sizes (logo-24.png, logo-80.png)
    2. src/app/        — Next.js file-based metadata (icon.png, apple-icon.png,
                         favicon.ico, opengraph-image.png)
    3. mac-client/     — Xcode asset catalog images (AppIcon, GeckoLogo, MenuBarIcon)

Requires: Pillow (`pip install Pillow`)
"""

from pathlib import Path
from PIL import Image

# ── Paths ──

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "logo.png"
WEB = ROOT / "apps" / "web-dashboard"
PUBLIC = WEB / "public"
APP = WEB / "src" / "app"
MAC_ASSETS = ROOT / "apps" / "mac-client" / "Gecko" / "Resources" / "Assets.xcassets"

# ── Brand colors (from globals.css) ──

# Light background: hsl(140, 14%, 94%) ≈ RGB(232, 241, 235)
OG_BG_COLOR = (232, 241, 235)


def resize(img: Image.Image, size: int) -> Image.Image:
    """Resize to square with LANCZOS resampling."""
    return img.resize((size, size), Image.LANCZOS)


def generate_web_public(img: Image.Image) -> None:
    """Generate public/ assets — standard Basalt B-3 sizes."""
    print("── public/ assets ──")
    targets = {
        "logo-24.png": 24,
        "logo-80.png": 80,
    }
    for name, size in targets.items():
        out = PUBLIC / name
        resize(img, size).save(out, "PNG", optimize=True)
        print(f"  {out.relative_to(ROOT)}  ({size}x{size})")


def generate_web_metadata(img: Image.Image) -> None:
    """Generate src/app/ metadata assets (Next.js file-based convention)."""
    print("── src/app/ metadata ──")

    # icon.png — 32x32 (browser favicon)
    icon = resize(img, 32)
    out = APP / "icon.png"
    icon.save(out, "PNG", optimize=True)
    print(f"  {out.relative_to(ROOT)}  (32x32)")

    # apple-icon.png — 180x180
    apple = resize(img, 180)
    out = APP / "apple-icon.png"
    apple.save(out, "PNG", optimize=True)
    print(f"  {out.relative_to(ROOT)}  (180x180)")

    # favicon.ico — multi-size 16+32
    ico_16 = resize(img, 16)
    ico_32 = resize(img, 32)
    out = APP / "favicon.ico"
    ico_16.save(out, format="ICO", append_images=[ico_32], sizes=[(16, 16), (32, 32)])
    print(f"  {out.relative_to(ROOT)}  (16+32 multi-size)")

    # opengraph-image.png — 1200x630, logo centered on brand background
    og = Image.new("RGB", (1200, 630), OG_BG_COLOR)
    # Center logo at ~40% canvas height, sized to ~40% canvas height
    logo_size = int(630 * 0.4)  # 252px
    logo_resized = resize(img, logo_size)
    # Convert RGBA → paste with alpha mask onto RGB canvas
    x = (1200 - logo_size) // 2
    y = int(630 * 0.3)  # ~30% from top for visual center
    og.paste(logo_resized, (x, y), logo_resized)  # 3rd arg = alpha mask
    out = APP / "opengraph-image.png"
    og.save(out, "PNG", optimize=True)
    print(f"  {out.relative_to(ROOT)}  (1200x630)")


def generate_mac_appicon(img: Image.Image) -> None:
    """Generate macOS AppIcon.appiconset images."""
    appicon_dir = MAC_ASSETS / "AppIcon.appiconset"
    if not appicon_dir.exists():
        print(f"  ⚠ Skipping AppIcon — {appicon_dir} not found")
        return

    print("── mac AppIcon ──")
    # macOS icon sizes: 16, 32, 128, 256, 512 at 1x and 2x
    sizes = [16, 32, 128, 256, 512]
    for size in sizes:
        # @1x
        out = appicon_dir / f"icon_{size}x{size}.png"
        resize(img, size).save(out, "PNG", optimize=True)
        print(f"  {out.relative_to(ROOT)}  ({size}x{size})")

        # @2x
        out2x = appicon_dir / f"icon_{size}x{size}@2x.png"
        resize(img, size * 2).save(out2x, "PNG", optimize=True)
        print(f"  {out2x.relative_to(ROOT)}  ({size * 2}x{size * 2})")


def generate_mac_gecko_logo(img: Image.Image) -> None:
    """Generate GeckoLogo.imageset (About view)."""
    logo_dir = MAC_ASSETS / "GeckoLogo.imageset"
    if not logo_dir.exists():
        print(f"  ⚠ Skipping GeckoLogo — {logo_dir} not found")
        return

    print("── mac GeckoLogo ──")
    # Base size 128, @2x=256, @3x=384
    scales = {"gecko_logo.png": 128, "gecko_logo@2x.png": 256, "gecko_logo@3x.png": 384}
    for name, size in scales.items():
        out = logo_dir / name
        resize(img, size).save(out, "PNG", optimize=True)
        print(f"  {out.relative_to(ROOT)}  ({size}x{size})")


def generate_mac_menubar(img: Image.Image) -> None:
    """Generate MenuBarIcon.imageset — skipped, requires separate template asset."""
    # Menu bar icons are typically monochrome template images, not derived from
    # the full-color master logo. Skip automatic generation.
    print("── mac MenuBarIcon ──")
    print("  ⏭ Skipped (template icon — requires separate monochrome source)")


def clean_old_public_favicons() -> None:
    """Remove old favicon PNGs from public/ that are now in src/app/."""
    print("── cleanup ──")
    old_files = ["favicon-16.png", "favicon-32.png", "apple-touch-icon.png"]
    for name in old_files:
        f = PUBLIC / name
        if f.exists():
            f.unlink()
            print(f"  Removed {f.relative_to(ROOT)}")


def main() -> None:
    if not MASTER.exists():
        print(f"ERROR: Master logo not found at {MASTER}")
        raise SystemExit(1)

    img = Image.open(MASTER)
    print(f"Master logo: {img.size[0]}x{img.size[1]} {img.mode}")
    print()

    generate_web_public(img)
    print()
    generate_web_metadata(img)
    print()
    generate_mac_appicon(img)
    print()
    generate_mac_gecko_logo(img)
    print()
    generate_mac_menubar(img)
    print()
    clean_old_public_favicons()
    print()
    print("✓ All assets generated from master logo.png")


if __name__ == "__main__":
    main()
