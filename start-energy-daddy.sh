#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "Energy Daddy Build 1 → http://localhost:5050"
python3 -m http.server 5050
