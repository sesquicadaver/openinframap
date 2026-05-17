"""
Builds the 20 km trajectory strip using PostGIS geography buffer.
ST_Buffer on geography type accepts radius in metres and produces
a geodetically correct buffer regardless of latitude.
"""

import json

from config import database

from .models import Point


def _points_to_wkt(points: list[Point]) -> str:
    coords = ", ".join(f"{p.lon:.6f} {p.lat:.6f}" for p in points)
    return f"LINESTRING({coords})"


async def buffer_linestring(linestring_wkt: str, half_width_m: float) -> dict:
    """Return the GeoJSON geometry of a geodesic buffer around a WKT LineString."""
    row = await database.fetch_one(
        """
        SELECT ST_AsGeoJSON(
            ST_Buffer(
                ST_GeogFromText(:wkt),
                :radius
            )::geometry
        ) AS geom
        """,
        values={"wkt": linestring_wkt, "radius": half_width_m},
    )
    return json.loads(row["geom"])


def make_feature_collection(
    points: list[Point],
    strip_geom: dict,
    duration_hours: int,
    strip_half_width_m: float,
) -> dict:
    centerline_coords = [[p.lon, p.lat] for p in points]
    endpoint = points[-1]

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": centerline_coords,
                },
                "properties": {
                    "kind": "trajectory_centerline",
                    "durationHours": duration_hours,
                },
            },
            {
                "type": "Feature",
                "geometry": strip_geom,
                "properties": {
                    "kind": "trajectory_strip",
                    "widthKm": (strip_half_width_m * 2) / 1000,
                    "durationHours": duration_hours,
                },
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [endpoint.lon, endpoint.lat],
                },
                "properties": {
                    "kind": "trajectory_endpoint",
                    "durationHours": duration_hours,
                },
            },
        ],
    }
