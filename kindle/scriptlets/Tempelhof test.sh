#!/bin/sh
# Name: Tempelhof (30-min test)
# Author: bildergram
# DontUseFBInk
# Same as Tempelhof, but returns to the Kindle UI by itself after 30 minutes.
setsid /mnt/us/tempelhof/bin/tempelhof.sh start 30 </dev/null >/dev/null 2>&1 &
