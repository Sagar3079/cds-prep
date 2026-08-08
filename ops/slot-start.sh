#!/usr/bin/env bash
# Starts one blue/green slot. Invoked by cds-prep@.service with the slot letter.
#
# This exists for one small reason: systemd's %i gives the unit a name, not a
# port, and a unit file has no way to map "a" to 3100. Rather than duplicate the
# whole unit twice for one differing line, the mapping lives here.
#
# The slot letter is also the build directory suffix, which the unit already set
# as NEXT_DIST_DIR. This script only has to decide the port.
set -euo pipefail

SLOT="${1:?slot letter required (a|b)}"

case "$SLOT" in
  a) PORT=3100 ;;
  b) PORT=3101 ;;
  *) echo "unknown slot '$SLOT' (expected a or b)" >&2; exit 64 ;;
esac

export PORT
export HOSTNAME="${HOSTNAME:-127.0.0.1}"
export NEXT_DIST_DIR="${NEXT_DIST_DIR:-.next-$SLOT}"

cd /opt/cds-prep

# A slot whose build directory does not exist would start, fail to serve, and be
# restarted forever by Restart=always. Say why instead.
if [ ! -d "$NEXT_DIST_DIR" ]; then
  echo "slot $SLOT: no build at $NEXT_DIST_DIR — deploy has not built this slot yet" >&2
  exit 65
fi

echo "slot $SLOT starting on 127.0.0.1:$PORT from $NEXT_DIST_DIR"
exec /usr/bin/npm run start
