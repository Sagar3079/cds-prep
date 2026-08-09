#!/usr/bin/env bash
# Blue/green auto-deploy for prepcadet.in. Invoked ONLY as the forced command of
# the deploy key in authorized_keys, so a leaked key can trigger this and
# nothing else — no shell, no arbitrary command.
#
# THIS IS THE CANONICAL COPY, and it is not the one that runs. The running copy
# is /opt/cds-prep/deploy.sh, gitignored and installed by hand:
#
#   install -m 700 /opt/cds-prep/ops/deploy.sh /opt/cds-prep/deploy.sh
#
# It has to work that way. This script runs `git reset --hard`, and bash reads a
# script incrementally as it executes it — so if the running copy were tracked, a
# deploy that changed deploy.sh would rewrite the file underneath the shell
# running it, which then resumes at a byte offset pointing into different code.
#
# ── how this differs from the restart-in-place version it replaces ───────────
#
# The old script built into `.next` while the live server was reading it, then
# restarted, then rolled back if the site failed to come up. Two problems, both
# real and both visible in /var/log/cds-prep.log:
#
#   * Rebuilding a directory out from under a running Next server left it with
#     an in-memory manifest that no longer matched the chunks on disk — the
#     "Server Reference ID did not match" errors.
#   * Every deploy, successful or not, restarted the only instance. A rollback
#     meant a SECOND restart. Downtime was the normal case, not the failure case.
#
# Now there are two slots, a and b, on ports 3100 and 3101, each with its own
# build directory (.next-a / .next-b). A deploy builds and starts the idle slot,
# proves it works, and only then moves nginx across. The live slot is untouched
# until the moment traffic moves, and any failure before that point leaves it
# serving the old version — so the failure path is "nothing happened", not
# "roll back and hope".
set -uo pipefail
cd /opt/cds-prep || exit 1

LOG=/var/log/cds-prep-deploy.log
exec >> "$LOG" 2>&1
echo "=== $(date -Is) deploy start ==="

STATE=/opt/cds-prep/.deploy-slot
UPSTREAM=/etc/nginx/conf.d/cds-prep-upstream.conf

port_of() { [ "$1" = "a" ] && echo 3100 || echo 3101; }

LIVE=$(cat "$STATE" 2>/dev/null || echo a)
case "$LIVE" in a|b) ;; *) LIVE=a ;; esac
[ "$LIVE" = "a" ] && NEXTSLOT=b || NEXTSLOT=a
LIVE_PORT=$(port_of "$LIVE")
NEXT_PORT=$(port_of "$NEXTSLOT")
echo "live slot: $LIVE (:$LIVE_PORT)   building into: $NEXTSLOT (:$NEXT_PORT)"

# Without this file there is nothing to switch, and the sed below would fail
# silently after the new slot was already running. Fail before touching anything.
if [ ! -f "$UPSTREAM" ]; then
  echo "MISSING $UPSTREAM — install ops/nginx/cds-prep-upstream.conf first (see ops/README.md)"
  exit 1
fi

PREV=$(git rev-parse HEAD)
git fetch --quiet origin main || { echo "FETCH FAILED"; exit 1; }
TARGET=$(git rev-parse origin/main)

# Never discard work that exists only on this box.
#
# `git reset --hard origin/main` below is unconditional, so a commit made here
# and not pushed is gone the next time anything lands on main — including a push
# that has nothing to do with it. That is not hypothetical: the security fixes in
# this tree were deployed straight from the VPS because the box has no GitHub
# credentials, and until they are pushed, an unrelated deploy would silently
# revert every one of them.
#
# Zero in the normal case, since a finished deploy leaves HEAD at origin/main.
UNPUSHED=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
if [ "${UNPUSHED:-0}" -gt 0 ]; then
  echo "REFUSING TO DEPLOY: $UNPUSHED commit(s) here are not on origin/main."
  echo "Resetting would destroy them. Push them first:"
  git log --oneline origin/main..HEAD | sed 's/^/    /'
  exit 1
fi
# "Nothing to do" has to mean the RUNNING BUILD matches origin/main, not merely
# that the checkout does.
#
# This compared HEAD against origin/main, which is the same question only when
# nobody commits on the box. Commit here and push, and the next deploy finds
# HEAD already at origin/main and exits before building — commit on GitHub,
# checkout correct, CI green, and the process still serving the previous
# bundle. That is not hypothetical: the mobile fixes reported as deployed were
# still the old build until they were built by hand.
BUILT=$(cat "$STATE.commit" 2>/dev/null || echo none)
if [ "$PREV" = "$TARGET" ] && [ "$BUILT" = "$TARGET" ]; then
  echo "already at origin/main and slot $LIVE is built from it, nothing to do"
  exit 0
fi
if [ "$PREV" = "$TARGET" ]; then
  echo "checkout is at origin/main but slot $LIVE was built from $BUILT — rebuilding"
fi
echo "current: $PREV"
echo "target:  $TARGET"

# `npm ci` wipes and repopulates node_modules, which the LIVE slot is running
# out of. Skipped unless the lockfile actually changed — most deploys do not
# touch it, and not touching node_modules is the difference between a deploy the
# live process cannot notice and one that might.
LOCK_CHANGED=1
git diff --quiet "$PREV" "$TARGET" -- package-lock.json package.json && LOCK_CHANGED=0

git reset --hard --quiet "$TARGET" || { echo "RESET FAILED"; exit 1; }

if [ "$LOCK_CHANGED" = "1" ]; then
  echo "lockfile changed — running npm ci"
  npm ci --silent || { echo "NPM CI FAILED — live slot $LIVE untouched"; exit 1; }
else
  echo "lockfile unchanged — skipping npm ci"
fi

# Build into the IDLE slot's directory. Nothing is serving from it.
echo "building .next-$NEXTSLOT"
if ! NEXT_DIST_DIR=".next-$NEXTSLOT" npm run build; then
  echo "BUILD FAILED — live slot $LIVE still serving, nothing changed"
  git reset --hard --quiet "$PREV"
  exit 1
fi

health() {
  local port=$1
  for _ in $(seq 1 20); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$port/" || true)
    [ "$code" = "200" ] && return 0
    sleep 2
  done
  return 1
}

echo "starting slot $NEXTSLOT"
systemctl restart "cds-prep@$NEXTSLOT" || { echo "START FAILED — live slot $LIVE untouched"; exit 1; }

if ! health "$NEXT_PORT"; then
  echo "NEW SLOT UNHEALTHY on :$NEXT_PORT — live slot $LIVE still serving"
  systemctl stop "cds-prep@$NEXTSLOT"
  git reset --hard --quiet "$PREV"
  exit 1
fi
echo "slot $NEXTSLOT healthy on :$NEXT_PORT"

# ── the switch ───────────────────────────────────────────────────────────────
# Graceful: nginx starts workers on the new config and lets existing workers
# finish the requests they are already handling. No connection is dropped.
echo "switching nginx upstream to :$NEXT_PORT"
cp "$UPSTREAM" "$UPSTREAM.bak" 2>/dev/null
sed -i -E "s/server 127\.0\.0\.1:[0-9]+;/server 127.0.0.1:$NEXT_PORT;/" "$UPSTREAM"

if ! nginx -t 2>/dev/null; then
  echo "NGINX CONFIG INVALID — restoring and abandoning switch"
  [ -f "$UPSTREAM.bak" ] && mv "$UPSTREAM.bak" "$UPSTREAM"
  systemctl stop "cds-prep@$NEXTSLOT"
  git reset --hard --quiet "$PREV"
  exit 1
fi
systemctl reload nginx

# Prove it end-to-end, through nginx, not just against the port.
if ! health "$NEXT_PORT" || ! curl -sf -o /dev/null --max-time 10 https://prepcadet.in/; then
  echo "POST-SWITCH CHECK FAILED — switching back to :$LIVE_PORT"
  sed -i -E "s/server 127\.0\.0\.1:[0-9]+;/server 127.0.0.1:$LIVE_PORT;/" "$UPSTREAM"
  nginx -t 2>/dev/null && systemctl reload nginx
  systemctl stop "cds-prep@$NEXTSLOT"
  git reset --hard --quiet "$PREV"
  echo "=== rolled back to slot $LIVE ==="
  exit 1
fi

echo "$NEXTSLOT" > "$STATE"
# What the slot now serving was actually BUILT from. Read by the early-exit
# above, so a checkout that is already at origin/main still rebuilds when the
# running bundle is older than it.
echo "$TARGET" > "$STATE.commit"
rm -f "$UPSTREAM.bak"

# Exactly the live slot is enabled, so a reboot brings back the one that was
# serving and does not try to start the other. The idle slot's build directory
# stays on disk for rollback, but a slot with no build at all would fail at
# boot — which is why the unit refuses to restart on that specific exit code.
systemctl enable "cds-prep@$NEXTSLOT" >/dev/null 2>&1
systemctl disable "cds-prep@$LIVE" >/dev/null 2>&1

# The old slot stops only now, with no traffic left on it. Keeping its build
# directory is deliberate: it is the previous version, ready to be switched back
# to in one sed + reload without rebuilding anything.
echo "stopping old slot $LIVE"
systemctl stop "cds-prep@$LIVE"

echo "deployed $(git log --oneline -1) on slot $NEXTSLOT"
echo "=== $(date -Is) deploy ok ==="
