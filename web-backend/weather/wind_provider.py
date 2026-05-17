from abc import ABC, abstractmethod
from datetime import datetime

import httpx

from .cache import TTLCache
from .models import Point, Wind

WINDY_POINT_FORECAST_URL = "https://api.windy.com/api/point-forecast/v2"


class WindProvider(ABC):
    @abstractmethod
    async def get_wind(self, point: Point, time: datetime) -> Wind: ...


class WindyPointForecastProvider(WindProvider):
    """
    Fetches wind data from the Windy Point Forecast API.
    One API call per unique rounded (lat, lon) pair; the full time-series
    is cached so all RK4 sub-steps for different times reuse the same entry.
    """

    def __init__(
        self,
        api_key: str,
        cache: TTLCache,
        http_client: httpx.AsyncClient,
        model: str = "iconEu",
    ) -> None:
        self._api_key = api_key
        self._cache = cache
        self._http = http_client
        self._model = model

    async def get_wind(self, point: Point, time: datetime) -> Wind:
        lat = round(point.lat, 2)
        lon = round(point.lon, 2)
        forecast = await self._get_forecast(lat, lon)
        return self._interpolate(forecast, time)

    async def _get_forecast(self, lat: float, lon: float) -> dict:
        key = f"windy:{self._model}:{lat:.2f}:{lon:.2f}"
        cached = self._cache.get(key)
        if cached is not None:
            return cached

        response = await self._http.post(
            WINDY_POINT_FORECAST_URL,
            json={
                "lat": lat,
                "lon": lon,
                "model": self._model,
                "parameters": ["wind"],
                "levels": ["surface"],
                "key": self._api_key,
            },
            timeout=12.0,
        )
        response.raise_for_status()
        data = response.json()

        if not data.get("ts") or not data.get("wind_u-surface"):
            raise ValueError(f"No wind data returned for ({lat}, {lon}) model={self._model}")

        self._cache.set(key, data)
        return data

    def _interpolate(self, forecast: dict, time: datetime) -> Wind:
        timestamps_ms = forecast["ts"]
        target_ms = int(time.timestamp() * 1000)

        idx = min(
            range(len(timestamps_ms)),
            key=lambda i: abs(timestamps_ms[i] - target_ms),
        )

        u = forecast["wind_u-surface"][idx]
        v = forecast["wind_v-surface"][idx]

        return Wind(u=float(u or 0.0), v=float(v or 0.0))
