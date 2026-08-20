#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "Energy Daddy Build 1.1 → http://localhost:5050"
echo "Plant Daddy 8000-series ports remain untouched."
python3 -m http.server 5050
