"""Tests for state_performance.seconds_per_char — three-branch contract."""
import os
import uuid
import pytest


@pytest.fixture
def isolated_studio_db(tmp_path):
    """Provide a fresh isolated studio DB for each test."""
    studio_db_path = tmp_path / f"studio_{uuid.uuid4().hex}.db"
    os.environ["STUDIO_DB_PATH"] = str(studio_db_path)

    import app.db.core
    import importlib
    importlib.reload(app.db.core)
    app.db.core.init_db()

    yield studio_db_path

    if studio_db_path.exists():
        try:
            os.unlink(studio_db_path)
        except OSError:
            pass


class TestSecondsPerChar:
    """Pin the three resolution branches of seconds_per_char."""

    def test_warm_path_returns_inverse_of_recorded_cps(self, isolated_studio_db):
        """Branch 1: engine_cps has a positive entry → return 1/cps."""
        from app.db.state_performance import seconds_per_char, update_performance_metrics

        update_performance_metrics(engine_cps={"xtts": 16.7})

        result = seconds_per_char("xtts")

        assert result is not None
        assert abs(result - 1.0 / 16.7) < 1e-9

    def test_cold_with_fallback_returns_inverse_of_fallback_cps(self, isolated_studio_db):
        """Branch 2: engine_cps empty, fallback_cps provided → return 1/fallback_cps."""
        from app.db.state_performance import seconds_per_char

        # No engine_cps recorded — DB is fresh.
        result = seconds_per_char("xtts", fallback_cps=16.7)

        assert result is not None
        assert abs(result - 1.0 / 16.7) < 1e-9

    def test_cold_without_fallback_returns_none(self, isolated_studio_db):
        """Branch 3: engine_cps empty, no fallback → return None."""
        from app.db.state_performance import seconds_per_char

        # No engine_cps recorded — DB is fresh, no fallback supplied.
        result = seconds_per_char("xtts")

        assert result is None

    def test_warm_path_takes_precedence_over_fallback(self, isolated_studio_db):
        """When engine_cps is populated, fallback_cps is ignored."""
        from app.db.state_performance import seconds_per_char, update_performance_metrics

        update_performance_metrics(engine_cps={"xtts": 16.7})

        # Provide a different fallback — the warm path should win.
        result = seconds_per_char("xtts", fallback_cps=5.0)

        assert result is not None
        assert abs(result - 1.0 / 16.7) < 1e-9

    def test_zero_or_negative_cps_skips_to_fallback(self, isolated_studio_db):
        """A non-positive recorded CPS is treated as unusable; fallback is used instead."""
        from app.db.state_performance import seconds_per_char, update_performance_metrics

        # Manually inject a bogus zero CPS via update (tests the guard in the reader).
        # We update the dict directly so that the DB has the bad value.
        update_performance_metrics(engine_cps={"xtts": 0.0})

        result = seconds_per_char("xtts", fallback_cps=16.7)

        # 0.0 is not positive, so fallback should be used.
        assert result is not None
        assert abs(result - 1.0 / 16.7) < 1e-9

    def test_zero_or_negative_fallback_returns_none(self, isolated_studio_db):
        """A non-positive fallback_cps is treated as unusable and returns None."""
        from app.db.state_performance import seconds_per_char

        assert seconds_per_char("xtts", fallback_cps=0.0) is None
        assert seconds_per_char("xtts", fallback_cps=-1.0) is None

    def test_unknown_engine_with_fallback(self, isolated_studio_db):
        """An engine with no recorded CPS but a valid fallback returns 1/fallback."""
        from app.db.state_performance import seconds_per_char, update_performance_metrics

        # Populate a different engine so the dict is non-empty, but not ours.
        update_performance_metrics(engine_cps={"other_engine": 20.0})

        result = seconds_per_char("xtts", fallback_cps=16.7)

        assert result is not None
        assert abs(result - 1.0 / 16.7) < 1e-9
