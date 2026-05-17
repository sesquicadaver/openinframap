#!/usr/bin/env bash
# GEM data import helper.
#
# ПРОСТИЙ РЕЖИМ (всі файли):
#   1. Скопіюй завантажені GEM файли в ./gem-data/
#   2. ./gem_import.sh
#
# ОДИН ФАЙЛ:
#   ./gem_import.sh <filename>
#   ./gem_import.sh <filename> --tracker oil_gas   # якщо авто-визначення не спрацювало
#
# Трекер визначається автоматично з імені файлу.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/gem-data"

echo "Building gem-import container..."
docker compose --profile import build gem-import --quiet

run_import() {
  local file="$1"
  shift
  echo "→ $(basename "$file") ..."
  docker compose --profile import run --rm gem-import \
    --file "/data/$(basename "$file")" \
    --replace \
    "$@"
}

if [[ $# -eq 0 ]]; then
  # Batch mode: process all xlsx/csv files in gem-data/
  files=("$DATA_DIR"/*.xlsx "$DATA_DIR"/*.xls "$DATA_DIR"/*.csv)
  found=0
  for f in "${files[@]}"; do
    [[ -f "$f" ]] || continue
    [[ "$(basename "$f")" == ".gitkeep" ]] && continue
    run_import "$f"
    found=$((found + 1))
  done
  if [[ $found -eq 0 ]]; then
    echo "Немає файлів у gem-data/. Завантаж Excel/CSV з globalenergymonitor.org і скопіюй туди."
    exit 1
  fi
  echo "Готово: імпортовано $found файл(ів)."
else
  # Single file mode
  FILE="$1"
  shift
  [[ "$FILE" == gem-data/* ]] || FILE="gem-data/$FILE"
  if [[ ! -f "$SCRIPT_DIR/$FILE" ]]; then
    echo "ERROR: Файл не знайдено: $FILE"
    exit 1
  fi
  run_import "$SCRIPT_DIR/$FILE" "$@"
  echo "Готово."
fi
