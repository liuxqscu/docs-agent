#!/usr/bin/env sh
set -e

echo "[1/2] Running semantic matrix checks..."
node scripts/semantic-matrix-check.js

echo "[2/2] Compiling project..."
mvn -DskipTests compile

echo "All checks passed."
