"""
GriddedWindProvider — serves all RK4 wind evaluations from an in-memory
xarray/numpy field; zero external API calls at request time.
"""

from datetime import datetime
from pathlib import Path

from .models import Point, Wind
from .wind_field import WindField
from .wind_provider import WindProvider


class GriddedWindProvider(WindProvider):
    def __init__(self, field: WindField) -> None:
        self._field = field

    async def get_wind(self, point: Point, time: datetime) -> Wind:
        return self._field.get_wind(point.lat, point.lon, time)

    @classmethod
    def from_zarr(cls, path: str | Path) -> "GriddedWindProvider":
        return cls(WindField.from_zarr(path))
