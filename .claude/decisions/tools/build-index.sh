#!/usr/bin/env bash
# Regenerate a decision log's INDEX.md from the decision files themselves.
#
# Drop this in your log directory as `tools/build-index.sh` and run it at closeout, or any time a
# record is added or superseded. It is deliberately convention-agnostic, because the estates that use
# it disagree on two things and both are fine:
#
#   * file naming: `0007-some-ruling.md` or `OD-0007-some-ruling.md` (both detected)
#   * series prefix: OD (a repo's orchestration log), GD (a user-global log), or anything else
#     via PREFIX=.  Never ADR: a product ADR series starting at 0001 alongside a decision series
#     starting at 0001 is a citation collision, and remapping afterward is its own disaster, since
#     every wrong citation still names a real record and still resolves.
#
# NEVER hand-edit the generated INDEX.md. A hand-kept index drifts, and a stale index is worse than
# none: a session greps it, finds nothing, and silently reverses a decision filed under a scope the
# index dropped. The check is only as good as the index is honest.
#
# Usage:  tools/build-index.sh            # auto-detects prefix from the filenames present
#         PREFIX=GD tools/build-index.sh  # force it
#         RESERVED="0008 0009" tools/build-index.sh   # numbers never issued; see below
set -euo pipefail
cd "$(dirname "$0")/.."

shopt -s nullglob
FILES=( [0-9][0-9][0-9][0-9]-*.md )
NUMBERED_BARE=1
if [ ${#FILES[@]} -eq 0 ]; then
  FILES=( [A-Z][A-Z]-[0-9][0-9][0-9][0-9]-*.md )
  NUMBERED_BARE=0
fi
[ ${#FILES[@]} -eq 0 ] && { echo "no decision files found in $(pwd)" >&2; exit 1; }

# Prefix: honor $PREFIX, else read it out of the first file's H1 ("# OD-0001: ...").
PREFIX="${PREFIX:-$(sed -n '1s/^# \([A-Z][A-Z]*\)-[0-9].*/\1/p' "${FILES[0]}")}"
PREFIX="${PREFIX:-OD}"

# A pipe in any interpolated field would silently break the row and shift every later column,
# so escape rather than trusting future scope lines to be pipe-free.
esc() { sed 's/|/\\|/g'; }

{
  echo "# Decision index — GENERATED, do not hand-edit"
  echo
  echo "Regenerate with \`tools/build-index.sh\`. **Grep this file by scope before adding a rule** to any"
  echo "auto-loaded spec, and open only the records that match. The Ruling column is each entry's TITLE:"
  echo "the operative wording is the \`Decision:\` field inside the file, and only that is authoritative."
  echo
  echo "\`${PREFIX}-NNNN\` is deliberately a different series from any product \`ADR-NNNN\`. Never cite one as"
  echo "the other."
  if [ -n "${RESERVED:-}" ]; then
    echo
    echo "**Numbers never issued, permanently RESERVED: ${RESERVED}.** Do NOT reuse them and do NOT renumber to"
    echo "close the gap. Any citation to them written before the gap was noticed would silently resolve to the"
    echo "wrong record, and no structural check catches that."
  fi
  echo
  echo "| ${PREFIX} | Status | Scope | Ruling (title) | Disconf. | Undo |"
  echo "|---|---|---|---|---|---|"
  for f in "${FILES[@]}"; do
    if [ "$NUMBERED_BARE" -eq 1 ]; then num="${f%%-*}"; else num=$(echo "$f" | sed 's/^[A-Z]*-\([0-9]*\).*/\1/'); fi
    title=$(sed -n "1s/^# ${PREFIX}-[0-9]*: *//p" "$f" | esc)
    status=$(sed -n 's/^Status: *//p' "$f" | head -1 | sed 's/  *Date:.*//; s/ *$//' | esc)
    # Scope may wrap over several lines. Stop at the first blank line or the next field header.
    # Done in awk on purpose: `sed '/a/,/^\(b\|$\)/'` relies on GNU alternation in a BRE, which BSD
    # sed (macOS) does not support, so the end pattern silently never matches and the whole rest of
    # the file lands in this column. Found the hard way, on the first repo this script was copied to.
    scope=$(awk '
      /^Scope:/ { inside = 1; sub(/^Scope: */, ""); print; next }
      inside {
        if ($0 ~ /^[[:space:]]*$/) exit
        if ($0 ~ /^(Context|Decision|Consequences|Removed|Replaced|Disconfirming|Status)/) exit
        print
      }' "$f" | tr '\n' ' ' | sed 's/  */ /g; s/ *$//' | esc)
    grep -q 'Disconfirming evidence:' "$f" && dis="yes" || dis="**no**"
    # Undo column is meaningful only for logs guarding an UNVERSIONED layer, where the record is the
    # only history. A compression needs both sides, or a replay restores old text alongside its
    # replacement and you get a hybrid.
    if grep -q '^Removed (verbatim):' "$f"; then
      grep -q '^Replaced by' "$f" && undo="replayable" || undo="deletion only"
    else undo="—"; fi
    printf '| [%s-%s](%s) | %s | %s | %s | %s | %s |\n' "$PREFIX" "$num" "$f" "$status" "$scope" "$title" "$dis" "$undo"
  done
} > INDEX.md

missing=$(grep -L 'Disconfirming evidence:' "${FILES[@]}" 2>/dev/null || true)
if [ -n "$missing" ]; then
  echo "note: no 'Disconfirming evidence:' line (add on next edit; see decision-log-retrofit.md for the two traps):" >&2
  echo "$missing" | sed 's/^/  /' >&2
fi
for f in "${FILES[@]}"; do
  if grep -qiE '^(Removed|Compressed|Deleted)' "$f" && ! grep -q '^Removed (verbatim):' "$f"; then
    echo "WARNING: $f mentions a removal with no 'Removed (verbatim):' block — not replayable" >&2
  fi
done
echo "INDEX.md regenerated: $(grep -c "^| \[${PREFIX}-" INDEX.md) decisions" >&2
