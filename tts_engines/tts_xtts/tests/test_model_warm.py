"""Tests for XttsPlugin.model_warm()."""
from __future__ import annotations
import threading
from unittest.mock import patch, MagicMock
import pytest


def test_model_warm_returns_false_when_manager_not_initialized():
    """model_warm() returns False when the warm worker manager is None."""
    with patch("tts_engines.tts_xtts.plugin.core.implementation._warm_worker_manager", None):
        from tts_engines.tts_xtts.plugin.server.engine import XttsPlugin
        plugin = XttsPlugin()
        assert plugin.model_warm() is False


def test_model_warm_returns_true_when_manager_is_ready():
    """model_warm() returns True when the manager reports is_model_ready()."""
    mock_mgr = MagicMock()
    mock_mgr.is_model_ready.return_value = True
    with patch("tts_engines.tts_xtts.plugin.core.implementation._warm_worker_manager", mock_mgr):
        from tts_engines.tts_xtts.plugin.server.engine import XttsPlugin
        plugin = XttsPlugin()
        assert plugin.model_warm() is True


def test_model_warm_returns_false_when_manager_says_cold():
    """model_warm() returns False when the manager reports is_model_ready() False."""
    mock_mgr = MagicMock()
    mock_mgr.is_model_ready.return_value = False
    with patch("tts_engines.tts_xtts.plugin.core.implementation._warm_worker_manager", mock_mgr):
        from tts_engines.tts_xtts.plugin.server.engine import XttsPlugin
        plugin = XttsPlugin()
        assert plugin.model_warm() is False


def test_model_warm_fails_open_on_exception():
    """model_warm() returns False (not raises) if is_model_ready() raises."""
    mock_mgr = MagicMock()
    mock_mgr.is_model_ready.side_effect = Exception("oops")
    with patch("tts_engines.tts_xtts.plugin.core.implementation._warm_worker_manager", mock_mgr):
        from tts_engines.tts_xtts.plugin.server.engine import XttsPlugin
        plugin = XttsPlugin()
        assert plugin.model_warm() is False
