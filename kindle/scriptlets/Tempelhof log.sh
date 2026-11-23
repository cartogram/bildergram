#!/bin/sh
# Name: Tempelhof log
# Author: bildergram
# Shows the end of the dashboard log on screen (printed via FBInk).
echo "Tempelhof log (times in UTC)"
echo
tail -n 22 /mnt/us/tempelhof/tempelhof.log 2>/dev/null || echo "No log yet."
sleep 20
