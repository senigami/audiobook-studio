#!/usr/bin/env bash
# Cross-session file claims -- advisory, warn-only coordination between concurrent
# Claude Code sessions sharing this working tree. Never blocks; only informs.
# See .agent/rules/session-claims.md for the convention this implements.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLAIMS_DIR="$REPO_ROOT/.agent/active-work"
STALE_SECONDS=21600  # 6 hours -- a claim untouched this long is treated as dead, not trusted.

mkdir -p "$CLAIMS_DIR" 2>/dev/null

now_epoch() { date +%s; }

read_stdin_json() {
  cat 2>/dev/null || echo '{}'
}

# Prints a claim file's numeric updated_at, or nothing if it can't be read or
# parsed right now. Callers MUST treat empty output as "skip this file" --
# never default to 0. A file mid-write by a concurrent hook invocation (or
# any other transient read failure) is not the same as an old, dead claim;
# treating "unreadable" as "infinitely stale" is what deleted a live claim
# during concurrent-session testing. Skipping just means this file is
# reconsidered on the next hook call moments later, which is fine for an
# advisory system.
_claim_updated_at() {
  local f="$1"
  local val
  val=$(jq -r 'if (.updated_at | type) == "number" then .updated_at else empty end' "$f" 2>/dev/null)
  [ -n "$val" ] && echo "$val"
}

prune_stale() {
  local now; now=$(now_epoch)
  for f in "$CLAIMS_DIR"/*.json; do
    [ -e "$f" ] || continue
    local updated_at
    updated_at=$(_claim_updated_at "$f")
    [ -z "$updated_at" ] && continue
    if [ "$now" -gt $(( updated_at + STALE_SECONDS )) ] 2>/dev/null; then
      rm -f "$f"
    fi
  done
}

ensure_claim_file() {
  local session_id="$1"
  local claim_file="$CLAIMS_DIR/$session_id.json"
  if [ ! -e "$claim_file" ]; then
    local now; now=$(now_epoch)
    jq -n --arg sid "$session_id" --argjson now "$now" \
      '{session_id: $sid, started_at: $now, updated_at: $now, paths: [], summary: ""}' \
      > "$claim_file" 2>/dev/null
  fi
  echo "$claim_file"
}

cmd_start() {
  local payload session_id
  payload=$(read_stdin_json)
  session_id=$(echo "$payload" | jq -r '.session_id // empty' 2>/dev/null)
  if [ -z "$session_id" ]; then
    session_id="unknown-$$-$(now_epoch)"
  fi

  prune_stale
  ensure_claim_file "$session_id" > /dev/null

  local now; now=$(now_epoch)
  local lines=""
  local other_count=0
  for f in "$CLAIMS_DIR"/*.json; do
    [ -e "$f" ] || continue
    local sid; sid=$(jq -r '.session_id // ""' "$f" 2>/dev/null)
    [ "$sid" = "$session_id" ] && continue
    [ -z "$sid" ] && continue
    local updated_at; updated_at=$(_claim_updated_at "$f")
    [ -z "$updated_at" ] && continue
    if [ "$now" -le $(( updated_at + STALE_SECONDS )) ] 2>/dev/null; then
      local summary paths
      summary=$(jq -r '.summary // ""' "$f" 2>/dev/null)
      paths=$(jq -r 'if (.paths|length) == 0 then "none yet" else (.paths | join(", ")) end' "$f" 2>/dev/null)
      [ -z "$summary" ] && summary="(no summary set)"
      lines="${lines}- session ${sid}: ${summary} -- paths: ${paths}
"
      other_count=$((other_count + 1))
    fi
  done

  if [ "$other_count" -gt 0 ]; then
    local ctx
    ctx="Other Claude Code sessions currently active in this working tree (.agent/active-work/, advisory only):
${lines}These are claims, not locks. Before editing a file another session has claimed, flag the overlap to the user rather than assuming it's safe -- especially before any git operation that could discard uncommitted work in this shared tree."
    jq -n --arg ctx "$ctx" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx}}' 2>/dev/null
  fi
  exit 0
}

cmd_record() {
  local payload session_id file_path
  payload=$(read_stdin_json)
  session_id=$(echo "$payload" | jq -r '.session_id // empty' 2>/dev/null)
  [ -z "$session_id" ] && exit 0

  file_path=$(echo "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
  [ -z "$file_path" ] && exit 0

  case "$file_path" in
    "$REPO_ROOT"/*) file_path="${file_path#"$REPO_ROOT"/}" ;;
  esac

  local claim_file
  claim_file=$(ensure_claim_file "$session_id")

  local now; now=$(now_epoch)
  local tmp; tmp=$(mktemp)
  jq --arg p "$file_path" --argjson now "$now" \
    '.updated_at = $now | .paths = ((.paths + [$p]) | unique)' \
    "$claim_file" > "$tmp" 2>/dev/null && mv "$tmp" "$claim_file"

  for f in "$CLAIMS_DIR"/*.json; do
    [ -e "$f" ] || continue
    local sid; sid=$(jq -r '.session_id // ""' "$f" 2>/dev/null)
    [ "$sid" = "$session_id" ] && continue
    [ -z "$sid" ] && continue
    local updated_at; updated_at=$(_claim_updated_at "$f")
    [ -z "$updated_at" ] && continue
    if [ "$now" -gt $(( updated_at + STALE_SECONDS )) ] 2>/dev/null; then continue; fi

    local has_overlap
    has_overlap=$(jq --arg p "$file_path" '(.paths | index($p)) != null' "$f" 2>/dev/null)
    if [ "$has_overlap" = "true" ]; then
      local other_summary
      other_summary=$(jq -r '.summary // ""' "$f" 2>/dev/null)
      local ctx="Heads up: another active session ($sid) has already claimed $file_path"
      if [ -n "$other_summary" ]; then
        ctx="${ctx} -- its stated summary: \"${other_summary}\""
      fi
      ctx="${ctx}. This is advisory, not a lock. Consider flagging the overlap to the user before proceeding, and never run a destructive/shared-state git command (stash, reset, checkout -- ) without checking whether it would discard that session's uncommitted work."
      jq -n --arg ctx "$ctx" '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $ctx}}' 2>/dev/null
      exit 0
    fi
  done
  exit 0
}

cmd_stop() {
  local payload session_id
  payload=$(read_stdin_json)
  session_id=$(echo "$payload" | jq -r '.session_id // empty' 2>/dev/null)
  if [ -n "$session_id" ]; then
    rm -f "$CLAIMS_DIR/$session_id.json"
  fi
  prune_stale
  exit 0
}

cmd_on_skill() {
  # PostToolUse hook on the Skill tool: invoking session-memory is the user's
  # explicit "I'm done here" signal, so treat it the same as Stop -- delete
  # this session's claim immediately rather than waiting for real process exit
  # (which also covers checkpoint-style mid-session saves; the claim simply
  # recreates itself, empty, on the next Edit/Write if the session continues).
  local payload session_id skill
  payload=$(read_stdin_json)
  session_id=$(echo "$payload" | jq -r '.session_id // empty' 2>/dev/null)
  skill=$(echo "$payload" | jq -r '.tool_input.skill // empty' 2>/dev/null)

  case "$skill" in
    *session-memory*)
      if [ -n "$session_id" ]; then
        rm -f "$CLAIMS_DIR/$session_id.json"
      fi
      ;;
  esac
  prune_stale
  exit 0
}

cmd_summary() {
  # Manual, run by the agent (not a hook): announces what a session is working on.
  # Usage: session-claims.sh summary <session_id> "<one-line text>"
  local session_id="$1"; shift
  local text="$*"
  local claim_file
  claim_file=$(ensure_claim_file "$session_id")
  local tmp; tmp=$(mktemp)
  jq --arg s "$text" --argjson now "$(now_epoch)" '.summary = $s | .updated_at = $now' \
    "$claim_file" > "$tmp" 2>/dev/null && mv "$tmp" "$claim_file"
}

case "${1:-}" in
  start) cmd_start ;;
  record) cmd_record ;;
  stop) cmd_stop ;;
  on-skill) cmd_on_skill ;;
  summary) shift; cmd_summary "$@" ;;
  *) echo "usage: session-claims.sh {start|record|stop|on-skill|summary}" >&2; exit 1 ;;
esac
