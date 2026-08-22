#!/usr/bin/env bash
# Sign Arch packages with the APT packaging key, rebuild the pacman DB,
# sign the DB on the host, and write key.gpg for pacman-key --add.
#
# Usage: publish-arch-repo.sh <pages-dir> <pkg-dir>
# Env: ZYNC_GPG_UID (default releases@zync.thesudoer.in)
# Requires: gpg private key already imported on the runner.
set -euo pipefail

PAGES_DIR="${1:?usage: publish-arch-repo.sh <pages-dir> <pkg-dir>}"
PKG_DIR="${2:?}"
SIGN_UID="${ZYNC_GPG_UID:-releases@zync.thesudoer.in}"

if [[ ! -d "$PKG_DIR" ]] || ! compgen -G "$PKG_DIR"/zync-*.pkg.tar.zst >/dev/null; then
  echo "error: no zync-*.pkg.tar.zst in $PKG_DIR" >&2
  exit 1
fi

mkdir -p "$PAGES_DIR/x86_64"
echo 'arch.zync.thesudoer.in' > "$PAGES_DIR/CNAME"

gpg --armor --export "$SIGN_UID" > "$PAGES_DIR/key.gpg"
echo "==> Wrote $PAGES_DIR/key.gpg"
gpg --show-keys --with-fingerprint "$PAGES_DIR/key.gpg" || true

rm -f "$PAGES_DIR"/x86_64/zync-*.pkg.tar.zst \
  "$PAGES_DIR"/x86_64/zync-*.pkg.tar.zst.sig \
  "$PAGES_DIR"/x86_64/zync.db* \
  "$PAGES_DIR"/x86_64/zync.files* \
  "$PAGES_DIR"/x86_64/.gitkeep

cp "$PKG_DIR"/zync-*.pkg.tar.zst "$PAGES_DIR/x86_64/"

echo "==> Detach-signing packages as $SIGN_UID"
(
  cd "$PAGES_DIR/x86_64"
  for pkg in zync-*.pkg.tar.zst; do
    gpg --batch --yes --pinentry-mode loopback \
      --detach-sign --local-user "$SIGN_UID" "$pkg"
  done
)

echo "==> repo-add (unsigned DB; signed on host next)"
docker run --rm \
  -v "$PAGES_DIR/x86_64:/repo" \
  -w /repo \
  archlinux:latest \
  bash -lc '
    set -euo pipefail
    pacman -Syu --noconfirm
    repo-add -n zync.db.tar.zst *.pkg.tar.zst
    ls -la
  '

echo "==> Detach-signing pacman database"
(
  cd "$PAGES_DIR/x86_64"
  for db in zync.db.tar.zst zync.files.tar.zst; do
    if [[ -f "$db" ]]; then
      gpg --batch --yes --pinentry-mode loopback \
        --detach-sign --local-user "$SIGN_UID" "$db"
    fi
  done
  # pacman fetches repo.db.sig (not only repo.db.tar.zst.sig)
  [[ -f zync.db.tar.zst.sig ]] && cp -f zync.db.tar.zst.sig zync.db.sig
  [[ -f zync.files.tar.zst.sig ]] && cp -f zync.files.tar.zst.sig zync.files.sig
  ls -la
)

echo "==> Arch repo ready under $PAGES_DIR"
