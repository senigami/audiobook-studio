#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
APP_VENV="$DIR/venv"
XTTS_VENV="${XTTS_ENV_DIR:-$HOME/xtts-env}"
FRONTEND_DIR="$DIR/frontend"
APP_PORT="${AUDIOBOOK_STUDIO_PORT:-8123}"
DEMO_ZIP="${AUDIOBOOK_STUDIO_DEMO_ZIP:-$DIR/demo/demo.zip}"
BOOTSTRAP_PYTHON_ENV="$DIR/.pinokio-python311"
RELOAD=1
SETUP_ONLY=0

log() {
  printf '\n==> %s\n' "$1"
}

die() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<EOF
Audiobook Studio bootstrap and startup script

Usage:
  ./run.sh [--setup-only] [--no-reload] [--port <port>] [--help]

Options:
  --setup-only   Install/update dependencies and build the frontend, but do not start the server
  --no-reload    Start uvicorn without --reload
  --port <port>  Override the default port (default: ${APP_PORT})
  --help         Show this help text
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --setup-only)
      SETUP_ONLY=1
      shift
      ;;
    --no-reload)
      RELOAD=0
      shift
      ;;
    --port)
      [[ $# -ge 2 ]] || die "--port requires a value"
      APP_PORT="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

pick_python() {
  local candidate
  for candidate in python3.11 python3 python; do
    if ! command -v "$candidate" >/dev/null 2>&1; then
      continue
    fi
    if "$candidate" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 11) else 1)
PY
    then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

bootstrap_conda_python() {
  local conda_cmd=""
  local python_exe="$BOOTSTRAP_PYTHON_ENV/bin/python"

  if command -v mamba >/dev/null 2>&1; then
    conda_cmd="mamba"
  elif command -v conda >/dev/null 2>&1; then
    conda_cmd="conda"
  else
    return 1
  fi

  if [[ -x "$python_exe" ]] && "$python_exe" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 11) else 1)
PY
  then
    printf '%s\n' "$python_exe"
    return 0
  fi

  log "Creating bundled Python 3.11 environment"
  if ! "$conda_cmd" create -y -p "$BOOTSTRAP_PYTHON_ENV" python=3.11 pip; then
    [[ -d "$BOOTSTRAP_PYTHON_ENV" ]] && rm -rf "$BOOTSTRAP_PYTHON_ENV"
    return 1
  fi
  if [[ ! -x "$python_exe" ]]; then
    [[ -d "$BOOTSTRAP_PYTHON_ENV" ]] && rm -rf "$BOOTSTRAP_PYTHON_ENV"
    return 1
  fi
  printf '%s\n' "$python_exe"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

xtts_env_has_conflicts() {
  local env_dir="$1"
  local python_exe="$env_dir/bin/python"

  [[ -x "$python_exe" ]] || return 1

  "$python_exe" - <<'PY' >/dev/null 2>&1
from importlib import metadata

conflicting_dists = []
for dist_name in ("coqpit", "trainer", "TTS"):
    try:
        metadata.distribution(dist_name)
    except metadata.PackageNotFoundError:
        continue
    else:
        conflicting_dists.append(dist_name)

raise SystemExit(0 if conflicting_dists else 1)
PY
}

sync_python_requirements() {
  local env_dir="$1"
  local requirements_file="$2"
  local label="$3"
  local stamp_file="$env_dir/.requirements.stamp"

  if [[ "$label" == "XTTS" ]] && xtts_env_has_conflicts "$env_dir"; then
    log "Resetting XTTS environment to remove stale Coqui packages"
    rm -rf "$env_dir"
  fi

  if [[ ! -x "$env_dir/bin/python" ]]; then
    log "Creating ${label} environment"
    "$PYTHON_BIN" -m venv "$env_dir"
  fi

  if [[ ! -f "$stamp_file" ]] || ! cmp -s "$requirements_file" "$stamp_file"; then
    log "Installing ${label} dependencies"
    "$env_dir/bin/python" -m pip install --upgrade pip
    "$env_dir/bin/python" -m pip install -r "$requirements_file"
    cp "$requirements_file" "$stamp_file"
  else
    log "${label} dependencies already up to date"
  fi
}

ensure_frontend_ready() {
  local lockfile="$FRONTEND_DIR/package-lock.json"
  local install_stamp="$FRONTEND_DIR/node_modules/.install.stamp"
  local dist_index="$FRONTEND_DIR/dist/index.html"
  local needs_build=0

  if [[ ! -d "$FRONTEND_DIR/node_modules" ]] || [[ ! -f "$install_stamp" ]] || ! cmp -s "$lockfile" "$install_stamp"; then
    log "Installing frontend dependencies"
    (
      cd "$FRONTEND_DIR"
      npm install
    )
    cp "$lockfile" "$install_stamp"
    needs_build=1
  else
    log "Frontend dependencies already up to date"
  fi

  if [[ ! -f "$dist_index" ]]; then
    needs_build=1
  elif [[ "$FRONTEND_DIR/package.json" -nt "$dist_index" ]] || [[ "$lockfile" -nt "$dist_index" ]] || [[ "$FRONTEND_DIR/index.html" -nt "$dist_index" ]]; then
    needs_build=1
  elif find "$FRONTEND_DIR/src" -type f -newer "$dist_index" -print -quit | grep -q .; then
    needs_build=1
  fi

  if [[ "$needs_build" -eq 1 ]]; then
    log "Building frontend"
    (
      cd "$FRONTEND_DIR"
      npm run build
    )
  else
    log "Frontend build already up to date"
  fi
}

maybe_restore_demo_bundle() {
  local install_demo="${AUDIOBOOK_STUDIO_INSTALL_DEMO:-ask}"

  [[ -f "$DEMO_ZIP" ]] || return 0

  if ! "$PYTHON_BIN" -m app.demo_bundle status --base-dir "$DIR" >/dev/null 2>&1; then
    return 0
  fi

  case "$install_demo" in
    1|true|TRUE|yes|YES)
      ;;
    0|false|FALSE|no|NO)
      log "Skipping demo library install"
      return 0
      ;;
    *)
      if [[ ! -t 0 ]]; then
        log "No interactive terminal detected; installing demo library by default"
      else
        printf '\nNo existing library was found. Install the demo library? [Y/n] '
        read -r reply
        if [[ -n "$reply" ]] && [[ ! "$reply" =~ ^[Yy]([Ee][Ss])?$ ]]; then
          log "Starting with an empty library"
          return 0
        fi
      fi
      ;;
  esac

  log "Installing demo library"
  "$PYTHON_BIN" -m app.demo_bundle restore --base-dir "$DIR" --zip "$DEMO_ZIP"
}

require_cmd bash
require_cmd npm
require_cmd ffmpeg

PYTHON_BIN="$(pick_python || bootstrap_conda_python)" || die "Python 3.11+ is required. Please install Python 3.11 or newer, or use Pinokio's AI bundle with conda support."

log "Using Python: $PYTHON_BIN"
sync_python_requirements "$APP_VENV" "$DIR/requirements.txt" "app"
sync_python_requirements "$XTTS_VENV" "$DIR/requirements-xtts.txt" "XTTS"
ensure_frontend_ready
maybe_restore_demo_bundle

if [[ "$SETUP_ONLY" -eq 1 ]]; then
  log "Setup complete"
  exit 0
fi

log "Starting Audiobook Studio on http://127.0.0.1:${APP_PORT}"
cd "$DIR"

if [[ "$RELOAD" -eq 1 ]]; then
  exec "$APP_VENV/bin/uvicorn" run:app --reload --port "$APP_PORT"
else
  exec "$APP_VENV/bin/uvicorn" run:app --port "$APP_PORT"
fi
