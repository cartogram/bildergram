#!/bin/sh
# Copies kindle/dist to the Kindle over SSH (KOReader → Network → SSH server).
#   KINDLE_HOST=192.168.0.93 npm run kindle:install
set -e
HOST=${KINDLE_HOST:?set KINDLE_HOST to the Kindle IP shown by KOReader SSH server}
PORT=${KINDLE_PORT:-2222}
cd "$(dirname "$0")/dist"
[ -f tempelhof/schedule.txt ] || { echo "kindle/dist is empty: run npm run kindle:build first" >&2; exit 1; }
# COPYFILE_DISABLE keeps macOS ._ metadata files out of the archive.
COPYFILE_DISABLE=1 tar -cf - tempelhof documents | ssh -p "$PORT" "root@$HOST" '
  set -e
  rm -rf /mnt/us/tempelhof/img /mnt/us/tempelhof/bin
  cd /mnt/us && tar -xf -
  chmod +x /mnt/us/tempelhof/bin/tempelhof.sh
  echo "installed: $(ls /mnt/us/tempelhof/img/cd | wc -l) countdown images, $(wc -l < /mnt/us/tempelhof/schedule.txt) events"
'
