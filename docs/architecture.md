# Open Infrastructure Map Architecture

## Service topology

```
Browser
  │
  └─► web-router (nginx, :80/:443)
        ├─► /authelia/…          → Authelia (SSO, :9091)
        ├─► /map/…               → Tegola (vector tiles, :80)
        ├─► /stats, /about, …    → web-backend (Starlette, :80)
        └─► everything else      → web (nginx static, :80)
                                       └─► tiles proxied to Tegola
```

All Docker Compose services share the default bridge network. The `db` (PostGIS) service
is not port-mapped in production; only `web-router` is exposed externally.

---

## Web frontend

The [web frontend](../web) is a TypeScript single-page app built with [Vite](https://vitejs.dev/)
and [MapLibre GL JS](https://maplibre.org/). It is served as static files by nginx.

Key source files:

| File | Purpose |
|------|---------|
| `src/openinframap.ts` | App entry point — map init, layer switcher, controls |
| `src/style/style.ts` | Assembles the full MapLibre style from all sub-styles |
| `src/style/style_oim_*.ts` | Per-theme layer definitions (power, railway, telecoms, …) |
| `src/style/style_oim_gem.ts` | Global Energy Monitor layer styles |
| `src/voltage-filter.ts` | VoltageFilter map control — filters power lines by voltage class |
| `src/cache_warmer.ts` | CacheWarmer control — pre-warms tile cache for a drawn bbox |

**For frontend-only development**, run `npm run dev` in `web/`. By default it proxies
tile and API requests to the production server at `openinframap.org`, so no local
backend is needed.

---

## Web backend

The [web backend](../web-backend) is an async Python app ([Starlette](https://www.starlette.io/))
that serves stats pages, data exports, and a JSON API. See [`web-backend/README.md`](../web-backend/README.md)
for the full endpoint list.

---

## Database

The database runs [PostgreSQL](https://www.postgresql.org/) with [PostGIS](https://postgis.net/).
It is populated from two sources:

1. **OpenStreetMap replication** — via [Imposm 3](https://imposm.org/docs/imposm3/latest/).
   The mapping is defined in [`imposm/`](../imposm) using a Python DSL that generates
   `mapping.json`. Changes require a full re-import (see [`imposm/README.md`](../imposm/README.md)).

2. **Global Energy Monitor (GEM)** — external tracker data (coal, nuclear, hydro, gas, …)
   imported via [`imposm/gem_import.py`](../imposm/gem_import.py) into the `gem_facility`
   PostGIS table (schema in [`schema/gem.sql`](../schema/gem.sql)).
   Use `./gem_import.sh` for the import workflow.

Additional schema objects live in [`schema/`](../schema):
- `views.sql` — materialized views (`substation`, `power_line_view`, …)
- `functions.sql` — PostGIS helper functions
- `gem.sql` — `gem_facility` table + `osm_railway_traction_substation` compat view

---

## Tile server

Map tiles are served with [Tegola](https://tegola.io/). The tile layer config lives in
[`tegola/layers.yml`](../tegola/layers.yml) and is compiled to a TOML config at Docker
build time by [`tegola/generate_tegola_config.py`](../tegola/generate_tegola_config.py).

Available tile maps (endpoints `/map/<name>/{z}/{x}/{y}.pbf`):

`power`, `telecoms`, `petroleum`, `water`, `other_pipelines`, `railway`, `port`,
`airport`, `bridge`, `military`, `industry`, `gem`, `openinframap` (combined)

To apply changes to `layers.yml` in the running stack:

```bash
make tegola-regen
# or:
docker compose build tegola && docker compose up -d tegola
```

---

## Web router

The [web router](../web-router) is an nginx container that:

- Routes `/map/…` to the Tegola tile server (with tile caching)
- Routes `/stats`, `/about`, `/exports`, `/api/…`, `/wikidata/…`, `/search/…`, `/sitemap.xml` to the web backend
- Serves everything else from the static web frontend
- Enforces authentication via [Authelia](https://www.authelia.com/) SSO (`auth_request`)
- Proxies `/satellite/…` tiles to an external CDN (bypasses auth)

---

## Authentication

[Authelia 4.37](https://www.authelia.com/) provides SSO in the self-hosted deployment.
Config lives in [`authelia/`](../authelia). All routes except `/authelia/…` and satellite
tile CDN proxies are protected by `auth_request`.

User management: `./auth-user.sh hash <password>` / `./auth-user.sh add <user> <hash>`.

---

## Tile expiry

Invalidated tiles from the OSM diff feed are processed by [`tegola/expire.py`](../tegola/expire.py),
which also refreshes PostGIS materialized views:

```bash
python3 tegola/expire.py /path/to/imposm-expire
```

Low-zoom layers are seeded periodically:

```bash
tegola cache seed --bounds="-180,-85.0511,180,85.0511" --max-zoom 6 --overwrite \
  --config tegola/config.toml
```
