"""
Weather GRIB2 ingestion pipeline.

Primary source : DWD ICON-EU (Europe, 0.0625°, CC BY 4.0, no key)
Fallback source: NOAA GFS via NOMADS GRIB filter (global, 0.25°, free)

Run directly:
    python -m weather.ingest --source gfs
    python -m weather.ingest --source icon-eu

The `find_latest_cache()` helper is used by routes.py to locate a
usable Zarr file without re-downloading.
"""

import asyncio
import bz2
import logging
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

import httpx
import xarray as xr

logger = logging.getLogger(__name__)

DEFAULT_CACHE_DIR = Path(os.environ.get("WEATHER_CACHE_DIR", "/data/weather_cache"))
MAX_CACHE_AGE_H = 7

# Geographic domain: Ukraine + ~1 500 km buffer in each direction
BBOX = {"leftlon": 0, "rightlon": 60, "toplat": 67, "bottomlat": 30}

FORECAST_HOURS = list(range(0, 73))  # +0 h … +72 h

Source = Literal["gfs", "icon-eu"]


# ---------------------------------------------------------------------------
# Run detection
# ---------------------------------------------------------------------------

def _latest_synoptic_run(now: datetime, lag_h: int = 4) -> tuple[str, str]:
    """Return (YYYYMMDD, HH) of the most recent synoptic (00/06/12/18 UTC) run."""
    candidate = now - timedelta(hours=lag_h)
    hh = (candidate.hour // 6) * 6
    date = candidate.strftime("%Y%m%d")
    return date, f"{hh:02d}"


# ---------------------------------------------------------------------------
# Cache path helpers
# ---------------------------------------------------------------------------

def zarr_path(cache_dir: Path, source: Source, date: str, hh: str) -> Path:
    return cache_dir / source / f"{date}_{hh}Z" / "u_v_10m.zarr"


def find_latest_cache(
    cache_dir: Path = DEFAULT_CACHE_DIR,
    source: Source = "icon-eu",
    max_age_hours: int = MAX_CACHE_AGE_H,
) -> Path | None:
    """Return the most recent valid Zarr path for *source*, or None."""
    source_dir = cache_dir / source
    if not source_dir.exists():
        return None

    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    candidates: list[tuple[datetime, Path]] = []

    for run_dir in source_dir.iterdir():
        zarr = run_dir / "u_v_10m.zarr"
        if not zarr.exists():
            continue
        try:
            dt = datetime.strptime(run_dir.name, "%Y%m%d_%HZ").replace(tzinfo=timezone.utc)
            if dt >= cutoff:
                candidates.append((dt, zarr))
        except ValueError:
            pass

    return max(candidates, key=lambda x: x[0])[1] if candidates else None


# ---------------------------------------------------------------------------
# GRIB2 → xarray
# ---------------------------------------------------------------------------

def _grib_bytes_to_dataset(grib_bytes: bytes, label: str = "") -> xr.Dataset:
    """Parse raw GRIB2 bytes into a normalised xarray Dataset with u10/v10."""
    import cfgrib

    with tempfile.NamedTemporaryFile(suffix=".grib2", delete=False) as f:
        f.write(grib_bytes)
        fname = f.name

    try:
        raw_datasets = cfgrib.open_datasets(
            fname,
            backend_kwargs={
                "filter_by_keys": {"typeOfLevel": "heightAboveGround", "level": 10}
            },
            indexpath=None,
        )
        merged = xr.merge(raw_datasets, compat="override")

        rename: dict[str, str] = {}
        for var in merged.data_vars:
            vl = var.lower()
            if "u" in vl and "u10" not in merged:
                rename[var] = "u10"
            elif "v" in vl and "v10" not in merged:
                rename[var] = "v10"

        ds = merged.rename(rename) if rename else merged

        # cfgrib scalar valid_time → expand so it becomes a concat dimension
        if "valid_time" not in ds.dims:
            ds = ds.expand_dims("valid_time")

        return ds[["u10", "v10"]]

    finally:
        Path(fname).unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# NOAA GFS via NOMADS GRIB filter
# ---------------------------------------------------------------------------

async def _download_gfs_hour(
    client: httpx.AsyncClient, date: str, hh: str, fhour: int
) -> bytes:
    fff = f"{fhour:03d}"
    url = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25_1hr.pl"
    params = {
        "dir": f"/gfs.{date}/{hh}/atmos",
        "file": f"gfs.t{hh}z.pgrb2.0p25.f{fff}",
        "var_UGRD": "on",
        "var_VGRD": "on",
        "lev_10_m_above_ground": "on",
        "subregion": "",
        **BBOX,
    }
    r = await client.get(url, params=params, timeout=90.0)
    r.raise_for_status()
    if len(r.content) < 100:
        raise ValueError(f"GFS hour +{fff} response too small ({len(r.content)} B) — run not ready?")
    return r.content


async def ingest_gfs(
    cache_dir: Path = DEFAULT_CACHE_DIR,
    hours: list[int] = FORECAST_HOURS,
) -> Path:
    now = datetime.now(timezone.utc)
    date, hh = _latest_synoptic_run(now)
    out = zarr_path(cache_dir, "gfs", date, hh)

    if out.exists():
        logger.info("GFS cache fresh: %s", out)
        return out

    out.parent.mkdir(parents=True, exist_ok=True)
    logger.info("Ingesting GFS %s %sZ (%d hours)", date, hh, len(hours))

    async with httpx.AsyncClient(
        headers={"User-Agent": "OpenInfraMap weather-ingest/1.0"},
        follow_redirects=True,
    ) as client:
        datasets: list[xr.Dataset] = []
        for fhour in hours:
            logger.debug("GFS +%03d", fhour)
            grib = await _download_gfs_hour(client, date, hh, fhour)
            ds = _grib_bytes_to_dataset(grib, label=f"gfs+{fhour:03d}")
            datasets.append(ds)

    combined = xr.concat(datasets, dim="valid_time")
    combined.to_zarr(str(out), mode="w", consolidated=True)
    logger.info("GFS cache written: %s", out)
    return out


# ---------------------------------------------------------------------------
# DWD ICON-EU
# ---------------------------------------------------------------------------

async def _download_icon_var_hour(
    client: httpx.AsyncClient, date: str, hh: str, fhour: int, variable: str
) -> bytes:
    fff = f"{fhour:03d}"
    var_upper = variable.upper()
    fname = (
        f"icon-eu_europe_regular-lat-lon_single-level_{date}{hh}_{fff}_{var_upper}.grib2.bz2"
    )
    url = f"https://opendata.dwd.de/weather/nwp/icon-eu/grib/{hh}/{variable}/{fname}"
    r = await client.get(url, timeout=120.0)
    r.raise_for_status()
    return bz2.decompress(r.content)


async def ingest_icon_eu(
    cache_dir: Path = DEFAULT_CACHE_DIR,
    hours: list[int] = FORECAST_HOURS,
) -> Path:
    now = datetime.now(timezone.utc)
    date, hh = _latest_synoptic_run(now)
    out = zarr_path(cache_dir, "icon-eu", date, hh)

    if out.exists():
        logger.info("ICON-EU cache fresh: %s", out)
        return out

    out.parent.mkdir(parents=True, exist_ok=True)
    logger.info("Ingesting DWD ICON-EU %s %sZ (%d hours)", date, hh, len(hours))

    async with httpx.AsyncClient(
        headers={"User-Agent": "OpenInfraMap weather-ingest/1.0"},
        follow_redirects=True,
    ) as client:
        datasets: list[xr.Dataset] = []
        for fhour in hours:
            logger.debug("ICON-EU +%03d", fhour)
            u_bytes = await _download_icon_var_hour(client, date, hh, fhour, "u_10m")
            v_bytes = await _download_icon_var_hour(client, date, hh, fhour, "v_10m")
            u_ds = _grib_bytes_to_dataset(u_bytes, f"icon-eu u +{fhour:03d}")
            v_ds = _grib_bytes_to_dataset(v_bytes, f"icon-eu v +{fhour:03d}")
            ds = xr.merge([u_ds[["u10"]], v_ds[["v10"]]], compat="override")
            if "valid_time" not in ds.dims:
                ds = ds.expand_dims("valid_time")
            datasets.append(ds)

    combined = xr.concat(datasets, dim="valid_time")

    # Slice to bbox (ICON-EU covers all of Europe; reduce to our domain)
    lat_slice = slice(BBOX["toplat"], BBOX["bottomlat"])
    lon_slice = slice(BBOX["leftlon"], BBOX["rightlon"])
    lat_dim = "latitude" if "latitude" in combined.dims else "lat"
    lon_dim = "longitude" if "longitude" in combined.dims else "lon"
    combined = combined.sel({lat_dim: lat_slice, lon_dim: lon_slice})

    combined.to_zarr(str(out), mode="w", consolidated=True)
    logger.info("ICON-EU cache written: %s", out)
    return out


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

async def _main() -> None:
    import argparse

    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Ingest weather GRIB2 forecast")
    parser.add_argument("--source", choices=["gfs", "icon-eu"], default="icon-eu")
    parser.add_argument("--cache-dir", default=str(DEFAULT_CACHE_DIR))
    args = parser.parse_args()

    cache_dir = Path(args.cache_dir)
    if args.source == "gfs":
        await ingest_gfs(cache_dir)
    else:
        await ingest_icon_eu(cache_dir)


if __name__ == "__main__":
    asyncio.run(_main())
