import pytest

from app.domain.chapters.helpers import _normalize_segment_status


@pytest.mark.parametrize(
    "status, expected",
    [
        ("queued", "queued"),
        ("preparing", "queued"),
        ("finalizing", "queued"),
        ("waiting_for_resources", "queued"),
        ("running", "draft"),
    ],
)
def test_normalize_segment_status_buckets(status, expected):
    assert _normalize_segment_status(status) == expected
