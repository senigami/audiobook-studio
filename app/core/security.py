import hmac
import time
import threading
from typing import Callable, Dict, List
from fastapi import Security, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.status import HTTP_401_UNAUTHORIZED, HTTP_403_FORBIDDEN, HTTP_429_TOO_MANY_REQUESTS

security = HTTPBearer(auto_error=False)


def verify_api_key(credentials: HTTPAuthorizationCredentials = Security(security)):
    """Dependency to verify the Bearer token against Studio settings.

    If tts_api_key is empty in settings, authentication is skipped (open).
    If tts_api_enabled is False, all requests are rejected with 403.
    """
    from app.db.state import get_settings  # noqa: PLC0415

    settings = get_settings()

    if not settings.get("tts_api_enabled"):
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN, detail="External TTS API is disabled."
        )

    expected_key = settings.get("tts_api_key")
    if not expected_key:
        # No key configured -> open access (default for local-only use).
        return None

    if not credentials or not hmac.compare_digest(credentials.credentials, expected_key):
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


class SimpleRateLimiter:
    """Basic sliding-window rate limiter for the public TTS API.

    Documented limitations (S7 — acceptable for the local-first 2.0 release; not
    a substitute for an edge rate limiter if Studio is ever exposed publicly):

    - **In-memory, per-process.** Counters live in ``self._history`` only; they
      are **reset on every restart** and are **not shared** across multiple
      worker processes. A restart (or a multi-worker deployment) effectively
      clears/splits the limit.
    - **Keyed by client IP.** Callers behind the same NAT / proxy / VPN share a
      single bucket, so one busy client can throttle its neighbours, and a
      client that rotates IPs is not effectively limited. There is no
      per-API-key bucketing.
    """

    def __init__(
        self,
        requests_per_minute: int = 60,
        *,
        time_fn: Callable[[], float] = time.time,
        sweep_interval_seconds: float = 60.0,
    ):
        self.requests_per_minute = requests_per_minute
        self._history: Dict[str, List[float]] = {}
        self._lock = threading.Lock()
        self._time_fn = time_fn
        # PERF-7: an IP that stops sending never calls check() with its own
        # key again, so its stale timestamps would otherwise sit in
        # `_history` forever (only the CALLING key's own list is trimmed
        # above). `_sweep_interval_seconds` bounds how often the opportunistic
        # sweep below scans every key.
        self._sweep_interval_seconds = sweep_interval_seconds
        self._last_sweep = self._time_fn()

    def check(self, key: str) -> bool:
        """Check if the given key (e.g. IP or token) is within limits."""
        now = self._time_fn()
        with self._lock:
            self._sweep_stale_keys(now)

            history = self._history.get(key)
            if history is not None:
                # Filter timestamps to last 60 seconds
                filtered = [t for t in history if now - t < 60]
                if not filtered:
                    # (a) Nothing survived the window — drop the key
                    # entirely rather than leaving an empty list behind.
                    del self._history[key]
                    history = None
                else:
                    self._history[key] = filtered

            if history is None:
                self._history[key] = [now]
                return True

            if len(self._history[key]) >= self.requests_per_minute:
                return False

            self._history[key].append(now)
            return True

    def _sweep_stale_keys(self, now: float) -> None:
        """(b) Opportunistic sweep: silent keys (IPs that stopped sending)
        never revisit ``check()`` on their own key, so they'd never
        otherwise get their windowed timestamps filtered/removed. Runs at
        most once per ``_sweep_interval_seconds``, piggybacking on whichever
        caller's ``check()`` happens to land after the interval elapses —
        already under ``self._lock``, so no extra thread/timer needed.
        """
        if now - self._last_sweep < self._sweep_interval_seconds:
            return
        self._last_sweep = now
        stale_keys = [
            k for k, timestamps in self._history.items()
            if not any(now - t < 60 for t in timestamps)
        ]
        for k in stale_keys:
            del self._history[k]


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
