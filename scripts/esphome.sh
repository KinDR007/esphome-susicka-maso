#!/usr/bin/env bash
# Usage: scripts/esphome.sh <config|compile|run|logs> [local|remote] [esphome args...]
# local  = esphome/susicka-maso-local.yaml (packages from working tree, default)
# remote = esphome/susicka-maso.yaml       (packages from GitHub)
set -euo pipefail

cd "$(dirname "$0")/../esphome"

cmd="${1:-}"
variant="${2:-local}"
case "$cmd" in
  config|compile|run|logs|upload|clean) ;;
  *) echo "usage: $0 <config|compile|run|upload|logs|clean> [local|remote] [args...]" >&2; exit 2 ;;
esac
case "$variant" in
  local)  file=susicka-maso-local.yaml ;;
  remote) file=susicka-maso.yaml ;;
  *) echo "unknown variant: $variant (local|remote)" >&2; exit 2 ;;
esac
shift $(( $# >= 2 ? 2 : 1 ))

if [[ ! -f secrets.yaml ]]; then
  echo "esphome/secrets.yaml missing, copy secrets.yaml.example and fill it in" >&2
  exit 1
fi

# ESP-IDF refuses to build in paths containing whitespace
if [[ "$PWD" == *" "* && -z "${ESPHOME_DATA_DIR:-}" ]]; then
  export ESPHOME_DATA_DIR="$HOME/.cache/esphome-susicka-maso"
fi

exec esphome "$cmd" "$file" "$@"
