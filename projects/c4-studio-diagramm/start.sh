#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
for dependency in python3 java dot; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "Fehlende Voraussetzung: $dependency. Siehe README.md." >&2
    exit 1
  fi
done
python3 bootstrap.py
exec python3 server.py
