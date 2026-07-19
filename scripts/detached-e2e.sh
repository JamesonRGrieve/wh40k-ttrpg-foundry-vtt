#!/usr/bin/env bash
# Fire a Tier B e2e run in a NEW session (setsid) so it survives the parent
# shell / harness reaping its process group, then exit immediately. The real
# run's progress goes to the log file passed as $1; remaining args are the
# run-e2e.sh filter/grep arguments. Poll the log from separate shells.
#
#   scripts/detached-e2e.sh /tmp/run.log roll-transparency -g dh1
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$1"; shift
: > "${LOG}"
# The whole run (and its DETACHED_EXIT sentinel) is written by the inner bash to
# ${LOG}; setsid's own fds go to /dev/null so no stray line races to the top of
# the log. \$? is escaped so the INNER shell captures run-e2e.sh's real exit.
FILTERS="$*"
setsid bash -c "cd '${SCRIPT_DIR}' && HOME=/home/jameson E2E_SKIP_BUILD=1 bash scripts/run-e2e.sh ${FILTERS} >> '${LOG}' 2>&1; echo \"DETACHED_EXIT=\$?\" >> '${LOG}'" < /dev/null > /dev/null 2>&1 &
echo "detached pid $! → ${LOG}"
