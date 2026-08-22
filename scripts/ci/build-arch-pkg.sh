#!/usr/bin/env bash
# Build an Arch .pkg.tar.zst from a release .deb using an Arch container.
#
# Usage:
#   build-arch-pkg.sh <tag> [out-dir] [deb-dir]
#
# If deb-dir is provided (recommended; same pattern as apt-repo), use the local
# .deb there. Otherwise download with authenticated `gh` (requires GH_TOKEN).
# Draft release assets are not publicly curl-able.
set -euo pipefail

TAG="${1:?usage: build-arch-pkg.sh <tag> [out-dir] [deb-dir]}"
OUT_DIR="${2:-$PWD/arch-dist}"
DEB_DIR="${3:-}"
VERSION="${TAG#v}"
DEB_NAME="zync_${VERSION}_amd64.deb"

mkdir -p "$OUT_DIR"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="$(mktemp -d)"
cleanup() {
  rm -rf "$STAGE" 2>/dev/null || sudo rm -rf "$STAGE" 2>/dev/null || true
}
trap cleanup EXIT

cp "$ROOT/packaging/arch/PKGBUILD.in" "$STAGE/PKGBUILD"
sed -i "s|@VERSION@|${VERSION}|g" "$STAGE/PKGBUILD"

if [[ -n "$DEB_DIR" ]]; then
  if [[ ! -f "$DEB_DIR/$DEB_NAME" ]]; then
    echo "error: expected $DEB_DIR/$DEB_NAME" >&2
    ls -la "$DEB_DIR" >&2 || true
    exit 1
  fi
  echo "==> Using local $DEB_DIR/$DEB_NAME"
  cp "$DEB_DIR/$DEB_NAME" "$STAGE/"
else
  if [[ -z "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]]; then
    echo "error: GH_TOKEN (or GITHUB_TOKEN) is required to download draft release assets" >&2
    exit 1
  fi
  echo "==> Downloading $DEB_NAME from ${GITHUB_REPOSITORY:-zync-sh/zync} $TAG (authenticated)"
  # Match apt-repo: no -R needed when GITHUB_REPOSITORY is already the app repo.
  gh release download "$TAG" -p "$DEB_NAME" -D "$STAGE"
fi

echo "==> Building Arch package for $TAG"
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
