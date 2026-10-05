"""Regression: waiting tasks must be admitted in FIFO (submission/first-poll)
order, not by which polling thread happens to win the race.

Bug (owner-reported, live screenshot 2026-08-26): a project with chapters
"Part 8" through "Part 19+" queued for render. After "Part 8" finished,
"Part 19" started rendering next instead of "Part 9" — an out-of-order skip
of ten chapters.

Root cause: every queued chapter's ``ChapterSynthesisTask`` shares ONE
``EngineClassSemaphore`` slot pool (``CHAPTER_ADMISSION_ENGINE_CLASS``,
sized by ``tts_parallel_cap``). Each waiting chapter's ``submit()`` call
polls ``EngineClassSemaphore.try_acquire`` independently, once per second,
in its own thread — ``try_acquire`` had no concept of arrival order, so
whichever waiting thread's poll happened to land right after a slot freed
won, regardless of which chapter had been queued (and polling) longest.
``app/orchestration/scheduler/policies.py``'s ``choose_next_task``/
``_task_sort_key`` implement FIFO-by-``submitted_at`` ordering, but that
function is never called from the actual admission path (confirmed: no
production caller besides its own module and one already-orphaned test) —
so the semaphore itself is the only place fairness can be enforced.

This test drives ``EngineClassSemaphore`` directly (the unit under test,
per R2 — no mocking of it): three tasks arrive and start polling in
submission order (A, B, C) against a cap=1 semaphore that is already full.
When the held slot is released, a LATER-arriving task's poll landing first
must NOT jump the earlier-arriving, still-waiting tasks.
"""

from __future__ import annotations

from app.orchestration.scheduler.resources import EngineClassSemaphore


def test_later_waiter_cannot_jump_earlier_still_waiting_tasks():
    sem = EngineClassSemaphore(cap=1)

    # "Part 8" holds the only slot.
    admitted, _ = sem.try_acquire("part-8")
    assert admitted is True

    # "Part 9" through "Part 19" all start waiting, in submission order —
    # each one's FIRST poll registers its place in line.
    for chapter in ["part-9", "part-10", "part-19"]:
        admitted, _ = sem.try_acquire(chapter)
        assert admitted is False, f"{chapter} should still be waiting behind part-8"

    # Part 8 finishes and releases its slot.
    sem.release("part-8")

    # part-19 polls again FIRST (it happened to win the thread-scheduling
    # race in the reported bug) — it must still be denied because part-9
    # arrived first and is still waiting.
    admitted_19, reason_19 = sem.try_acquire("part-19")
    assert admitted_19 is False, (
        "part-19 arrived after part-9 and part-10; it must not be admitted "
        f"ahead of them even if its poll lands first (reason={reason_19!r})"
    )

    # part-9 — the earliest still-waiting task — must be the one admitted.
    admitted_9, reason_9 = sem.try_acquire("part-9")
    assert admitted_9 is True, f"expected the earliest waiter (part-9) admitted, got denied: {reason_9!r}"


def test_fifo_order_holds_across_multiple_releases():
    sem = EngineClassSemaphore(cap=1)
    sem.try_acquire("leader")

    for chapter in ["c1", "c2", "c3"]:
        admitted, _ = sem.try_acquire(chapter)
        assert admitted is False

    sem.release("leader")

    # Regardless of poll order, admission must resolve in c1, c2, c3 order.
    for expected in ["c1", "c2", "c3"]:
        # Simulate the losing waiters re-polling before the winner does.
        for other in ["c1", "c2", "c3"]:
            if other == expected:
                continue
            admitted, _ = sem.try_acquire(other)
            if admitted:
                # Already released by an earlier loop iteration's winner having
                # since finished — not expected in this scenario, but guard
                # against silently passing on a broken ordering.
                sem.release(other)
                raise AssertionError(f"{other} was admitted out of FIFO order (expected {expected} next)")

        admitted_expected, reason = sem.try_acquire(expected)
        assert admitted_expected is True, f"expected {expected} admitted next, got denied: {reason!r}"
        sem.release(expected)
