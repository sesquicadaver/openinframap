"""
WindField — wraps a locally-cached xarray Dataset (loaded from Zarr)
and provides bilinear spatial + linear temporal interpolation.

Supports both GFS variable naming (u10/v10) and ICON-EU (U_10M/V_10M).
"""

from datetime import datetime
from pathlib import Path

import numpy as np
import xarray as xr

from .models import Wind

_U_CANDIDATES = ("u10", "U_10M", "u")
_V_CANDIDATES = ("v10", "V_10M", "v")
_LAT_DIMS = ("latitude", "lat")
_LON_DIMS = ("longitude", "lon")
_TIME_DIMS = ("valid_time", "time")


def _pick(dataset: xr.Dataset, candidates: tuple[str, ...]) -> str:
    for name in candidates:
        if name in dataset:
            return name
    raise KeyError(f"None of {candidates} found in dataset vars: {list(dataset.data_vars)}")


def _pick_dim(dataset: xr.Dataset, candidates: tuple[str, ...]) -> str:
    for name in candidates:
        if name in dataset.dims or name in dataset.coords:
            return name
    raise KeyError(f"None of {candidates} found in dataset dims/coords: {list(dataset.coords)}")


class WindField:
    def __init__(self, dataset: xr.Dataset) -> None:
        self._ds = dataset
        self._u = _pick(dataset, _U_CANDIDATES)
        self._v = _pick(dataset, _V_CANDIDATES)
        self._lat = _pick_dim(dataset, _LAT_DIMS)
        self._lon = _pick_dim(dataset, _LON_DIMS)
        self._t = _pick_dim(dataset, _TIME_DIMS)

    def get_wind(self, lat: float, lon: float, time: datetime) -> Wind:
        t64 = np.datetime64(time.replace(tzinfo=None), "ns")

        result = self._ds.interp(
            {self._lat: lat, self._lon: lon, self._t: t64},
            method="linear",
            kwargs={"fill_value": None},
        )

        u = float(result[self._u].values)
        v = float(result[self._v].values)

        if np.isnan(u) or np.isnan(v):
            raise ValueError(
                f"Wind NaN at ({lat:.2f}, {lon:.2f}, {time.isoformat()}); "
                "point may be outside the cached domain or time range"
            )

        return Wind(u=u, v=v)

    def covers(self, time: datetime) -> bool:
        """Return True if this field's time range includes `time`."""
        t_vals = self._ds[self._t].values
        t64 = np.datetime64(time.replace(tzinfo=None), "ns")
        return bool(t_vals.min() <= t64 <= t_vals.max())

    @classmethod
    def from_zarr(cls, path: str | Path) -> "WindField":
        ds = xr.open_zarr(str(path), consolidated=False)
        return cls(ds)
