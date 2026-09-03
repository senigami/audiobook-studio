from fastapi.testclient import TestClient
from app.api.web import app
import pytest

client = TestClient(app)

def test_chapter_text_normalization():
    # Create a project
    res = client.post("/api/projects", data={"name": "Normalization Test"})
    pid = res.json()["project_id"]

    # 1. Test normalization on CREATE
    # Sending text with CRLF (\r\n)
    text_with_crlf = "Line one.\r\nLine two.\r\nLine three."
    res = client.post(f"/api/projects/{pid}/chapters", data={
        "title": "Normalization Chapter", 
        "text_content": text_with_crlf, 
        "sort_order": 0
    })
    assert res.status_code == 200
    chapter = res.json()["chapter"]
    cid = chapter["id"]

    # Verify it was saved with LF (\n)
    assert "\r\n" not in chapter["text_content"]
    assert chapter["text_content"] == text_with_crlf.replace("\r\n", "\n")

    # 2. Test normalization on UPDATE
    updated_text_with_crlf = "Updated line one.\r\nUpdated line two."
    res = client.put(f"/api/chapters/{cid}", data={
        "text_content": updated_text_with_crlf
    })
    assert res.status_code == 200
    updated_chapter = res.json()["chapter"]

    # Verify update was saved with LF (\n)
    assert "\r\n" not in updated_chapter["text_content"]
    assert updated_chapter["text_content"] == updated_text_with_crlf.replace("\r\n", "\n")

    # Cleanup
    client.delete(f"/api/projects/{pid}")
