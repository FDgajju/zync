#!/usr/bin/env bash
# Patch latest.json linux AppImage signature fields after re-signing.
set -euo pipefail

LATEST_JSON="${1:?usage: update-latest-json-appimage-sig.sh <latest.json> <AppImage.sig>}"
SIG_FILE="${2:?}"

if [[ ! -f "$LATEST_JSON" || ! -f "$SIG_FILE" ]]; then
  echo "error: missing latest.json or .sig" >&2
  exit 1
fi

python3 - "$LATEST_JSON" "$SIG_FILE" <<'PY'
import json, sys
path, sig_path = sys.argv[1], sys.argv[2]
with open(sig_path, "r", encoding="utf-8") as f:
    signature = f.read().strip()
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)
platforms = data.setdefault("platforms", {})
for key in ("linux-x86_64", "linux-x86_64-appimage"):
    if key in platforms and isinstance(platforms[key], dict):
        platforms[key]["signature"] = signature
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
print(f"updated signatures for linux AppImage keys in {path}")
PY
