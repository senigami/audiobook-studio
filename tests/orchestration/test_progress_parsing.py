# test_progress_parsing.py — formerly contained test_progress_simulation which
# was deleted (MOCKED-OUT: the test re-implemented the on_output parsing logic
# inline and tested its own copy, never calling app/orchestration code).
# Real parsing coverage lives in test_watchdog_progress_logic.py and
# test_progress_logic.py via _dispatch with live watchdog listeners.
