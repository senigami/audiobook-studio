#!/usr/bin/env bash
# Fetch one file record from the sharded code map: lookup.sh <repo-relative-path>
# Routes via longest-prefix match against meta.shards in map.json, then jq's the shard.
set -euo pipefail
MAP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
path="${1:?usage: lookup.sh <repo-relative-path>}"

shard=$(jq -r --arg p "$path" '
  .meta.shards
  | map(select(.prefix as $pre | $p | startswith($pre)))
  | max_by(.prefix | length)
  | .path' "$MAP_DIR/map.json")

jq --arg p "$path" '.files[$p]' "$MAP_DIR/$shard"
