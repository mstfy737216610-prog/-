#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"

if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  . .venv/bin/activate
fi
PY="$(command -v python3 || command -v python || echo "python")"
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env || true
fi
if [ ! -f dist/index.html ]; then
  bash build_frontend.sh
fi

export PLAYWRIGHT_BROWSERS_PATH=0
"$PY" -m automation doctor || true
HOST_VALUE="$("$PY" - <<'PYCODE'
from automation.config import get_settings
print(get_settings().host)
PYCODE
)"
PORT_VALUE="$("$PY" - <<'PYCODE'
from automation.config import get_settings
print(get_settings().port)
PYCODE
)"
printf '\nمرسال يعمل على http://%s:%s — أوقفه بـ Ctrl+C\n' "$HOST_VALUE" "$PORT_VALUE"
exec "$PY" -m automation serve
