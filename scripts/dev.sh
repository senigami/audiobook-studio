#!/bin/bash

# Function to kill background processes on exit
cleanup() {
    echo "Stopping servers..."
    kill $(jobs -p) 2>/dev/null
}

# Trap SIGINT (Ctrl+C) and call cleanup
trap cleanup SIGINT EXIT

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

find_available_port() {
    local start_port="${1:-8123}"
    local attempts="${2:-50}"
    local port="$start_port"
    local end_port=$((start_port + attempts))

    while [ "$port" -lt "$end_port" ]; do
        if ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
            echo "$port"
            return 0
        fi
        port=$((port + 1))
    done

    return 1
}

BACKEND_PORT="${BACKEND_PORT:-$(find_available_port 8123 100)}"
if [ -z "$BACKEND_PORT" ]; then
    echo "Unable to find an available backend port starting at 8123." >&2
    exit 1
fi

FRONTEND_PORT="${FRONTEND_PORT:-$(find_available_port 5173 100)}"
if [ -z "$FRONTEND_PORT" ]; then
    echo "Unable to find an available frontend port starting at 5173." >&2
    exit 1
fi

export VITE_BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
export VITE_BACKEND_WS_URL="ws://127.0.0.1:${BACKEND_PORT}"
export VITE_FRONTEND_PORT="$FRONTEND_PORT"

# Start Backend
echo "Starting Backend (Uvicorn) on ${VITE_BACKEND_URL}..."
cd "$PROJECT_ROOT"
source venv/bin/activate
uvicorn run:app --host 127.0.0.1 --port "$BACKEND_PORT" --reload &
BACKEND_PID=$!

# Start Frontend
echo "Starting Frontend (Vite) on http://127.0.0.1:${FRONTEND_PORT}/ with backend proxy ${VITE_BACKEND_URL}..."
cd "$PROJECT_ROOT/frontend"
npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort &
FRONTEND_PID=$!

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
