# Arch Linux packaging (pacman repo)

## Repos

| Repo | Role |
|------|------|
| [`zync-sh/zync`](https://github.com/zync-sh/zync) | App source; builds `.pkg.tar.zst` in release CI |
| [`zync-sh/zync-arch`](https://github.com/zync-sh/zync-arch) | Public pacman repo (GitHub Pages) |

## What CI produces

1. In **`zync` release**: `zync-<version>-1-x86_64.pkg.tar.zst` (from the `.deb`)
2. Job **`pacman-repo`**:
   - Imports `GPG_PRIVATE_KEY` (same identity as APT: `releases@zync.thesudoer.in`)
   - Detach-signs packages + DB
   - Writes `key.gpg` for users
   - Pushes to **`zync-arch`** `gh-pages`

Layout:

```text
CNAME
key.gpg
x86_64/
  zync-<ver>-1-x86_64.pkg.tar.zst
  zync-<ver>-1-x86_64.pkg.tar.zst.sig
  zync.db.tar.zst
  zync.db.tar.zst.sig
  …
```

## User install

```bash
curl -fsSL https://arch.zync.thesudoer.in/key.gpg -o /tmp/zync.gpg
sudo pacman-key --add /tmp/zync.gpg
FPR="$(gpg --show-keys --with-colons /tmp/zync.gpg 2>/dev/null | awk -F: '/^fpr:/ { print $10; exit }')"
sudo pacman-key --lsign-key "$FPR"

sudo tee /etc/pacman.d/zync.conf >/dev/null <<'EOF'
[zync]
SigLevel = Required TrustedOnly
Server = https://arch.zync.thesudoer.in/$arch
EOF

grep -q 'pacman.d/zync.conf' /etc/pacman.conf || \
  echo 'Include = /etc/pacman.d/zync.conf' | sudo tee -a /etc/pacman.conf

sudo pacman -Syu zync
```

## Operator checklist

1. Bootstrap `gh-pages` — [`zync-arch/docs/PAGES.md`](https://github.com/zync-sh/zync-arch/blob/main/docs/PAGES.md)
2. Pages domain: `arch.zync.thesudoer.in`
3. Secrets on `zync`: `RELEASE_TOKEN` (push to zync-arch), `GPG_PRIVATE_KEY` (signing)
4. Package uses system WebKit (`webkit2gtk-4.1`)

## Scripts

- `scripts/ci/build-arch-pkg.sh` — build `.pkg.tar.zst` from `.deb`
- `scripts/ci/publish-arch-repo.sh` — sign + `repo-add` + `key.gpg`
