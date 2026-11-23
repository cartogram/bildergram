#!/bin/sh
# Name: Dashboard
# Author: bildergram
# DontUseFBInk
# Starts the dashboard (Tempelhof by day, Yorck listing in the evening).
# Power button: check in for updates. Plug in USB to exit.
setsid /mnt/us/dashboard/bin/dashboard.sh start </dev/null >/dev/null 2>&1 &
