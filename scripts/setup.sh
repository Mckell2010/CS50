#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv .venv
.venv/bin/python -m pip install --cache-dir /tmp/divergent-pip-cache -r requirements.lock
npm ci --cache /tmp/divergent-npm-cache --no-audit --no-fund
npm run build
.venv/bin/python -m backend.migrate
