

#!/usr/bin/env bash
set -euo pipefail
# Mirror latest frontend from Xcode's Capacitor webview folder into /public
rsync -av --delete ios/App/App/public/ public/ \
  --exclude 'cordova*' --exclude '.DS_Store'
echo "Synced ios/App/App/public -> public"
