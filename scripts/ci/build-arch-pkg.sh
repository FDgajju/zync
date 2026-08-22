#!/usr/bin/env bash
# Build an Arch .pkg.tar.zst from the release .deb using an Arch container.
# Downloads the .deb with authenticated `gh` (draft release assets are not public).
set -euo pipefail

TAG="${1:?usage: build-arch-pkg.sh <tag> [out-dir]}"
OUT_DIR="${2:-$PWD/arch-dist}"
VERSION="${TAG#v}"
REPO="${GITHUB_REPOSITORY:-zync-sh/zync}"
DEB_NAME="zync_${VERSION}_amd64.deb"

mkdir -p "$OUT_DIR"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="$(mktemp -d)"
cleanup() {
  # Docker may leave root-owned files; best-effort cleanup.
  rm -rf "$STAGE" 2>/dev/null || sudo rm -rf "$STAGE" 2>/dev/null || true
}
trap cleanup EXIT

cp "$ROOT/packaging/arch/PKGBUILD.in" "$STAGE/PKGBUILD"
sed -i "s|@VERSION@|${VERSION}|g" "$STAGE/PKGBUILD"

echo "==> Downloading $DEB_NAME from $REPO $TAG (authenticated)"
gh release download "$TAG" \
  -p "$DEB_NAME" \
  -R "$REPO" \
  -D "$STAGE"

echo "==> Building Arch package for $TAG from local $DEB_NAME"
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
    # --nodeps: runtime depends are for end-user Arch machines, not this container.
    su - builder -c "cd /work && makepkg -f -d --skipchecksums --noconfirm"
    cp -v /work/*.pkg.tar.zst /out/
    chown -R '"$(id -u):$(id -g)"' /out /work || true
  '

echo "==> Packages in $OUT_DIR"
ls -la "$OUT_DIR"/*.pkg.tar.zst
