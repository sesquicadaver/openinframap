# OpenInfraMap Tileserver

Map tiles are served with [Tegola](https://tegola.io/). Layer definitions live in
`layers.yml` and are compiled to a Tegola TOML config at Docker build time by
`generate_tegola_config.py`.

## Layer configuration

`layers.yml` declares:
- **field_sets** — reusable column groups (geometry, name translations, voltage, wiki)
- **layers** — one entry per vector tile layer, each referencing a PostGIS table/view and
  specifying geometry type, zoom range, fields, and a `WHERE` clause

After editing `layers.yml`, rebuild the container to apply changes:

```sh
docker compose build tegola && docker compose up -d tegola
# or via Makefile:
make tegola-regen
```

## Generating config manually

```sh
python3 ./generate_tegola_config.py ./tegola.yml ./layers.yml > ./config.toml
```

## Docker image

The `Dockerfile` copies `tegola.yml` + `layers.yml`, runs `generate_tegola_config.py`,
and bakes the resulting `config.toml` into the image.

Environment variables at runtime:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_URI` | `postgres://user:password@host:5432/database` | PostGIS connection string |
| `BOUNDS` | `-180,-85.0511,180,85.0511` | Tile serving extent |

## Tile expiry

Expired tile paths from the Imposm diff feed are processed by `expire.py`, which also
refreshes PostGIS materialized views. In the Docker Compose setup this runs as a
separate process or cron job outside the main container.