#!/bin/sh
# Name: Dashboard log
# Author: bildergram
# Shows the end of the dashboard log on screen (printed via FBInk).
echo "Dashboard log (times in UTC)"
echo
tail -n 22 /mnt/us/dashboard/dashboard.log 2>/dev/null || echo "No log yet."
sleep 20
