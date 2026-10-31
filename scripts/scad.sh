#!/usr/bin/env bash
# Usage: scripts/scad.sh [fan_size] [openscad -D overrides...]
# Exports template and grille STL into hw/stl/ (ignored by git).
set -euo pipefail

cd "$(dirname "$0")/../hw"

openscad="${OPENSCAD:-}"
if [[ -z "$openscad" ]]; then
  if command -v openscad >/dev/null; then
    openscad=openscad
  elif [[ -x /Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD ]]; then
    openscad=/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD
  else
    echo "OpenSCAD not found, set OPENSCAD=/path/to/openscad" >&2
    exit 1
  fi
fi

size="${1:-120}"
[[ $# -gt 0 ]] && shift
if ! [[ "$size" =~ ^[0-9]+$ ]]; then
  echo "fan_size must be a number (40, 60, 80, 92, 120, 140 or 0 for custom)" >&2
  exit 2
fi

defs=()
for d in "$@"; do defs+=(-D "$d"); done

mkdir -p stl
for part in template grille; do
  out="stl/fan_${size}_${part}.stl"
  "$openscad" -o "$out" -D "fan_size=$size" -D "part=\"$part\"" ${defs[@]+"${defs[@]}"} fan_grille.scad
  echo "-> hw/$out"
done
