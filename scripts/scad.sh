#!/usr/bin/env bash
# Usage: scripts/scad.sh [fan_size] [openscad -D overrides...]   fan template + grille
#        scripts/scad.sh case [openscad -D overrides...]       HTU21D sensor case
# Exports STL into hw/stl/ (ignored by git).
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

defs=()

if [[ "${1:-}" == "case" ]]; then
  shift
  for d in "$@"; do defs+=(-D "$d"); done
  mkdir -p stl
  "$openscad" -o stl/htu21d_case.stl ${defs[@]+"${defs[@]}"} htu21d_case.scad
  echo "-> hw/stl/htu21d_case.stl"
  exit 0
fi

size="${1:-120}"
[[ $# -gt 0 ]] && shift
if ! [[ "$size" =~ ^[0-9]+$ ]]; then
  echo "fan_size must be a number (40, 60, 80, 92, 120, 140 or 0 for custom)" >&2
  exit 2
fi

for d in "$@"; do defs+=(-D "$d"); done

mkdir -p stl
for part in template grille; do
  out="stl/fan_${size}_${part}.stl"
  "$openscad" -o "$out" -D "fan_size=$size" -D "part=\"$part\"" ${defs[@]+"${defs[@]}"} fan_grille.scad
  echo "-> hw/$out"
done
