#!/bin/sh
# Copies kindle/dist to the Kindle over SSH (KOReader → Network → SSH server).
#   KINDLE_HOST=192.168.0.93 npm run kindle:install
# Optional, to (re)write the hub settings on the device:
#   KINDLE_HUB_URL=https://<worker>.workers.dev KINDLE_HUB_TOKEN=<DEVICE_TOKEN_KINDLE_01>
# Downloaded listings, state.env, hub.env and the log are kept across installs.
set -e
HOST=${KINDLE_HOST:?set KINDLE_HOST to the Kindle IP shown by KOReader SSH server}
PORT=${KINDLE_PORT:-2222}
cd "$(dirname "$0")/dist"
[ -f dashboard/schedule.txt ] || { echo "kindle/dist is empty: run npm run kindle:build first" >&2; exit 1; }
case "$KINDLE_HUB_URL$KINDLE_HUB_TOKEN" in *\'*) echo "hub settings must not contain single quotes" >&2; exit 1 ;; esac

# Runs on the Kindle; the archive arrives on stdin. (No single quotes inside.)
REMOTE='set -e
rm -rf /mnt/us/dashboard/img /mnt/us/dashboard/bin
rm -rf /mnt/us/tempelhof "/mnt/us/documents/Tempelhof.sh" "/mnt/us/documents/Tempelhof test.sh" "/mnt/us/documents/Tempelhof log.sh"
cd /mnt/us && tar -xf -
chmod +x /mnt/us/dashboard/bin/dashboard.sh
if [ -n "$HUB_URL" ] && [ -n "$HUB_TOKEN" ]; then
  MAC=$(tr a-f A-F < /sys/class/net/wlan0/address)
  printf "HUB_URL=%s\nHUB_TOKEN=%s\nHUB_MAC=%s\n" "$HUB_URL" "$HUB_TOKEN" "$MAC" > /mnt/us/dashboard/hub.env
  echo "hub.env written (MAC $MAC)"
fi
[ -f /mnt/us/dashboard/hub.env ] || echo "note: no hub.env yet; pass KINDLE_HUB_URL and KINDLE_HUB_TOKEN to enable check-ins"
lipc-set-prop com.lab126.scanner doFullScan 1 >/dev/null 2>&1 || true
echo "installed: $(ls /mnt/us/dashboard/img/cd | wc -l) countdown images, $(wc -l < /mnt/us/dashboard/schedule.txt) Tempelhof events"'

# COPYFILE_DISABLE keeps macOS ._ metadata files out of the archive.
COPYFILE_DISABLE=1 tar -cf - dashboard documents |
  ssh -p "$PORT" "root@$HOST" "HUB_URL='${KINDLE_HUB_URL}' HUB_TOKEN='${KINDLE_HUB_TOKEN}'; $REMOTE"
