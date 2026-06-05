
from importlib import metadata
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.tts_server.plugin_loader import _check_dependencies


def test_check_dependencies_uses_direct_reference_distribution_name(tmp_path, monkeypatch):
    req_file = tmp_path / "requirements.txt"
    req_file.write_text(
        "requests>=2.31.0\n"
        "coqui-tts @ git+https://github.com/idiap/coqui-ai-TTS.git@main\n"
        "# A comment\n"
        "  \n"
        "torch",
        encoding="utf-8",
    )

    checked: list[str] = []

    def fake_distribution(package_name: str):
        checked.append(package_name)
        return object()

    monkeypatch.setattr(metadata, "distribution", fake_distribution)

    satisfied, missing = _check_dependencies(tmp_path)

    assert satisfied is True
    assert missing == []
    assert checked == ["requests", "coqui-tts", "torch"]


def test_check_dependencies_skips_git_url_without_egg_fragment(tmp_path, monkeypatch):
    req_file = tmp_path / "requirements.txt"
    req_file.write_text(
        "git+https://github.com/example/unknown-package.git@main\n",
        encoding="utf-8",
    )

    checked: list[str] = []

    def fake_distribution(package_name: str):
        checked.append(package_name)
        return object()

    monkeypatch.setattr(metadata, "distribution", fake_distribution)

    satisfied, missing = _check_dependencies(tmp_path)

    assert satisfied is True
    assert missing == []
    assert checked == []


def test_check_dependencies_missing_package(tmp_path):
    req_file = tmp_path / "requirements.txt"
    req_file.write_text("non-existent-package-name-12345", encoding="utf-8")

    satisfied, missing = _check_dependencies(tmp_path)
    assert satisfied is False
    assert "non-existent-package-name-12345" in missing


def test_install_dependencies_reports_pip_stderr(tmp_path, monkeypatch):
    from app.tts_server import server

    req_file = tmp_path / "requirements.txt"
    req_file.write_text("broken-package", encoding="utf-8")
    plugin = SimpleNamespace(
        plugin_dir=tmp_path,
        dependencies_satisfied=False,
        missing_dependencies=[],
    )

    monkeypatch.setattr(server, "_plugin_by_id", lambda engine_id: plugin)

    def fake_run(*args, **kwargs):
        assert kwargs["capture_output"] is True
        assert kwargs["text"] is True
        return SimpleNamespace(returncode=1, stdout="stdout details", stderr="pip stderr details")

    monkeypatch.setattr("subprocess.run", fake_run)

    with pytest.raises(HTTPException) as exc_info:
        server.install_dependencies("xtts")

    assert exc_info.value.status_code == 500
    assert "Dependency installation failed for xtts" in exc_info.value.detail
    assert "pip stderr details" in exc_info.value.detail


def test_install_dependencies_refreshes_setup_message_after_success(tmp_path, monkeypatch):
    from app.tts_server import server

    req_file = tmp_path / "requirements.txt"
    req_file.write_text("requests", encoding="utf-8")
    plugin = SimpleNamespace(
        plugin_dir=tmp_path,
        dependencies_satisfied=False,
        missing_dependencies=["requests"],
        engine=SimpleNamespace(check_env=lambda: (False, "API key missing")),
        load_error=None,
    )

    monkeypatch.setattr(server, "_plugin_by_id", lambda engine_id: plugin)
    monkeypatch.setattr("subprocess.run", lambda *args, **kwargs: SimpleNamespace(returncode=0, stdout="", stderr=""))
    monkeypatch.setattr("app.tts_server.plugin_loader._check_dependencies", lambda plugin_dir: (True, []))

    response = server.install_dependencies("xtts")

    assert response["ok"] is True
    assert response["dependencies_satisfied"] is True
    assert response["missing_dependencies"] == []
    assert plugin.dependencies_satisfied is True
    assert plugin.missing_dependencies == []
    assert plugin.setup_message == "API key missing"


def test_install_dependencies_reloads_plugin_after_successful_install(tmp_path, monkeypatch):
    from app.tts_server import server

    req_file = tmp_path / "requirements.txt"
    req_file.write_text("requests", encoding="utf-8")
    plugin = SimpleNamespace(
        engine_id="mock-engine",
        folder_name="tts_mock",
        plugin_dir=tmp_path,
        dependencies_satisfied=False,
        missing_dependencies=["requests"],
        engine=None,
        load_error="ImportError: missing dependency",
    )
    reloaded_plugin = SimpleNamespace(
        engine_id="mock-engine",
        folder_name="tts_mock",
        plugin_dir=tmp_path,
        dependencies_satisfied=True,
        missing_dependencies=[],
        engine=SimpleNamespace(check_env=lambda: (True, "OK")),
        load_error=None,
    )

    monkeypatch.setattr(server, "_plugin_by_id", lambda engine_id: plugin)
    monkeypatch.setattr(server, "_plugins", [plugin])
    monkeypatch.setattr("subprocess.run", lambda *args, **kwargs: SimpleNamespace(returncode=0, stdout="", stderr=""))
    monkeypatch.setattr("app.tts_server.plugin_loader._check_dependencies", lambda plugin_dir: (True, []))
    monkeypatch.setattr("app.tts_server.plugin_loader._load_plugin", lambda plugin_dir, folder_name: reloaded_plugin)

    response = server.install_dependencies("mock-engine")

    assert response["ok"] is True
    assert server._plugins[0] is reloaded_plugin
