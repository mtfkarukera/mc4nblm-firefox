#!/usr/bin/env bash
# build.sh — Build l'extension et produit un .xpi dans dist/
set -e

VERSION=$(node -p "require('./manifest.json').version")
NAME="magic_clipper_for_notebooklm"
DIST="dist"

echo "🔨 Building ${NAME}-${VERSION}.xpi …"

# Build via web-ext (lit web-ext-config.cjs → artifactsDir: dist)
npx web-ext build --source-dir . --overwrite-dest

# Renommer le .zip en .xpi
ZIP=$(ls -t ${DIST}/*.zip 2>/dev/null | head -n 1)

if [ -n "$ZIP" ] && [ -f "$ZIP" ]; then
  XPI="${ZIP%.zip}.xpi"
  mv "$ZIP" "$XPI"
  echo "✅ ${XPI} prêt ($(du -h "$XPI" | cut -f1))"
else
  echo "❌ Fichier ZIP introuvable dans ${DIST}/"
  exit 1
fi
