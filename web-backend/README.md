# OpenInfraMap Web Backend

Async Python web app ([Starlette](https://www.starlette.io/)) serving stats pages,
data exports, and a JSON API.

## Configuration

Requires `DATABASE_URL` pointing at the OpenInfraMap PostGIS database:

```
DATABASE_URL=postgresql://osm:osm@localhost:5433/osm
DEBUG=true
```

Copy `.env.example` to `.env` and adjust for local development.

## Development

You'll need [uv](https://docs.astral.sh/uv/) installed (see root `Makefile` — `make backend-dev`
installs it automatically). With the Docker DB running:

```bash
uv run uvicorn main:app --reload
# or:
make backend-dev    # from repo root (sets DATABASE_URL automatically)
```

The server starts on http://localhost:8000.

## Endpoints

### Pages

| Route | Description |
|-------|-------------|
| `GET /about` | About page |
| `GET /copyright` | Copyright & attribution |
| `GET /exports` | Data export listing |
| `GET /stats` | Global stats overview |
| `GET /stats/charts` | Stats charts (Bokeh, cached 24 h) |
| `GET /stats/country/{iso2}` | Per-country stats page |
| `GET /stats/area/{region}` | Per-region stats |
| `GET /stats/area/{region}/plants` | Power plants in region |
| `GET /stats/area/{region}/plants/construction` | Plants under construction |
| `GET /stats/area/{region}/plants/{id}` | Individual plant detail |
| `GET /stats/object/plant/{id}` | Redirect → plant detail by OSM id |
| `GET /wikidata/{wikidata_id}` | Wikidata proxy (cached 24 h) |
| `GET /sitemap.xml` | XML sitemap |

### API

| Route | Description |
|-------|-------------|
| `GET /api/export?layer=<table>&fmt=geojson\|csv` | Download layer as GeoJSON or CSV |
| `GET /search/typeahead?q=<query>` | Typeahead search (cached 24 h) |
| `GET /stats/country/{iso2}.json` | Per-country stats as JSON |
| `GET /api/annotations` | List all map annotations (GeoJSON FeatureCollection) |
| `GET /api/annotation/{id}` | Single annotation |
| `POST /api/annotation` | Create or update annotation |
| `DELETE /api/annotation/{id}` | Delete annotation |
