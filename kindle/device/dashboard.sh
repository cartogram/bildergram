#!/bin/sh
# ============================================================
# Kindle dashboard (Phase 7) — runs on a jailbroken Kindle
# Paperwhite 3, installed to /mnt/us/dashboard/bin/.
#
# Shows screens on a daily schedule (SCHEDULE, from the hub):
#   tempelhof  open/closed + countdown, updated every minute
#              (all images prebuilt by kindle/build.mjs)
#   kino       the evening's Yorck listing for the slot's date,
#              downloaded from the hub; one draw, then sleep
#
# Between updates the Kindle suspends to RAM with Wi-Fi off and
# wakes on the RTC alarm. Wi-Fi is only used to check in with the
# hub: at the first wake after 06:00 when the cinema listing for
# today or tomorrow is missing, and whenever the power button is
# pressed. Plugging in USB (or the admin page's "exit") returns to
# the normal Kindle UI.
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
FULL_EVERY=15         # full refresh every N Tempelhof minutes (clears ghosting)
LOW_BATTERY=15        # show "Battery low" at or below this %
CHECK_HHMM=0600       # daily listing check: first wake at or after this time
DEFAULT_SCHEDULE="0600:tempelhof 1815:kino"
# Europe/Berlin as a POSIX rule: the Kindle's own zone setting is unreliable.
BERLIN_TZ='CET-1CEST,M3.5.0,M10.5.0/3'

. "$DIR/layout.env"   # CD_*/DATE_*/BAT_* paste positions, VERSION (from kindle/build.mjs)
[ -f "$DIR/hub.env" ] && . "$DIR/hub.env"   # HUB_URL HUB_TOKEN HUB_MAC (from kindle/install.sh)

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

ymd_num() { echo "$1" | tr -d '-'; }

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
# Schedule
# ------------------------------------------------------------------

load_state() {
  SCHEDULE=$DEFAULT_SCHEDULE
  KINO_DAYS=""
  [ -f "$DIR/state.env" ] && . "$DIR/state.env"
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
  if [ -n "$_next" ]; then
    NEXT_SWITCH=$(berlin_epoch "$_today" "$(echo "$_next" | sed 's/../&:/')")
  else
    _t=${_first%%:*}
    NEXT_SWITCH=$(berlin_epoch "$(day_offset "$_today" 1)" "$(echo "$_t" | sed 's/../&:/')")
  fi
}

# Next epoch at which the daily listing check is due (today or tomorrow at CHECK_HHMM).
next_check() {
  _today=$(berlin "$1" %Y-%m-%d)
  _at=$(berlin_epoch "$_today" "$(echo "$CHECK_HHMM" | sed 's/../&:/')")
  [ "$_at" -le "$1" ] && _at=$(berlin_epoch "$(day_offset "$_today" 1)" "$(echo "$CHECK_HHMM" | sed 's/../&:/')")
  echo "$_at"
}

schedule_has() { echo " $SCHEDULE " | grep -q ":$1 "; }

# The listing for today or tomorrow is missing on disk.
kino_needed() {
  schedule_has kino || return 1
  [ -f "$DIR/kino/$1.png" ] && [ -f "$DIR/kino/$(day_offset "$1" 1).png" ] && return 1
  return 0
}

# ------------------------------------------------------------------
# Tempelhof screen (prebuilt images)
# ------------------------------------------------------------------

# "<event-epoch> <background-key> <minutes-left, rounded up>" for epoch $1
tempelhof_lookup() {
  awk -v now="$1" '
    $1 > now { print $1, $3, int(($1 - now + 59) / 60); found = 1; exit }
    END { if (!found) exit 1 }
  ' "$DIR/schedule.txt"
}

draw_tempelhof() {  # $1 bg key, $2 minutes left, $3 = 1 for a full redraw, $4 date to paste (or empty)
  [ "$3" = 1 ] && full_png "$DIR/img/bg/$1.png"
  paste_png "$DIR/img/cd/$2.png" "$CD_X" "$CD_Y"
  [ -n "$4" ] && paste_png "$DIR/img/date/$4.png" "$DATE_X" "$DATE_Y"
}

kino_image() {  # $1 slot day
  if [ -f "$DIR/kino/$1.png" ]; then echo "$DIR/kino/$1.png"; else echo "$DIR/img/kino-missing.png"; fi
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

# Returns 0 on success, 2 when the hub says to exit, 1 on failure.
checkin() {  # $1 reason
  if [ -z "$HUB_URL" ] || [ -z "$HUB_TOKEN" ]; then
    log "check-in skipped ($1): no hub.env"
    return 1
  fi
  paste_png "$DIR/img/updating.png" "$BAT_X" "$BAT_Y"
  _wifi_before=$(lipc-get-prop com.lab126.wifid enable 2>/dev/null)
  if ! wifi_up; then
    log "check-in failed ($1): Wi-Fi did not connect"
    wifi_restore
    return 1
  fi

  _have=$(ls "$DIR/kino" 2>/dev/null | sed -n 's/\.png$//p' | tr '\n' ',')
  tail -n 40 "$LOG" > /tmp/dashboard-log.txt 2>/dev/null
  _q="battery=$(battery)&charging=$(charging)&screen=$SCREEN&version=$VERSION&reason=$1&have=$_have"
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
  printf 'SCHEDULE="%s"\nKINO_DAYS="%s"\n' "$SCHEDULE" "$KINO_DAYS" > "$DIR/state.env"

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
  _today=$(berlin "$_now" %Y-%m-%d)
  mkdir -p "$DIR/kino"
  _got=0
  for _d in $KINO_DAYS; do
    [ "$(ymd_num "$_d")" -lt "$(ymd_num "$_today")" ] && continue
    if curl -fsS -m 60 -H "Access-Token: $HUB_TOKEN" -H "ID: $HUB_MAC" \
        -o "$DIR/kino/$_d.png.part" "$HUB_URL/api/kindle/kino/$_d.png" 2>>"$LOG"; then
      mv "$DIR/kino/$_d.png.part" "$DIR/kino/$_d.png"
      _got=$((_got + 1))
    else
      rm -f "$DIR/kino/$_d.png.part"
    fi
  done
  wifi_restore

  # Drop listings older than yesterday.
  _keep=$(ymd_num "$(day_offset "$_today" -1)")
  for _f in "$DIR"/kino/*.png; do
    [ -f "$_f" ] || continue
    _d=$(basename "$_f" .png)
    [ "$(ymd_num "$_d")" -lt "$_keep" ] && rm -f "$_f"
  done

  log "check-in ($1): schedule '$SCHEDULE', listings $_got/$(echo $KINO_DAYS | wc -w) [$KINO_DAYS]${KINO_ERROR:+ kino error: $KINO_ERROR}, clock drift ${_drift}s, battery $(battery)%"
  [ "$EXIT" = 1 ] && return 2
  return 0
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
  shown=""          # what's on screen: "tempelhof:<bg>" or "kino:<day>"
  last_day=""
  since_full=$FULL_EVERY
  last_battery_log=0
  checked_day=""

  while :; do
    now=$(date +%s)
    if [ "$test_minutes" -gt 0 ] && [ $((now - started)) -ge $((test_minutes * 60)) ]; then
      log "test run finished after $test_minutes min"
      break
    fi

    today=$(berlin "$now" %Y-%m-%d)
    if [ "$checked_day" != "$today" ] && [ "$(berlin "$now" %H%M)" -ge "$CHECK_HHMM" ]; then
      checked_day=$today
      if kino_needed "$today"; then
        checkin daily
        [ $? = 2 ] && { log "hub asked to exit"; break; }
        shown=""
      fi
    fi

    resolve_slot "$now"
    take_screen
    wake=$NEXT_SWITCH

    case "$SCREEN" in
      kino)
        if [ "$shown" != "kino:$SLOT_DAY" ]; then
          full_png "$(kino_image "$SLOT_DAY")"
          shown="kino:$SLOT_DAY"
          log "showing kino for $SLOT_DAY until $(berlin "$NEXT_SWITCH" %H:%M)"
          sleep 2
        fi
        ;;
      *)
        set -- $(tempelhof_lookup "$now")
        if [ $# -ne 3 ]; then
          log "Tempelhof schedule exhausted: rebuild and reinstall (npm run kindle:build)"
          break
        fi
        full=0
        if [ "$shown" != "tempelhof:$2" ] || [ "$since_full" -ge "$FULL_EVERY" ]; then
          full=1
          shown="tempelhof:$2"
          since_full=0
        fi
        date_to_draw=""
        if [ "$full" = 1 ] || [ "$today" != "$last_day" ]; then
          date_to_draw=$today
          last_day=$today
        fi
        draw_tempelhof "$2" "$3" "$full" "$date_to_draw"
        since_full=$((since_full + 1))
        level=$(battery)
        if [ "$full" = 1 ] && [ -n "$level" ] && [ "$level" -le "$LOW_BATTERY" ]; then
          paste_png "$DIR/img/battery-low.png" "$BAT_X" "$BAT_Y"
        fi
        # Give the e-ink update time to finish before the CPU stops.
        if [ "$full" = 1 ]; then sleep 2; else sleep 1; fi
        minute=$(( $(date +%s) / 60 * 60 + 60 ))
        [ "$minute" -lt "$wake" ] && wake=$minute
        ;;
    esac

    if [ $((now - last_battery_log)) -ge 3600 ]; then
      log "battery $(battery)% (screen $SCREEN)"
      last_battery_log=$now
    fi

    # The daily listing check may be due before the next switch.
    if kino_needed "$today" || [ "$checked_day" != "$today" ]; then
      check_at=$(next_check "$now")
      [ "$check_at" -lt "$wake" ] && wake=$check_at
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
    day=$(berlin "$at" %Y-%m-%d)
    echo "at $(berlin "$at" '%a %Y-%m-%d %H:%M') Berlin: screen $SCREEN (slot day $SLOT_DAY), next switch $(berlin "$NEXT_SWITCH" '%a %H:%M'), listing check due $(berlin "$(next_check "$at")" '%a %H:%M')$(kino_needed "$day" && echo ' [listing missing]')"
    case "$SCREEN" in
      kino)
        echo "  kino image: $(kino_image "$SLOT_DAY")"
        [ "$1" = once ] && full_png "$(kino_image "$SLOT_DAY")"
        ;;
      *)
        set -- "$1" $(tempelhof_lookup "$at")
        echo "  tempelhof: background $3, $4 min left, date $day"
        [ "$1" = once ] && draw_tempelhof "$3" "$4" 1 "$day"
        ;;
    esac
    ;;
  *)
    echo "usage: $0 start [TEST_MINUTES] | once [EPOCH] | plan [EPOCH] | checkin" >&2
    exit 2
    ;;
esac
