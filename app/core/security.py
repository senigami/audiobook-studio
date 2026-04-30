import time
import threading
from typing import Dict, List
from fastapi import Security, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.status import HTTP_401_UNAUTHORIZED, HTTP_403_FORBIDDEN, HTTP_429_TOO_MANY_REQUESTS

security = HTTPBearer(auto_error=False)


def verify_api_key(credentials: HTTPAuthorizationCredentials = Security(security)):
    """Dependency to verify the Bearer token against Studio settings.

    If tts_api_key is empty in settings, authentication is skipped (open).
    If tts_api_enabled is False, all requests are rejected with 403.
    """
    from app.state import get_settings  # noqa: PLC0415

    settings = get_settings()

    if not settings.get("tts_api_enabled"):
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN, detail="External TTS API is disabled."
        )

    expected_key = settings.get("tts_api_key")
    if not expected_key:
        # No key configured -> open access (default for local-only use).
        return None

    if not credentials or credentials.credentials != expected_key:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


class SimpleRateLimiter:
    """Basic sliding-window rate limiter for the public TTS API."""

    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self._history: Dict[str, List[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> bool:
        """Check if the given key (e.g. IP or token) is within limits."""
        now = time.time()
        with self._lock:
            if key not in self._history:
                self._history[key] = [now]
                return True

            # Filter timestamps to last 60 seconds
            self._history[key] = [t for t in self._history[key] if now - t < 60]

            if len(self._history[key]) >= self.requests_per_minute:
                return False

            self._history[key].append(now)
            return True


# Global rate limiter instance
_limiter = SimpleRateLimiter(requests_per_minute=30)


async def rate_limit(request: Request):
    """Dependency to enforce a simple request-level throttle."""
    # Use client host as the key for rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if not _limiter.check(client_ip):
        raise HTTPException(
            status_code=HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )


def validate_safe_identifier(*, value: str, field_name: str) -> str:
    """Strict identifier validation before persistence or path use."""
    import re  # noqa: PLC0415

    if not value or not re.match(r"^[a-z0-9_-]{1,64}$", value):
        raise ValueError(f"Invalid {field_name}: must be alphanumeric (a-z, 0-9, _, -)")
    return value
