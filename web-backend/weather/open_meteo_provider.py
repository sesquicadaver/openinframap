"""
Open-Meteo wind provider — no API key required.
Used as PoC provider and as per-request fallback when the local
gridded forecast cache is unavailable or stale.

API docs: https://open-meteo.com/en/docs
"""

import asyncio
import math
from datetime import datetime

import httpx

from .cache import TTLCache
from .models import Point, Wind
from .wind_provider import WindProvider

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


class OpenMeteoProvider(WindProvider):
    def __init__(self, cache: TTLCache, http_client: httpx.AsyncClient) -> None:
        self._cache = cache
        self._http = http_client

    async def get_wind(self, point: Point, time: datetime) -> Wind:
        lat = round(point.lat, 1)
        lon = round(point.lon, 1)
        forecast = await self._get_forecast(lat, lon)
        return _interpolate_wind(forecast, time)

    async def _get_forecast(self, lat: float, lon: float) -> dict:
        key = f"openmeteo:{lat:.1f}:{lon:.1f}"
        cached = self._cache.get(key)
        if cached is not None:
            return cached

        for attempt in range(3):
            response = await self._http.get(
                OPEN_METEO_URL,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "hourly": "wind_speed_10m,wind_direction_10m",
                    "forecast_days": 5,
                    "timezone": "UTC",
                },
                timeout=12.0,
            )
            if response.status_code == 429:
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            response.raise_for_status()
            break
        else:
            raise RuntimeError(f"Open-Meteo rate-limited for ({lat}, {lon}) after 3 retries")

        data = response.json()

        if "hourly" not in data or not data["hourly"].get("time"):
            raise ValueError(f"Open-Meteo returned no data for ({lat}, {lon})")

        self._cache.set(key, data)
        return data


def _interpolate_wind(forecast: dict, time: datetime) -> Wind:
    times = forecast["hourly"]["time"]
    speeds = forecast["hourly"]["wind_speed_10m"]
    dirs = forecast["hourly"]["wind_direction_10m"]

    target = time.replace(tzinfo=None)
    idx = min(
        range(len(times)),
        key=lambda i: abs(datetime.fromisoformat(times[i]) - target),
    )

    speed = float(speeds[idx] or 0.0)
    direction = float(dirs[idx] or 0.0)

    # Meteorological convention: direction FROM which wind blows.
    # u (eastward) = -speed * sin(dir),  v (northward) = -speed * cos(dir)
    d_rad = math.radians(direction)
    return Wind(u=-speed * math.sin(d_rad), v=-speed * math.cos(d_rad))
