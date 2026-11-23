#!/bin/sh
# Name: Dashboard (30-min test)
# Author: bildergram
# DontUseFBInk
# Same as Dashboard, but returns to the Kindle UI by itself after 30 minutes.
setsid /mnt/us/dashboard/bin/dashboard.sh start 30 </dev/null >/dev/null 2>&1 &
