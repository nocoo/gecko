#!/usr/bin/env bash
set -euo pipefail

# build-dmg.sh — Build a release .dmg for Gecko
# Usage: ./scripts/build-dmg.sh [--skip-build]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MAC_CLIENT_DIR="$PROJECT_ROOT/apps/mac-client"
XCODEPROJ="$MAC_CLIENT_DIR/Gecko.xcodeproj"
BUILD_DIR="$PROJECT_ROOT/build"
APP_NAME="Gecko"
SCHEME="Gecko"
CONFIGURATION="Release"

# Read version from root package.json
VERSION=$(python3 -c "import json; print(json.load(open('$PROJECT_ROOT/package.json'))['version'])")
DMG_NAME="${APP_NAME}-${VERSION}.dmg"

SKIP_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

echo "==> Gecko DMG Builder v${VERSION}"
echo "    Build dir: $BUILD_DIR"

# Ensure create-dmg is installed
if ! command -v create-dmg &>/dev/null; then
  echo "ERROR: create-dmg not found. Install with: brew install create-dmg"
  exit 1
fi

# Clean build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

if [ "$SKIP_BUILD" = false ]; then
  echo "==> Building ${APP_NAME} (${CONFIGURATION})..."
  xcodebuild build \
    -project "$XCODEPROJ" \
    -scheme "$SCHEME" \
    -configuration "$CONFIGURATION" \
    -derivedDataPath "$BUILD_DIR/derived" \
    -destination 'platform=macOS' \
    ONLY_ACTIVE_ARCH=NO \
    2>&1 | tail -20

  echo "==> Build succeeded"
fi

# Locate the built .app
APP_PATH=$(find "$BUILD_DIR/derived/Build/Products/${CONFIGURATION}" -name "${APP_NAME}.app" -maxdepth 1 2>/dev/null | head -1)
if [ -z "$APP_PATH" ]; then
  echo "ERROR: ${APP_NAME}.app not found in build products"
  exit 1
fi
echo "==> App found: $APP_PATH"

# Remove any previous DMG
rm -f "$BUILD_DIR/$DMG_NAME"

echo "==> Creating DMG..."
create-dmg \
  --volname "$APP_NAME" \
  --volicon "$MAC_CLIENT_DIR/Gecko/Resources/Assets.xcassets/AppIcon.appiconset/icon_512x512@2x.png" \
  --window-pos 200 120 \
  --window-size 600 400 \
  --icon-size 128 \
  --icon "$APP_NAME.app" 150 190 \
  --app-drop-link 450 190 \
  --no-internet-enable \
  "$BUILD_DIR/$DMG_NAME" \
  "$APP_PATH"

echo ""
echo "==> DMG created: $BUILD_DIR/$DMG_NAME"
echo "    Size: $(du -h "$BUILD_DIR/$DMG_NAME" | cut -f1)"
echo ""
echo "Done!"
