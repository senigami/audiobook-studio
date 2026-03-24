import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.web import app
import os

client = TestClient(app)

def test_api_analyze_chapter_not_found():
    with patch("app.api.routers.analysis.get_chapter", return_value=None):
        response = client.get("/api/chapters/nonexistent/analyze")
        assert response.status_code == 404
        assert response.json()["message"] == "Chapter not found"

def test_api_analyze_chapter_success():
    mock_chapter = {
        "id": "chap1",
        "project_id": "proj1",
        "text_content": "This is a sentence. And another one! Is this a third? Yes."
    }
    mock_segments = [
        {"id": "seg1", "character_id": "char1", "text_content": "This is a sentence."},
        {"id": "seg2", "character_id": "char1", "text_content": "And another one!"},
        {"id": "seg3", "character_id": "char2", "text_content": "Is this a third?"},
        {"id": "seg4", "character_id": "char2", "text_content": "Yes."}
    ]
    mock_characters = [
        {"id": "char1", "name": "Alice", "color": "#ff0000"},
        {"id": "char2", "name": "Bob", "color": "#0000ff"}
    ]

    with patch("app.api.routers.analysis.get_chapter", return_value=mock_chapter), \
         patch("app.api.routers.analysis.get_chapter_segments", return_value=mock_segments), \
         patch("app.api.routers.analysis.get_characters", return_value=mock_characters):

        response = client.get("/api/chapters/chap1/analyze")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert len(data["voice_chunks"]) == 2
        assert data["voice_chunks"][0]["character_name"] == "Alice"
        assert data["voice_chunks"][1]["character_name"] == "Bob"
        assert data["char_count"] == len(mock_chapter["text_content"])

def test_api_analyze_text():
    text = "Short sentence. " + "A" * 300 + ". End."
    response = client.post("/api/analyze_text", json={"text_content": text})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["char_count"] == len(text)
    # Depending on SENT_CHAR_LIMIT (usually 250), it might show raw_long_sentences
    assert "threshold" in data

def test_api_report_not_found():
    response = client.get("/api/report/nonexistent_report")
    assert response.status_code == 404
    assert response.json()["message"] == "Report not found"

def test_api_report_success(tmp_path, monkeypatch):
    from app.api.routers.analysis import REPORT_DIR
    mock_report_dir = tmp_path / "reports"
    mock_report_dir.mkdir()
    monkeypatch.setattr("app.config.REPORT_DIR", mock_report_dir)
    monkeypatch.setattr("app.web.REPORT_DIR", mock_report_dir)

    report_file = mock_report_dir / "long_sentences_test_report.txt"
    report_file.write_text("Report content")

    response = client.get("/api/report/test_report")
    assert response.status_code == 200
    assert response.text == "Report content"


def test_api_report_traversal_is_contained(tmp_path):
    from app.api.routers.analysis import report

    report_dir = tmp_path / "reports"
    report_dir.mkdir()
    outside = tmp_path / "long_sentences_escape.txt"
    outside.write_text("escape")

    response = report("../../escape", report_dir=report_dir)
    assert response.status_code == 403
    assert outside.exists()
