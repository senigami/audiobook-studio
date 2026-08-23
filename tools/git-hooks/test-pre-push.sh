#!/usr/bin/env bash
# Regression suite for the pre-push hook. Run it from the repo root:
#
#     bash tools/git-hooks/test-pre-push.sh
#
# Why this exists. Three separate defects shipped in that hook, all the same shape:
# a command failed, its failure printed nothing, and nothing is exactly what a clean
# result prints, so a gate that never ran reported a pass. Reasoning about shell exit
# statuses did not catch any of the three; running the paths caught all three. Every
# case below is a defect that actually happened or a path adjacent to one.
#
# Add a case here whenever a new way to skip a gate is found. Never delete one.
set -uo pipefail

HOOK="${HOOK:-tools/git-hooks/pre-push}"
LOCAL="$(git rev-parse HEAD)"
PREV="$(git rev-parse HEAD~2 2>/dev/null || git rev-parse HEAD)"
ZERO="0000000000000000000000000000000000000000"
UNKNOWN="deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
PASS=0; FAIL=0

# check <name> <expected-exit> <expected-substring-or-empty> <stdin>
check() {
    local name="$1" want_rc="$2" want_txt="$3" input="$4" out rc
    out="$(printf '%s' "$input" | bash "$HOOK" 2>&1)"; rc=$?
    local ok=1
    [ "$rc" -eq "$want_rc" ] || ok=0
    if [ -n "$want_txt" ]; then case "$out" in *"$want_txt"*) ;; *) ok=0 ;; esac; fi
    if [ "$ok" -eq 1 ]; then
        echo "  pass  $name"; PASS=$((PASS+1))
    else
        echo "  FAIL  $name (exit $rc, wanted $want_rc; wanted text: '$want_txt')"
        echo "$out" | sed 's/^/          /'
        FAIL=$((FAIL+1))
    fi
}

echo "pre-push regression suite"

# The three that actually shipped broken.
check "unknown remote sha blocks instead of reporting a clean pass" \
      1 "NO gate ran" "refs/heads/x $LOCAL refs/heads/x $UNKNOWN
"
check "a push of refs from stdin is gated (not the current branch's upstream)" \
      0 "pushed ref(s)" "refs/heads/x $LOCAL refs/heads/x $PREV
"
check "the tracked-links gate runs and reports" \
      0 "tracked links resolve" "refs/heads/x $LOCAL refs/heads/x $ZERO
"

# Paths adjacent to those, each able to skip every gate if wrong.
check "new branch gates against origin/studio-2.0" \
      0 "Pre-push gates" "refs/heads/x $LOCAL refs/heads/x $ZERO
"
check "deletion-only push exits early and does NOT fall back to the working tree" \
      0 "Only branch deletion" "refs/heads/x $ZERO refs/heads/x $LOCAL
"
check "a deletion alongside a real ref still gates the real one" \
      0 "Pre-push gates" "refs/heads/a $ZERO refs/heads/a $LOCAL
refs/heads/b $LOCAL refs/heads/b $PREV
"
check "multiple pushed refs are all gated" \
      0 "2 pushed ref(s)" "refs/heads/a $LOCAL refs/heads/a $PREV
refs/heads/b $LOCAL refs/heads/b $ZERO
"
check "hand invocation with no stdin labels itself a fallback" \
      0 "invoked by hand" ""

# The inverted default: reaching the end having run nothing must FAIL, not pass.
check "a normal gated run reports how many gates actually ran" \
      0 "gate(s) passed" "refs/heads/x $LOCAL refs/heads/x $PREV
"

# The gate must distinguish "no matches" from "the search itself failed".
# Extract and eval the REAL function out of the hook rather than reimplementing it here.
# A copy of the logic would pass while the shipped hook was broken, which is the same
# class of false pass this whole file exists to catch.
echo "  ---- tracked-links gate, exit-status handling (real function, extracted)"
eval "$(sed -n '/^gate_tracked_links() {/,/^}/p' "$HOOK")"
if ! declare -f gate_tracked_links >/dev/null; then
    echo "  FAIL  could not extract gate_tracked_links from $HOOK (did it get renamed?)"
    FAIL=$((FAIL+1))
else
    gate_tracked_links >/dev/null 2>&1
    if [ $? -eq 0 ]; then echo "  pass  the real gate comes back clean on this tree"; PASS=$((PASS+1))
    else echo "  FAIL  the real gate reports tracked links into the local layer"; FAIL=$((FAIL+1)); fi

    # THE SAME function, driven with a search git grep cannot compile. Must fail, not pass.
    gate_tracked_links '[' >/dev/null 2>&1
    if [ $? -ne 0 ]; then echo "  pass  a search that cannot run is a failure, not a clean sweep"; PASS=$((PASS+1))
    else echo "  FAIL  a broken search reported a clean pass"; FAIL=$((FAIL+1)); fi
fi

echo ""
if [ "$FAIL" -gt 0 ]; then echo "$FAIL failed, $PASS passed"; exit 1; fi
echo "all $PASS passed"
