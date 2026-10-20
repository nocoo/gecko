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

if [ -e "$BUILD_DIR/$DMG_NAME" ]; then
  echo "ERROR: $BUILD_DIR/$DMG_NAME already exists; refusing to overwrite a release artifact"
  exit 1
fi

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
APP_PATH="$BUILD_DIR/derived/Build/Products/${CONFIGURATION}/${APP_NAME}.app"
if [ ! -d "$APP_PATH" ]; then
  echo "ERROR: ${APP_NAME}.app not found in build products"
  exit 1
fi
echo "==> App found: $APP_PATH"

APP_VERSION=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Contents/Info.plist")
if [ "$APP_VERSION" != "$VERSION" ]; then
  echo "ERROR: Built app version $APP_VERSION does not match $VERSION"
  exit 1
fi
codesign --verify --deep --strict "$APP_PATH"

STAGING_DIR=$(mktemp -d "$BUILD_DIR/dmg-${VERSION}.XXXXXX")
ditto "$APP_PATH" "$STAGING_DIR/$APP_NAME.app"
ln -s /Applications "$STAGING_DIR/Applications"

echo "==> Creating DMG without mounting a temporary volume..."
hdiutil create -volname "$APP_NAME" -srcfolder "$STAGING_DIR" -format UDZO "$BUILD_DIR/$DMG_NAME"
hdiutil verify "$BUILD_DIR/$DMG_NAME"

echo ""
echo "==> DMG created: $BUILD_DIR/$DMG_NAME"
echo "    Size: $(du -h "$BUILD_DIR/$DMG_NAME" | cut -f1)"
echo "    Staging retained: $STAGING_DIR"
echo ""
echo "Done!"
