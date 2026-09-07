#!/usr/bin/env python3
"""Generate retained web foregrounds and separate web/native presentations.

The existing monochrome menu-bar templates retain their exact bytes.
"""

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "apps/web-dashboard"
PUBLIC = WEB / "public"
APP = WEB / "src/app"
MAC = ROOT / "apps/mac-client/Gecko/Resources/Assets.xcassets"


def main():
    foreground = Image.open(ROOT / "logo.png").convert("RGBA")
    square = Image.open(ROOT / "assets/brand/icon.png").convert("RGBA")
    rounded = Image.open(ROOT / "assets/brand/icon-rounded.png").convert("RGBA")
    for size in (24, 80):
        foreground.resize((size, size), Image.Resampling.LANCZOS).save(PUBLIC / f"logo-{size}.png")
    foreground.resize((32, 32), Image.Resampling.LANCZOS).save(APP / "icon.png")
    foreground.save(APP / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    square.resize((180, 180), Image.Resampling.LANCZOS).convert("RGB").save(APP / "apple-icon.png")
    social = Image.new("RGB", (1200, 630), (232, 241, 235))
    mark = rounded.resize((252, 252), Image.Resampling.LANCZOS)
    social.paste(mark, (474, 189), mark)
    social.save(APP / "opengraph-image.png")

    native = Image.new("RGBA", (1024, 1024))
    native.alpha_composite(rounded.resize((824, 824), Image.Resampling.LANCZOS), (100, 100))
    native.save(ROOT / "assets/brand/app-icon-macos.png")
    catalog = MAC / "AppIcon.appiconset"
    for entry in json.loads((catalog / "Contents.json").read_text())["images"]:
        size = int(entry["size"].split("x")[0]) * int(entry["scale"][0])
        native.resize((size, size), Image.Resampling.LANCZOS).save(catalog / entry["filename"])
    for filename, size in [("gecko_logo.png", 128), ("gecko_logo@2x.png", 256), ("gecko_logo@3x.png", 384)]:
        rounded.resize((size, size), Image.Resampling.LANCZOS).save(MAC / "GeckoLogo.imageset" / filename)
    print("Generated transparent web marks and web/native presentations; menu templates retained.")


if __name__ == "__main__":
    main()
