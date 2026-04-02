#!/usr/bin/env bash
set -euo pipefail
# Mirror latest frontend from /public into Xcode's Capacitor webview folder
rsync -av --delete public/ ios/App/App/public/ \
  --exclude 'cordova*' --exclude '.DS_Store'
echo "Synced public -> ios/App/App/public"
