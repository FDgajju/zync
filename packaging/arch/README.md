# Arch Linux packaging (pacman repo)

## Repos

| Repo | Role |
|------|------|
| [`zync-sh/zync`](https://github.com/zync-sh/zync) | App source; builds `.pkg.tar.zst` in release CI |
| [`zync-sh/zync-arch`](https://github.com/zync-sh/zync-arch) | Public pacman repo (GitHub Pages) |

## What CI produces

1. In **`zync` release**: `zync-<version>-1-x86_64.pkg.tar.zst` (from the `.deb`)
2. Job **`pacman-repo`** pushes into **`zync-arch`** branch **`gh-pages`**:
   - `CNAME` → `arch.zync.thesudoer.in`
   - `x86_64/*.pkg.tar.zst`
   - `x86_64/zync.db*` / `zync.files*`

Public URL:

```text
https://arch.zync.thesudoer.in/x86_64/
```

## User install

```bash
sudo tee /etc/pacman.d/zync.conf >/dev/null <<'EOF'
[zync]
SigLevel = Optional TrustAll
Server = https://arch.zync.thesudoer.in/$arch
EOF

grep -q 'pacman.d/zync.conf' /etc/pacman.conf || \
  echo 'Include = /etc/pacman.d/zync.conf' | sudo tee -a /etc/pacman.conf

sudo pacman -Syu zync
```

**Upgrade:** `sudo pacman -Syu`  
**Remove:** `sudo pacman -R zync`

Updates go through pacman, not the in-app Tauri updater.

## Operator checklist

1. Bootstrap `gh-pages` once — see [`zync-arch/docs/PAGES.md`](https://github.com/zync-sh/zync-arch/blob/main/docs/PAGES.md)
2. Pages custom domain: `arch.zync.thesudoer.in`
3. DNS: `CNAME arch` → `gajendraxdev.github.io`
4. `RELEASE_TOKEN` in `zync` must be able to **push** to `zync-arch`
5. Package uses system WebKit (`webkit2gtk-4.1`) — avoids AppImage Wayland/Mesa conflicts
6. Repo signing is currently `SigLevel = Optional TrustAll` (can add GPG later)

## PKGBUILD template

`packaging/arch/PKGBUILD.in` is filled by `scripts/ci/build-arch-pkg.sh` during release.
