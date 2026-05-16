#!/usr/bin/env bash
#
# provision-orcaslicer.sh — download and extract a local OrcaSlicer runtime so
# the API / CLI can slice without a system-wide OrcaSlicer install.
#
# It downloads the OrcaSlicer AppImage for the host architecture, extracts the
# embedded squashfs payload (no FUSE / no root required) and writes a launcher
# script. Point ORCASLICER_PATH at that launcher.
#
#   ./scripts/provision-orcaslicer.sh [--version X.Y.Z] [--dir <path>]
#
# Defaults: version 2.3.1, directory ./.orca-runtime
#
# NOTE: the AppImage is built against a recent glibc (Ubuntu 24.04, glibc
# 2.39+). On older hosts run the slicer via the provided Dockerfile instead —
# see docs/TROUBLESHOOTING.md.

set -euo pipefail

VERSION="2.3.1"
RUNTIME_DIR=".orca-runtime"

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --dir)     RUNTIME_DIR="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -n 16
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64)
    URL="https://github.com/SoftFever/OrcaSlicer/releases/download/v${VERSION}/OrcaSlicer_Linux_AppImage_Ubuntu2404_V${VERSION}.AppImage" ;;
  aarch64|arm64)
    # Community ARM64 builds (the official project ships x86_64 only).
    URL="https://github.com/kldzj/orca-slicer-arm64/releases/download/v${VERSION}-arm64/OrcaSlicer-${VERSION}-arm64-linux.AppImage" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

mkdir -p "$RUNTIME_DIR"
cd "$RUNTIME_DIR"

echo "[provision] OrcaSlicer v${VERSION} for ${ARCH}"
echo "[provision] downloading $URL"
curl -fSL -o orca.AppImage "$URL"

SIZE=$(stat -c%s orca.AppImage 2>/dev/null || stat -f%z orca.AppImage)
[ "$SIZE" -gt 50000000 ] || { echo "[provision] download too small ($SIZE bytes)"; exit 1; }

# Extract the squashfs payload at its byte offset (parsed from the ELF header)
# so we never have to execute the AppImage runtime — works without FUSE.
echo "[provision] extracting squashfs payload"
OFFSET=$(python3 -c "import struct; d=open('orca.AppImage','rb').read(8192); assert d[:4]==b'\x7fELF'; print(struct.unpack('<Q',d[40:48])[0] + struct.unpack('<H',d[58:60])[0]*struct.unpack('<H',d[60:62])[0])")
rm -rf squashfs-root
unsquashfs -q -d squashfs-root -o "$OFFSET" orca.AppImage >/dev/null
rm -f orca.AppImage
test -x squashfs-root/AppRun || { echo "[provision] extraction failed"; exit 1; }

# Launcher: a thin wrapper so ORCASLICER_PATH can be a stable path.
cat > orca <<'LAUNCHER'
#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
export LC_ALL=C
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-$(mktemp -d /tmp/orca-xdg.XXXXXX)}"
exec "$DIR/squashfs-root/AppRun" "$@"
LAUNCHER
chmod +x orca

echo "[provision] done — runtime at $(pwd)"
echo "[provision] set ORCASLICER_PATH=$(pwd)/orca in your .env"
if ./orca --help >/dev/null 2>&1; then
  echo "[provision] OK — OrcaSlicer launches headlessly"
else
  echo "[provision] WARNING: the binary did not launch — likely a glibc"
  echo "[provision] mismatch on this host. Use the Dockerfile instead;"
  echo "[provision] see docs/TROUBLESHOOTING.md."
fi
