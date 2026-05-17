"""
Air-mass trajectory endpoint.

GET /api/weather/air-trajectory?lat=50.45&lon=30.52&durationHours=24|48|72
    &model=auto|icon-eu|gfs|open-meteo

Provider priority:
  1. GriddedWindProvider from local ICON-EU Zarr cache (if fresh)
  2. GriddedWindProvider from local GFS Zarr cache (if fresh)
  3. OpenMeteoProvider (point API, no key, always available)

Returns a GeoJSON FeatureCollection with three features:
  - trajectory_centerline  (LineString)
  - trajectory_strip       (Polygon, 20 km wide geodesic buffer)
  - trajectory_endpoint    (Point)
"""

import json
import logging
from datetime import datetime, timedelta, timezone

from starlette.requests import Request
from starlette.responses import Response

from main import app
from .cache import TTLCache
from .grid_provider import GriddedWindProvider
from .ingest import DEFAULT_CACHE_DIR, find_latest_cache
from .models import Point, TrajectoryConfig
from .open_meteo_provider import OpenMeteoProvider
from .strip import _points_to_wkt, buffer_linestring, make_feature_collection
from .trajectory import build_trajectory
from .wind_field import WindField

logger = logging.getLogger(__name__)

_om_cache = TTLCache(ttl_seconds=3600, max_size=2000)
_VALID_DURATIONS = {24, 48, 72}


def _build_provider(http_client, model: str, duration_hours: int):
    """Return the best available wind provider for the requested model."""
    if model == "open-meteo":
        return OpenMeteoProvider(cache=_om_cache, http_client=http_client)

    end_time = datetime.now(timezone.utc) + timedelta(hours=duration_hours)

    # Try local gridded cache: ICON-EU first, then GFS
    sources = ["icon-eu", "gfs"] if model in ("auto", "icon-eu") else ["gfs", "icon-eu"]
    for source in sources:
        path = find_latest_cache(DEFAULT_CACHE_DIR, source)  # type: ignore[arg-type]
        if path is None:
            continue
        try:
            field = WindField.from_zarr(path)
            if not field.covers(end_time):
                logger.info("Cache %s only covers to %s, need %s — skipping",
                            path, field._ds[field._t].values[-1], end_time)
                continue
            logger.info("Using gridded cache: %s", path)
            return GriddedWindProvider(field)
        except Exception as exc:
            logger.warning("Failed to load gridded cache %s: %s", path, exc)

    # No suitable local cache — fall back to Open-Meteo
    logger.info("No gridded cache covers +%dh, falling back to Open-Meteo", duration_hours)
    return OpenMeteoProvider(cache=_om_cache, http_client=http_client)


@app.route("/api/weather/air-trajectory")
async def air_trajectory(request: Request) -> Response:
    try:
        lat = float(request.query_params["lat"])
        lon = float(request.query_params["lon"])
        duration_hours = int(request.query_params.get("durationHours", 24))
        model = request.query_params.get("model", "auto")
    except (KeyError, ValueError):
        return Response("Invalid or missing parameters", status_code=400)

    if duration_hours not in _VALID_DURATIONS:
        return Response("durationHours must be 24, 48 or 72", status_code=400)

    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return Response("Coordinates out of range", status_code=400)

    config = TrajectoryConfig(duration_hours=duration_hours)
    start = Point(lat=round(lat, 2), lon=round(lon, 2))

    provider = _build_provider(request.state.http_client, model, duration_hours)

    try:
        points = await build_trajectory(start, config, provider)
    except Exception as exc:
        return Response(f"Trajectory computation failed: {exc}", status_code=502)

    linestring_wkt = _points_to_wkt(points)

    try:
        strip_geom = await buffer_linestring(linestring_wkt, config.strip_half_width_m)
    except Exception as exc:
        return Response(f"Strip buffer failed: {exc}", status_code=500)

    provider_name = type(provider).__name__
    result = make_feature_collection(
        points=points,
        strip_geom=strip_geom,
        duration_hours=duration_hours,
        strip_half_width_m=config.strip_half_width_m,
    )
    result["properties"] = {"provider": provider_name}

    return Response(
        content=json.dumps(result, ensure_ascii=False),
        media_type="application/geo+json",
        headers={"Cache-Control": "public, max-age=1800"},
    )
