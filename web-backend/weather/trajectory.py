"""
Lagrangian air-mass trajectory using 4th-order Runge–Kutta integration.

Each RK4 step requires four wind evaluations at slightly different positions
and times. Wind data is fetched from the provider (with per-point caching),
so nearby positions within the same ~1 km cache cell reuse a single API call.
"""

from datetime import datetime, timedelta, timezone
from math import cos, degrees, radians

from .models import Point, TrajectoryConfig
from .wind_provider import WindProvider

EARTH_RADIUS_M = 6_371_000.0


def _move_point(point: Point, u: float, v: float, dt_seconds: float) -> Point:
    """Advance a geographic point by (u, v) wind vector over dt_seconds."""
    lat_rad = radians(point.lat)

    dlat = degrees(v * dt_seconds / EARTH_RADIUS_M)
    dlon = degrees(u * dt_seconds / (EARTH_RADIUS_M * cos(lat_rad)))

    new_lat = max(-89.9, min(89.9, point.lat + dlat))
    new_lon = ((point.lon + dlon + 180.0) % 360.0) - 180.0
    return Point(lat=new_lat, lon=new_lon)


async def _rk4_step(
    point: Point,
    time: datetime,
    dt_seconds: float,
    provider: WindProvider,
) -> Point:
    half_dt = dt_seconds / 2.0

    k1 = await provider.get_wind(point, time)

    p2 = _move_point(point, k1.u, k1.v, half_dt)
    k2 = await provider.get_wind(p2, time + timedelta(seconds=half_dt))

    p3 = _move_point(point, k2.u, k2.v, half_dt)
    k3 = await provider.get_wind(p3, time + timedelta(seconds=half_dt))

    p4 = _move_point(point, k3.u, k3.v, dt_seconds)
    k4 = await provider.get_wind(p4, time + timedelta(seconds=dt_seconds))

    u_avg = (k1.u + 2.0 * k2.u + 2.0 * k3.u + k4.u) / 6.0
    v_avg = (k1.v + 2.0 * k2.v + 2.0 * k3.v + k4.v) / 6.0

    return _move_point(point, u_avg, v_avg, dt_seconds)


async def build_trajectory(
    start: Point,
    config: TrajectoryConfig,
    provider: WindProvider,
) -> list[Point]:
    """
    Compute the Lagrangian trajectory of an air mass starting at `start`
    for `config.duration_hours` hours using RK4 with `config.step_minutes` steps.
    """
    now = datetime.now(timezone.utc)
    dt_seconds = config.step_minutes * 60.0
    steps = (config.duration_hours * 60) // config.step_minutes

    points: list[Point] = [start]
    current = start
    current_time = now

    for _ in range(steps):
        current = await _rk4_step(
            point=current,
            time=current_time,
            dt_seconds=dt_seconds,
            provider=provider,
        )
        current_time += timedelta(seconds=dt_seconds)
        points.append(current)

    return points
