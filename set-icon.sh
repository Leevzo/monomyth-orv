#!/bin/zsh
# Set Orv's Home Screen icon to the King's own PNG, byte for byte (a true PNG: never re-encoded, never resized here;
# the phone does its own scaling). Default source: the drop slot in the Drive.
#   bash ~/Code/monomyth-orv-pages/set-icon.sh [path/to/your.png]
set -e
SRC="${1:-$HOME/Library/CloudStorage/GoogleDrive-levi@outlandish.media/My Drive/Monomyth/Brand/icons/ORV-APP-ICON.png}"
V="$HOME/Code/monomyth-orv-pages"
[[ -f "$SRC" ]] || { echo "No PNG at: $SRC"; exit 1; }
file -b "$SRC" | grep -q '^PNG image data' || { echo "That file is not a PNG: $SRC"; exit 1; }
WH=$(file -b "$SRC" | sed -E 's/^PNG image data, ([0-9]+) x ([0-9]+).*/\1x\2/')
cd "$V"; git pull -q
cp "$SRC" icon.png
/usr/bin/python3 - "$WH" <<'PY'
import json, sys
m = json.load(open('ink.webmanifest'))
m['icons'] = [{'src': 'icon.png', 'sizes': sys.argv[1], 'type': 'image/png', 'purpose': 'any'}]
json.dump(m, open('ink.webmanifest', 'w'), indent=1)
PY
git add icon.png ink.webmanifest
git -c user.name="Leevzo" -c user.email="levi@outlandish.media" commit -q -m "Orv's icon: the King's PNG, byte for byte ($WH)" || { echo "Same icon as before; nothing to ship."; exit 0; }
git push -q
echo "Shipped. In a minute: delete the Orv icon on your Home Screen and add it again from Safari."
