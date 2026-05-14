from unittest.mock import patch

from app.engines.behavior import parse_engine_progress


def test_parse_engine_progress_logic() -> None:
    with patch("app.engines.behavior.get_progress_pattern", return_value=r"\[PROGRESS\]\s*(?P<value>\d+)\s*%"):
        assert parse_engine_progress("any", "[PROGRESS] 45%") == 0.45
        assert parse_engine_progress("any", "Some other noise [PROGRESS] 100% more noise") == 1.0
        assert parse_engine_progress("any", "[PROGRESS] 0%") == 0.0
        assert parse_engine_progress("any", "No progress here") is None

    with patch("app.engines.behavior.get_progress_pattern", return_value=r"Status:\s*(-?\d+\.\d+)"):
        assert parse_engine_progress("any", "Status: 0.75") == 0.75
        assert parse_engine_progress("any", "Status: 1.2") == 1.0
        assert parse_engine_progress("any", "Status: -0.1") == 0.0

    with patch("app.engines.behavior.get_progress_pattern", return_value=r"Done:\s*(\d+)%"):
        assert parse_engine_progress("any", "Done: 85%") == 0.85
        assert parse_engine_progress("any", "Done: 1%") == 0.01


def test_parse_engine_progress_invalid_patterns() -> None:
    with patch("app.engines.behavior.get_progress_pattern", return_value=r"\[PROGRESS\]\s*(\D+)"):
        assert parse_engine_progress("any", "[PROGRESS] abc") is None

    with patch("app.engines.behavior.get_progress_pattern", return_value=None):
        assert parse_engine_progress("any", "[PROGRESS] 45%") == 0.45
