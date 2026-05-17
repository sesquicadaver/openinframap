"""
Air-mass trajectory endpoint.

GET /api/weather/air-trajectory?lat=50.45&lon=30.52&durationHours=24|48|72

Returns a GeoJSON FeatureCollection with three features:
  - trajectory_centerline  (LineString)
  - trajectory_strip       (Polygon, 20 km wide geodesic buffer)
  - trajectory_endpoint    (Point)
"""

import json
import os

from starlette.requests import Request
from starlette.responses import Response

from main import app
from .cache import TTLCache
from .models import Point, TrajectoryConfig
from .strip import buffer_linestring, make_feature_collection, _points_to_wkt
from .trajectory import build_trajectory
from .wind_provider import WindyPointForecastProvider

_cache = TTLCache(ttl_seconds=7200, max_size=2000)
_VALID_DURATIONS = {24, 48, 72}


@app.route("/api/weather/air-trajectory")
async def air_trajectory(request: Request) -> Response:
    try:
        lat = float(request.query_params["lat"])
        lon = float(request.query_params["lon"])
        duration_hours = int(request.query_params.get("durationHours", 24))
    except (KeyError, ValueError):
        return Response("Invalid or missing parameters", status_code=400)

    if duration_hours not in _VALID_DURATIONS:
        return Response("durationHours must be 24, 48 or 72", status_code=400)

    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return Response("Coordinates out of range", status_code=400)

    api_key = os.environ.get("WINDY_POINT_FORECAST_API_KEY", "")
    if not api_key:
        return Response("WINDY_POINT_FORECAST_API_KEY not configured", status_code=503)

    http_client = request.state.http_client
    config = TrajectoryConfig(duration_hours=duration_hours)

    provider = WindyPointForecastProvider(
        api_key=api_key,
        cache=_cache,
        http_client=http_client,
        model=config.model,
    )

    start = Point(lat=round(lat, 2), lon=round(lon, 2))

    try:
        points = await build_trajectory(start, config, provider)
    except Exception:
        provider_fallback = WindyPointForecastProvider(
            api_key=api_key,
            cache=_cache,
            http_client=http_client,
            model=config.fallback_model,
        )
        try:
            points = await build_trajectory(start, config, provider_fallback)
        except Exception as exc:
            return Response(f"Trajectory computation failed: {exc}", status_code=502)

    linestring_wkt = _points_to_wkt(points)

    try:
        strip_geom = await buffer_linestring(linestring_wkt, config.strip_half_width_m)
    except Exception as exc:
        return Response(f"Strip buffer failed: {exc}", status_code=500)

    result = make_feature_collection(
        points=points,
        strip_geom=strip_geom,
        duration_hours=duration_hours,
        strip_half_width_m=config.strip_half_width_m,
    )

    return Response(
        content=json.dumps(result, ensure_ascii=False),
        media_type="application/geo+json",
        headers={"Cache-Control": "public, max-age=1800"},
    )
