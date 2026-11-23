#!/bin/sh
# Name: Tempelhof
# Author: bildergram
# DontUseFBInk
# Starts the Tempelhof Field dashboard. Press the power button to exit.
setsid /mnt/us/tempelhof/bin/tempelhof.sh start </dev/null >/dev/null 2>&1 &
