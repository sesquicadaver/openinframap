import time
from typing import Any


class TTLCache:
    """Thread-safe in-memory cache with per-entry TTL and LRU-style eviction."""

    def __init__(self, ttl_seconds: int = 7200, max_size: int = 2000) -> None:
        self._store: dict[str, tuple[Any, float]] = {}
        self._ttl = ttl_seconds
        self._max_size = max_size

    def get(self, key: str) -> Any | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any) -> None:
        if len(self._store) >= self._max_size:
            now = time.monotonic()
            expired = [k for k, (_, exp) in self._store.items() if exp < now]
            for k in expired:
                del self._store[k]
            if len(self._store) >= self._max_size:
                oldest_key = min(self._store, key=lambda k: self._store[k][1])
                del self._store[oldest_key]
        self._store[key] = (value, time.monotonic() + self._ttl)
