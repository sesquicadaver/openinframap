import asyncio
import contextlib
from typing import AsyncIterator, TypedDict
import httpx
from starlette.responses import PlainTextResponse, RedirectResponse
from starlette.applications import Starlette
from starlette.templating import Jinja2Templates
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
import bokeh.resources
import json

from bokeh.embed import json_item

from template_functions import (
    format_power,
    osm_link,
    country_name,
    format_length,
    format_voltage,
    format_percent,
    format_external_url,
)
from config import database, DEBUG
from util import cache_for
from sitemap import sitemap
from data import (
    get_local_stats,
    LOCAL_STAT_TABLES,
)
import charts

templates = Jinja2Templates(directory="templates")

templates.env.filters["power"] = format_power
templates.env.filters["distance"] = format_length
templates.env.filters["voltage"] = format_voltage
templates.env.filters["percent"] = format_percent
templates.env.filters["country_name"] = country_name
templates.env.globals["osm_link"] = osm_link
templates.env.filters["external_url"] = format_external_url
templates.env.globals["BOKEH_JS"] = bokeh.resources.INLINE


class State(TypedDict):
    http_client: httpx.AsyncClient


@contextlib.asynccontextmanager
async def lifespan(app: Starlette) -> AsyncIterator[State]:
    await database.connect()
    async with httpx.AsyncClient(
        headers={
            "User-Agent": "Open Infrastructure Map backend (https://openinframap.org)"
        }
    ) as client:
        yield {"http_client": client}
    await database.disconnect()


app = Starlette(
    debug=DEBUG,
    lifespan=lifespan,
    routes=[
        Mount("/static", app=StaticFiles(directory="static"), name="static"),
        Route("/sitemap.xml", sitemap),
    ],
    middleware=[
        Middleware(CORSMiddleware, allow_origin_regex="http://localhost.*"),
    ],
)


@app.route("/")
async def main(request):
    # Dummy response - this endpoint is served statically in production from the webpack build
    return PlainTextResponse("")


@app.route("/about")
@cache_for(3600)
async def about(request):
    return templates.TemplateResponse("about.html", {"request": request})


@app.route("/about/exports")
@cache_for(3600)
async def exports_redirect(request):
    return RedirectResponse("/exports")


@app.route("/exports")
@cache_for(3600)
async def exports(request):
    return templates.TemplateResponse(
        "exports.html",
        {"request": request, "layers": LOCAL_STAT_TABLES},
    )


@app.route("/api/export")
async def api_export(request):
    import io
    layer_key = request.query_params.get("layer", "")
    fmt = request.query_params.get("fmt", "geojson")

    valid_tables = {t for _, t in LOCAL_STAT_TABLES}
    if layer_key not in valid_tables:
        from starlette.responses import Response
        return Response("Unknown layer", status_code=404)

    filename = layer_key.replace("osm_", "")

    if fmt == "geojson":
        row = await database.fetch_one(
            f"""SELECT json_build_object(
                'type', 'FeatureCollection',
                'features', coalesce(json_agg(
                    json_build_object(
                        'type', 'Feature',
                        'geometry', ST_AsGeoJSON(ST_Transform(geometry, 4326))::json,
                        'properties', json_build_object('osm_id', osm_id, 'name',
                            COALESCE(tags->>'name', tags->>'name:en', '')))
                ), '[]'::json)
            ) AS fc FROM {layer_key}"""
        )
        from starlette.responses import Response
        import json
        return Response(
            content=json.dumps(row["fc"], ensure_ascii=False),
            media_type="application/geo+json",
            headers={"Content-Disposition": f'attachment; filename="{filename}.geojson"'},
        )
    elif fmt == "csv":
        rows = await database.fetch_all(
            f"""SELECT osm_id,
                COALESCE(tags->>'name', tags->>'name:en', '') AS name,
                ST_X(ST_Centroid(ST_Transform(geometry, 4326))) AS lon,
                ST_Y(ST_Centroid(ST_Transform(geometry, 4326))) AS lat
            FROM {layer_key}"""
        )
        buf = io.StringIO()
        buf.write("osm_id,name,lon,lat\n")
        for r in rows:
            name = str(r["name"]).replace('"', '""')
            buf.write(f'{r["osm_id"]},"{name}",{r["lon"]},{r["lat"]}\n')
        from starlette.responses import Response
        return Response(
            content=buf.getvalue().encode("utf-8"),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
        )
    else:
        from starlette.responses import Response
        return Response("Bad format", status_code=400)


@app.route("/copyright")
@cache_for(3600)
async def copyright(request):
    return templates.TemplateResponse("copyright.html", {"request": request})


@app.route("/stats")
async def stats(request):
    local_stats = await get_local_stats()
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "local_stats": local_stats,
        },
    )


@app.route("/stats/charts")
@cache_for(86400)
async def stats_charts(request):
    async with asyncio.TaskGroup() as tg:
        lines_plot = tg.create_task(charts.line_length())
        plants_plot = tg.create_task(charts.plant_count())
        output_plot = tg.create_task(charts.plant_output())
        substation_plot = tg.create_task(charts.substation_count())

    return templates.TemplateResponse(
        "charts.html",
        {
            "request": request,
            "lines_plot": json.dumps(
                json_item(lines_plot.result(), "lines_plot", charts.theme)
            ),
            "plants_plot": json.dumps(
                json_item(plants_plot.result(), "plants_plot", charts.theme)
            ),
            "output_plot": json.dumps(
                json_item(output_plot.result(), "output_plot", charts.theme)
            ),
            "substation_plot": json.dumps(
                json_item(substation_plot.result(), "substations_plot", charts.theme)
            ),
        },
    )


import views.wikidata  # noqa
import views.search  # noqa
import views.area  # noqa
import views.country  # noqa
import views.annotations  # noqa
