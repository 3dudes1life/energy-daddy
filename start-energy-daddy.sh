#!/bin/bash
set -e
cd "$(dirname "$0")/public"
echo "⚡ Energy Daddy Build 1.4 → http://localhost:5050"
echo "🌱 Plant Daddy 8000-series remains untouched."
python3 -m http.server 5050
