#!/usr/bin/env bash
# Build an Arch .pkg.tar.zst from the release .deb using an Arch container tooling.
# Intended to run on ubuntu-22.04 with Docker available (GitHub Actions).
set -euo pipefail

TAG="${1:?usage: build-arch-pkg.sh <tag> [out-dir]}"
OUT_DIR="${2:-$PWD/arch-dist}"
VERSION="${TAG#v}"
REPO="${GITHUB_REPOSITORY:-zync-sh/zync}"
DEB_URL="https://github.com/${REPO}/releases/download/${TAG}/zync_${VERSION}_amd64.deb"

mkdir -p "$OUT_DIR"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

cp "$ROOT/packaging/arch/PKGBUILD.in" "$STAGE/PKGBUILD"
sed -i "s|@VERSION@|${VERSION}|g" "$STAGE/PKGBUILD"
sed -i "s|@DEB_URL@|${DEB_URL}|g" "$STAGE/PKGBUILD"

echo "==> Building Arch package for $TAG from $DEB_URL"
docker run --rm \
  -v "$STAGE:/work" \
  -v "$OUT_DIR:/out" \
  -w /work \
  archlinux:latest \
  bash -lc '
    set -euo pipefail
    pacman -Syu --noconfirm
    pacman -S --noconfirm base-devel libarchive
    useradd -m builder
    chown -R builder:builder /work
    # --nodeps: runtime depends (webkit2gtk, gtk3, …) are for end-user Arch
    # machines, not this packaging container. We only repack the release .deb.
    su - builder -c "cd /work && makepkg -f -d --skipchecksums --noconfirm"
    cp -v /work/*.pkg.tar.zst /out/
  '

echo "==> Packages in $OUT_DIR"
ls -la "$OUT_DIR"/*.pkg.tar.zst
