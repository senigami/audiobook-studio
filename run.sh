#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
APP_VENV="$DIR/venv"
TTS_ENV_DIR="${XTTS_ENV_DIR:-${TTS_ENV_DIR:-$HOME/xtts-env}}"
FRONTEND_DIR="$DIR/frontend"
APP_PORT="${AUDIOBOOK_STUDIO_PORT:-8123}"
APP_HOST="${AUDIOBOOK_STUDIO_HOST:-0.0.0.0}"
DEMO_ZIP="${AUDIOBOOK_STUDIO_DEMO_ZIP:-$DIR/demo/demo.zip}"
BOOTSTRAP_PYTHON_ENV="$DIR/.pinokio-python311"
RELOAD=1
SETUP_ONLY=0

log() {
  # Write progress to stderr so it never pollutes command substitutions
  # like XTTS_TORCH_ARGS="$(select_torch_backend)" (which prints args to stdout).
  printf '\n==> %s\n' "$1" >&2
}

die() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

ffmpeg_install_help() {
  cat <<'EOF'
FFmpeg is required for audio conversion and audiobook assembly.

Install it with your platform package manager or from:
  https://ffmpeg.org/download.html

Then open a new shell and rerun:
  ./run.sh
EOF
}

usage() {
  cat <<EOF
Audiobook Studio bootstrap and startup script

Usage:
  ./run.sh [--setup-only] [--no-reload] [--port <port>] [--host <host>] [--help]

Options:
  --setup-only   Install/update dependencies and build the frontend, but do not start the server
  --no-reload    Start uvicorn without --reload
  --port <port>  Override the default port (default: ${APP_PORT})
  --host <host>  Interface to bind (default: 0.0.0.0 — reachable from other machines on
                 your network via this Mac's LAN IP, e.g. http://192.168.x.x:${APP_PORT},
                 while still serving http://127.0.0.1:${APP_PORT} locally). macOS may
                 prompt to allow incoming network connections the first time. Pass
                 --host 127.0.0.1 to restrict this machine only.
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
    --host)
      [[ $# -ge 2 ]] || die "--host requires a value"
      APP_HOST="$2"
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
    if "$candidate" - <<'PY'
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

  if [[ -x "$python_exe" ]] && "$python_exe" - <<'PY'
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

ensure_ffmpeg_ready() {
  if ! command -v ffmpeg >/dev/null 2>&1; then
    die "$(ffmpeg_install_help)"
  fi
}

sync_python_requirements() {
  local env_dir="$1"
  local requirements_file="$2"
  local label="$3"
  local extra_pip_args="${4:-}"
  local stamp_file="$env_dir/.requirements.stamp"
  local python_exe="$env_dir/bin/python"
  local check_script="$(dirname "$requirements_file")/scripts/check_env.py"

  if [[ -f "$check_script" ]] && [[ -x "$python_exe" ]]; then
    if "$python_exe" "$check_script" conflicts; then
      log "Resetting ${label} environment due to detected conflicts"
      rm -rf "$env_dir"
    fi
  fi

  if [[ ! -x "$env_dir/bin/python" ]]; then
    log "Creating ${label} environment"
    "$PYTHON_BIN" -m venv "$env_dir"
  fi

  if [[ ! -f "$stamp_file" ]] || ! cmp -s "$requirements_file" "$stamp_file"; then
    log "Installing ${label} dependencies"
    "$env_dir/bin/python" -m pip install --upgrade pip
    if [[ -n "$extra_pip_args" ]]; then
      # shellcheck disable=SC2086
      "$env_dir/bin/python" -m pip install $extra_pip_args -r "$requirements_file"
    else
      "$env_dir/bin/python" -m pip install -r "$requirements_file"
    fi
    cp "$requirements_file" "$stamp_file"
  else
    log "${label} dependencies already up to date"
  fi
}

# Detect the appropriate torch backend and return extra pip args for the XTTS install.
# Override: set TORCH_BACKEND=cuda|mps|cpu to skip detection.
select_torch_backend() {
  local override="${TORCH_BACKEND:-}"
  if [[ -n "$override" ]]; then
    log "Torch backend override: ${override}"
  elif command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
    override="cuda"
  elif [[ "$(uname -s)" == "Darwin" ]] && [[ "$(uname -m)" == "arm64" ]]; then
    override="mps"
  else
    override="cpu"
  fi

  case "$override" in
    cuda)
      log "Torch backend: CUDA (nvidia-smi detected) — using https://download.pytorch.org/whl/cu128"
      printf '%s' "--index-url https://download.pytorch.org/whl/cu128"
      ;;
    mps)
      log "Torch backend: MPS (Darwin arm64) — using default PyPI wheels"
      printf '%s' ""
      ;;
    cpu)
      log "Torch backend: CPU-only — using https://download.pytorch.org/whl/cpu"
      printf '%s' "--index-url https://download.pytorch.org/whl/cpu"
      ;;
    *)
      log "Torch backend: unknown override '${override}'; falling back to default PyPI wheels"
      printf '%s' ""
      ;;
  esac
}

ensure_frontend_ready() {
  local lockfile="$FRONTEND_DIR/package-lock.json"
  local install_stamp="$FRONTEND_DIR/node_modules/.install.stamp"
  local dist_index="$FRONTEND_DIR/dist/index.html"
  local needs_build=0
  local has_npm=0

  if command -v npm >/dev/null 2>&1; then
    has_npm=1
  fi

  if [[ ! -d "$FRONTEND_DIR/node_modules" ]] || [[ ! -f "$install_stamp" ]] || ! cmp -s "$lockfile" "$install_stamp"; then
    if [[ "$has_npm" -eq 0 ]]; then
      if [[ -f "$dist_index" ]]; then
        log "npm is not installed; using the bundled frontend build"
        return 0
      fi
      die "Missing required command: npm"
    fi
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
    if [[ "$has_npm" -eq 0 ]]; then
      if [[ -f "$dist_index" ]]; then
        log "npm is not installed; using the bundled frontend build instead of rebuilding"
        return 0
      fi
      die "Missing required command: npm"
    fi
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

  if ! ( cd "$DIR" && "$PYTHON_BIN" -m app.domain.demo_bundle status --base-dir "$DIR" ); then
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
  ( cd "$DIR" && "$PYTHON_BIN" -m app.domain.demo_bundle restore --base-dir "$DIR" --zip "$DEMO_ZIP" )
}

require_cmd bash

PYTHON_BIN="$(pick_python || bootstrap_conda_python)"
[[ -n "$PYTHON_BIN" ]] || die "Python 3.11+ is required. Please install Python 3.11 or newer, or use Pinokio's AI bundle with conda support."

log "Using Python: $PYTHON_BIN"
ensure_ffmpeg_ready
sync_python_requirements "$APP_VENV" "$DIR/requirements.txt" "app"
XTTS_TORCH_ARGS="$(select_torch_backend)"
sync_python_requirements "$TTS_ENV_DIR" "$DIR/tts_engines/tts_xtts/requirements.txt" "XTTS" "$XTTS_TORCH_ARGS"
ensure_frontend_ready
maybe_restore_demo_bundle

if [[ "$SETUP_ONLY" -eq 1 ]]; then
  log "Setup complete"
  exit 0
fi

if [[ "$APP_HOST" == "0.0.0.0" ]]; then
  log "Starting Audiobook Studio on http://127.0.0.1:${APP_PORT} (also reachable via this machine's LAN IP)"
else
  log "Starting Audiobook Studio on http://${APP_HOST}:${APP_PORT}"
fi
cd "$DIR"

if [[ "$RELOAD" -eq 1 ]]; then
  exec "$APP_VENV/bin/uvicorn" run:app --reload --host "$APP_HOST" --port "$APP_PORT"
else
  exec "$APP_VENV/bin/uvicorn" run:app --host "$APP_HOST" --port "$APP_PORT"
fi
