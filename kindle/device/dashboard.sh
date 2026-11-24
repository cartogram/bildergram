#!/bin/sh
# ============================================================
# Kindle dashboard (Phase 9) — runs on a jailbroken Kindle
# Paperwhite 3, installed to /mnt/us/dashboard/bin/.
#
# Shows screens on a daily schedule (SCHEDULE from the hub, e.g.
# "0600:morgen 0900:tag 1815:abend 2300:nacht"). Each screen is a
# base image rendered by the server (top bar, weather, cinema,
# phrase) and downloaded at check-in; the Tag screen also has a
# Tempelhof box that the Kindle draws itself from prebuilt images,
# with a new countdown every minute.
#
# Between updates the Kindle suspends to RAM with Wi-Fi off and wakes
# on the RTC alarm. It checks in with the hub when the current
# screen's base is missing, every CHECKIN_MINUTES while a weather
# screen is showing, and when the power button is pressed. Plugging
# in USB (or the admin page's "exit") returns to the normal Kindle UI.
#
#   dashboard.sh start [TEST_MINUTES]  run (TEST_MINUTES > 0 stops after that long)
#   dashboard.sh once [EPOCH]          draw the current screen once, no suspend
#   dashboard.sh plan [EPOCH]          print what would be shown, draw nothing
#   dashboard.sh checkin               check in with the hub now (Wi-Fi on/off)
# ============================================================

DIR=${DASHBOARD_DIR:-/mnt/us/dashboard}
LOG=$DIR/dashboard.log
PIDFILE=/tmp/dashboard.pid
RTC=${DASHBOARD_RTC:-/sys/class/rtc/rtc1/wakealarm}
EIPS=${EIPS:-/usr/sbin/eips}
FULL_EVERY=15    # full refresh every N Tempelhof minutes (clears ghosting)
RETRY_SECS=900   # after a failed check-in, try again at most every 15 minutes
# Europe/Berlin as a POSIX rule: the Kindle's own zone setting is unreliable.
BERLIN_TZ='CET-1CEST,M3.5.0,M10.5.0/3'

. "$DIR/layout.env"   # VERSION SCREENS HOURLY_SCREENS DEFAULT_SCHEDULE, DEVICE_*/TP_*/CD_*/UPD_* (kindle/build.mjs)
[ -f "$DIR/hub.env" ] && . "$DIR/hub.env"   # HUB_URL HUB_TOKEN HUB_MAC (kindle/install.sh)

log() {
  echo "$(date -u '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"
}

# ------------------------------------------------------------------
# Time (busybox date on the Kindle; BSD date for local testing)
# ------------------------------------------------------------------

if date -d @0 +%s >/dev/null 2>&1; then
  berlin() { TZ=$BERLIN_TZ date -d "@$1" "+$2"; }                       # epoch, format
  berlin_epoch() { TZ=$BERLIN_TZ date -d "$1 $2" +%s; }                 # YYYY-MM-DD, HH:MM
else
  berlin() { TZ=$BERLIN_TZ date -r "$1" "+$2"; }
  berlin_epoch() { TZ=$BERLIN_TZ date -j -f '%Y-%m-%d %H:%M:%S' "$1 $2:00" +%s; }
fi

day_offset() {  # $1 YYYY-MM-DD, $2 days → YYYY-MM-DD (anchored at noon, DST-safe)
  berlin $(($(berlin_epoch "$1" 12:00) + $2 * 86400)) %Y-%m-%d
}

in_list() { case " $2 " in *" $1 "*) return 0 ;; esac; return 1; }

# Value of a generated per-screen variable, e.g. `var TP tag X` → $TP_tag_X.
# Screen ids are checked against $SCREENS before they get here.
var() {
  eval "echo \"\${$1_$2${3:+_$3}}\""
}

# ------------------------------------------------------------------
# Device helpers
# ------------------------------------------------------------------

battery() { gasgauge-info -c 2>/dev/null | tr -dc '0-9'; }
charging() { lipc-get-prop com.lab126.powerd isCharging 2>/dev/null | tr -dc '0-9'; }

paste_png() {  # $1 file, $2 x, $3 y
  "$EIPS" -g "$1" -x "$2" -y "$3" >/dev/null 2>&1
}

full_png() {
  "$EIPS" -f -g "$1" >/dev/null 2>&1
}

# Keep the Kindle UI from drawing over the dashboard. framework stays
# up (it owns the power button); lab126_gui can be relaunched after a
# wake, so this runs every loop.
take_screen() {
  lipc-set-prop com.lab126.powerd preventScreenSaver 1 >/dev/null 2>&1
  initctl stop lab126_gui >/dev/null 2>&1
  initctl stop webreader >/dev/null 2>&1
}

restore_ui() {
  echo 0 > "$RTC" 2>/dev/null
  lipc-set-prop com.lab126.powerd preventScreenSaver 0 >/dev/null 2>&1
  if [ "$WIFI_WAS" != 0 ]; then
    lipc-set-prop com.lab126.wifid enable 1 >/dev/null 2>&1
  fi
  initctl start lab126_gui >/dev/null 2>&1
  rm -f "$PIDFILE"
}

# ------------------------------------------------------------------
# State and schedule
# ------------------------------------------------------------------

load_state() {
  SCHEDULE=$DEFAULT_SCHEDULE
  CHECKIN_MINUTES=60
  LAST_OK=0
  [ -f "$DIR/state.env" ] && . "$DIR/state.env"
  # Phase 7 screen names (tempelhof/kino) map to the new screens.
  SCHEDULE=$(echo "$SCHEDULE" | sed 's/:tempelhof/:tag/g; s/:kino/:abend/g')
}

save_state() {
  printf 'SCHEDULE="%s"\nCHECKIN_MINUTES=%s\nLAST_OK=%s\n' "$SCHEDULE" "$CHECKIN_MINUTES" "$LAST_OK" > "$DIR/state.env"
}

schedule_screens() {
  echo "$SCHEDULE" | tr ' ' '\n' | sed -n 's/^[0-9]*://p' | sort -u
}

# Sets SCREEN, SLOT_DAY (date the current slot started) and NEXT_SWITCH
# (epoch of the next schedule entry) for epoch $1.
resolve_slot() {
  _hhmm=$(berlin "$1" %H%M)
  _today=$(berlin "$1" %Y-%m-%d)
  SCREEN=""
  _first=""
  _last=""
  _next=""
  for _e in $(echo "$SCHEDULE" | tr ' ' '\n' | sort); do
    _t=${_e%%:*}
    [ -z "$_first" ] && _first=$_e
    _last=$_e
    if [ "$_t" -le "$_hhmm" ]; then
      SCREEN=${_e#*:}
    elif [ -z "$_next" ]; then
      _next=$_t
    fi
  done
  SLOT_DAY=$_today
  if [ -z "$SCREEN" ]; then  # before the first entry: yesterday's last slot continues
    SCREEN=${_last#*:}
    SLOT_DAY=$(day_offset "$_today" -1)
  fi
  in_list "$SCREEN" "$SCREENS" || SCREEN=tag
  if [ -n "$_next" ]; then
    NEXT_SWITCH=$(berlin_epoch "$_today" "$(echo "$_next" | sed 's/../&:/')")
  else
    _t=${_first%%:*}
    NEXT_SWITCH=$(berlin_epoch "$(day_offset "$_today" 1)" "$(echo "$_t" | sed 's/../&:/')")
  fi
}

# The downloaded base for screen $1 exists and is for day $2.
have_base() {
  [ -f "$DIR/screens/$1.png" ] && [ "$(cat "$DIR/screens/$1.day" 2>/dev/null)" = "$2" ]
}

base_image() {  # $1 screen, $2 day
  if have_base "$1" "$2"; then echo "$DIR/screens/$1.png"; else echo "$DIR/fallback/$1.png"; fi
}

# A check-in is due: the current base is missing, or a weather screen is
# older than CHECKIN_MINUTES.
checkin_due() {  # $1 now
  [ -n "$HUB_URL" ] || return 1
  have_base "$SCREEN" "$SLOT_DAY" || return 0
  in_list "$SCREEN" "$HOURLY_SCREENS" && [ $(($1 - LAST_OK)) -ge $((CHECKIN_MINUTES * 60)) ] && return 0
  return 1
}

# ------------------------------------------------------------------
# Tempelhof box (prebuilt images)
# ------------------------------------------------------------------

# "<event-epoch> <background-key> <minutes-left, rounded up>" for epoch $1
tempelhof_lookup() {
  awk -v now="$1" '
    $1 > now { print $1, $3, int(($1 - now + 59) / 60); found = 1; exit }
    END { if (!found) exit 1 }
  ' "$DIR/schedule.txt"
}

# ------------------------------------------------------------------
# Hub check-in (Wi-Fi on only for its duration)
# ------------------------------------------------------------------

wifi_up() {
  lipc-set-prop com.lab126.wifid enable 1 >/dev/null 2>&1
  _n=0
  while [ $_n -lt 45 ]; do
    [ "$(lipc-get-prop com.lab126.wifid cmState 2>/dev/null)" = CONNECTED ] && return 0
    sleep 1
    _n=$((_n + 1))
  done
  return 1
}

wifi_down() {
  lipc-set-prop com.lab126.wifid enable 0 >/dev/null 2>&1
}

# After a check-in: Wi-Fi off again, unless it was already on before
# (a manual `dashboard.sh checkin` over SSH must not cut the session).
wifi_restore() {
  [ "$_wifi_before" = 1 ] || wifi_down
}

hub_get() {  # $1 path, $2 output file
  curl -fsS -m 60 -H "Access-Token: $HUB_TOKEN" -H "ID: $HUB_MAC" -o "$2" "$HUB_URL$1" 2>>"$LOG"
}

# Returns 0 on success, 2 when the hub says to exit, 1 on failure.
checkin() {  # $1 reason
  if [ -z "$HUB_URL" ] || [ -z "$HUB_TOKEN" ]; then
    log "check-in skipped ($1): no hub.env"
    return 1
  fi
  paste_png "$DIR/img/updating.png" "$UPD_X" "$UPD_Y"
  _wifi_before=$(lipc-get-prop com.lab126.wifid enable 2>/dev/null)
  if ! wifi_up; then
    log "check-in failed ($1): Wi-Fi did not connect"
    wifi_restore
    return 1
  fi

  _bat=$(battery)
  tail -n 40 "$LOG" > /tmp/dashboard-log.txt 2>/dev/null
  _q="battery=$_bat&charging=$(charging)&screen=$SCREEN&version=$VERSION&reason=$1"
  if ! curl -fsS -m 40 -X POST -H "Access-Token: $HUB_TOKEN" -H "ID: $HUB_MAC" \
      --data-binary @/tmp/dashboard-log.txt "$HUB_URL/api/kindle/checkin?$_q" > /tmp/dashboard-reply.env 2>>"$LOG"; then
    log "check-in failed ($1): hub request failed"
    wifi_restore
    return 1
  fi
  # Only accept plain KEY="value" / KEY=number lines before sourcing.
  if grep -qvE '^[A-Z_]+=("[A-Za-z0-9 :._-]*"|[0-9]+)$' /tmp/dashboard-reply.env; then
    log "check-in failed ($1): unexpected reply"
    wifi_restore
    return 1
  fi
  . /tmp/dashboard-reply.env

  # With Wi-Fi off most of the time the Kindle never syncs its clock; use
  # the hub's time (accurate to about a second) when it is off by > 10 s.
  _now=$(date +%s)
  _drift=$((${SERVER_TIME:-$_now} - _now))
  if [ "$_drift" -gt 10 ] || [ "$_drift" -lt -10 ]; then
    if date -u -s "$(date -u -d "@$SERVER_TIME" '+%Y-%m-%d %H:%M:%S')" >/dev/null 2>&1; then
      log "clock corrected by ${_drift}s"
      _now=$(date +%s)
    fi
  fi

  # Download the base of every screen in the schedule: the current one
  # for its slot's date, the others for today.
  resolve_slot "$_now"
  _today=$(berlin "$_now" %Y-%m-%d)
  mkdir -p "$DIR/screens"
  _got=""
  _failed=""
  for _s in $(schedule_screens); do
    in_list "$_s" "$SCREENS" || continue
    _d=$_today
    [ "$_s" = "$SCREEN" ] && _d=$SLOT_DAY
    if hub_get "/api/kindle/screen/$_s.png?day=$_d&battery=$_bat" "$DIR/screens/$_s.png.part"; then
      mv "$DIR/screens/$_s.png.part" "$DIR/screens/$_s.png"
      echo "$_d" > "$DIR/screens/$_s.day"
      _got="$_got $_s"
    else
      rm -f "$DIR/screens/$_s.png.part"
      _failed="$_failed $_s"
    fi
  done
  wifi_restore

  have_base "$SCREEN" "$SLOT_DAY" && LAST_OK=$_now
  save_state
  log "check-in ($1): schedule '$SCHEDULE', every ${CHECKIN_MINUTES} min, screens:${_got:- none}${_failed:+, failed:$_failed}, clock drift ${_drift}s, battery ${_bat}%"
  [ "$EXIT" = 1 ] && return 2
  [ -z "$_failed" ] || return 1
  return 0
}

# ------------------------------------------------------------------
# Drawing
# ------------------------------------------------------------------

# Draw the current screen. Sets WAKE_AT to the next minute when a
# Tempelhof box is showing. Uses and updates $shown and $since_full.
draw_screen() {  # $1 now
  _base=$(base_image "$SCREEN" "$SLOT_DAY")
  _dev=$(var DEVICE "$SCREEN")
  WAKE_AT=""
  if [ -z "$_dev" ]; then
    if [ "$shown" != "$SCREEN:$_base" ]; then
      full_png "$_base"
      shown="$SCREEN:$_base"
      log "showing $SCREEN ($SLOT_DAY) from $(basename "$(dirname "$_base")")"
      sleep 2
    fi
    return
  fi

  # Tempelhof box: a panel per state, a countdown per minute.
  _variant=${_dev#*:}
  set -- $(tempelhof_lookup "$1")
  if [ $# -ne 3 ]; then
    log "Tempelhof schedule exhausted: rebuild and reinstall (npm run kindle:build)"
    return
  fi
  _full=0
  if [ "$shown" != "$SCREEN:$_base:$2" ] || [ "$since_full" -ge "$FULL_EVERY" ]; then
    full_png "$_base"
    paste_png "$DIR/tempelhof/$_variant/panel/$2.png" "$(var TP "$SCREEN" X)" "$(var TP "$SCREEN" Y)"
    shown="$SCREEN:$_base:$2"
    since_full=0
    _full=1
  fi
  # The countdown follows the state's sentence: its own set and position per state.
  _st=${2%%_*}
  paste_png "$DIR/tempelhof/$_variant/cd/$_st/$3.png" "$(var CD "$SCREEN" "${_st}_X")" "$(var CD "$SCREEN" "${_st}_Y")"
  since_full=$((since_full + 1))
  # Give the e-ink update time to finish before the CPU stops.
  if [ "$_full" = 1 ]; then sleep 2; else sleep 1; fi
  WAKE_AT=$(( $(date +%s) / 60 * 60 + 60 ))
}

# ------------------------------------------------------------------
# Main loop
# ------------------------------------------------------------------

run() {
  test_minutes=${1:-0}

  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    log "already running (pid $(cat "$PIDFILE"))"
    exit 0
  fi
  echo $$ > "$PIDFILE"

  # Rotate the log before it grows large (it lives on the FAT user partition).
  if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 200000 ]; then
    mv "$LOG" "$LOG.1"
  fi
  log "start: version=$VERSION test_minutes=$test_minutes battery=$(battery)% rtc=$RTC"

  # Let the scriptlet launcher hand the screen back to the library first.
  sleep 4

  WIFI_WAS=$(lipc-get-prop com.lab126.wifid enable 2>/dev/null)
  wifi_down
  take_screen
  sleep 3

  trap 'log "stopped by signal"; restore_ui; exit 0' TERM INT HUP

  load_state
  started=$(date +%s)
  shown=""
  since_full=$FULL_EVERY
  last_battery_log=0
  last_attempt=0

  while :; do
    now=$(date +%s)
    if [ "$test_minutes" -gt 0 ] && [ $((now - started)) -ge $((test_minutes * 60)) ]; then
      log "test run finished after $test_minutes min"
      break
    fi

    resolve_slot "$now"
    if checkin_due "$now" && [ $((now - last_attempt)) -ge "$RETRY_SECS" ]; then
      last_attempt=$now
      checkin scheduled
      [ $? = 2 ] && { log "hub asked to exit"; break; }
      shown=""
      now=$(date +%s)
      resolve_slot "$now"
    fi

    take_screen
    draw_screen "$now"

    # Next wake: the next switch, the next minute (Tempelhof), or the next
    # check-in (weather screens on the interval, or retrying a missing base).
    wake=$NEXT_SWITCH
    [ -n "$WAKE_AT" ] && [ "$WAKE_AT" -lt "$wake" ] && wake=$WAKE_AT
    if [ -n "$HUB_URL" ]; then
      due=""
      if ! have_base "$SCREEN" "$SLOT_DAY"; then
        due=$((last_attempt + RETRY_SECS))
      elif in_list "$SCREEN" "$HOURLY_SCREENS"; then
        due=$((LAST_OK + CHECKIN_MINUTES * 60))
        # After a failed attempt, wait out the retry delay first.
        [ "$last_attempt" -gt "$LAST_OK" ] && [ "$due" -lt $((last_attempt + RETRY_SECS)) ] && due=$((last_attempt + RETRY_SECS))
      fi
      [ -n "$due" ] && [ "$due" -lt "$wake" ] && wake=$due
    fi

    if [ $((now - last_battery_log)) -ge 3600 ]; then
      log "battery $(battery)% (screen $SCREEN)"
      last_battery_log=$now
    fi

    now=$(date +%s)
    secs=$((wake - now))
    [ "$secs" -lt 1 ] && secs=1
    echo 0 > "$RTC"
    echo "+$secs" > "$RTC"
    echo mem > /sys/power/state 2>/dev/null
    rc=$?
    if [ "$rc" -ne 0 ]; then
      log "suspend failed (rc=$rc): staying awake for ${secs}s"
      sleep "$secs"
      continue
    fi

    # The alarm clears itself when it fires. Still pending means something
    # else woke us: USB (charging) → exit, otherwise the power button →
    # check in now and redraw.
    if [ -n "$(cat "$RTC" 2>/dev/null)" ]; then
      if [ "$(charging)" = 1 ]; then
        log "woke early with USB connected: exiting"
        break
      fi
      log "woke early (power button): checking in"
      last_attempt=$(date +%s)
      checkin button
      [ $? = 2 ] && { log "hub asked to exit"; break; }
      shown=""
    fi
  done

  restore_ui
  log "exit: battery=$(battery)%"
}

case "$1" in
  start)
    run "${2:-0}"
    ;;
  checkin)
    load_state
    resolve_slot "$(date +%s)"
    checkin manual
    echo "check-in returned $?; see $LOG"
    ;;
  once|plan)
    at=${2:-$(date +%s)}
    load_state
    resolve_slot "$at"
    _dev=$(var DEVICE "$SCREEN")
    due="no"
    checkin_due "$at" && due="yes"
    echo "at $(berlin "$at" '%a %Y-%m-%d %H:%M') Berlin: screen $SCREEN (slot day $SLOT_DAY), next switch $(berlin "$NEXT_SWITCH" '%a %H:%M'), check-in due: $due"
    echo "  base: $(base_image "$SCREEN" "$SLOT_DAY")"
    if [ -n "$_dev" ]; then
      set -- $(tempelhof_lookup "$at")
      echo "  tempelhof (${_dev#*:}): panel $2, countdown $3 min, at TP $(var TP "$SCREEN" X),$(var TP "$SCREEN" Y) / CD $(var CD "$SCREEN" X),$(var CD "$SCREEN" Y)"
    fi
    if [ "$1" = once ]; then
      shown=""
      since_full=$FULL_EVERY
      draw_screen "$at"
    fi
    ;;
  *)
    echo "usage: $0 start [TEST_MINUTES] | once [EPOCH] | plan [EPOCH] | checkin" >&2
    exit 2
    ;;
esac
