#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
.venv/bin/python -m pytest -q tests -s
node --test tests/*.test.ts
node scripts/check_windows_types.mjs
npm run build
