# OpenInfraMap Database

The OpenInfraMap database is a subset of OSM replicated by [imposm3](https://imposm.org).

## DB Setup
### Development
There's a Docker Compose file in the root of the repository which is primarily intended for testing
new Imposm configuration. If you're just testing changes to the live website or styles, there's no
need to run this - you can just use the live tileserver.

You'll need an OSM export file in PBF format. You're probably best off using a Geofabrik subset
rather than the full planet for testing.

First, start the DB container:

    docker compose up db

This will also create the "osm" database and import [functions.sql](../schema/functions.sql).

Now you can run imposm to import the data:

    docker compose run --rm --build -v $PWD/greater-london-latest.osm.pbf:/data.osm.pbf imposm import -connection postgis://osm:osm@db/osm -mapping /mapping.json -read /data.osm.pbf -write -optimize -deployproduction

Now create the views from [views.sql](../schema/views.sql) - you can open the postgres console with:

    docker compose exec db psql -U osm osm

### Production
Production config is likely to be more complex and I can't provide support for it. (The live 
OpenInfraMap instance is run as containers using Kubernetes.)

I suggest creating separate Postgres user accounts for imposm and for the tile server.

## Additional data

### MarineRegions EEZ boundaries

The [web backend](../web-backend) requires country EEZ boundaries to attribute offshore wind
farms to the correct country. These are sourced from the marineregions.org
[Marine and Land Zones](https://marineregions.org/sources.php#unioneezcountry) dataset.

```bash
shp2pgsql -s 4326 -d ./EEZ_land_union_v4_202410.shp countries.country_eez > ./country_eez.sql
psql "$DB_URI" -f country_eez.sql
```

Then create the materialized views used for lookups:

```sql
CREATE MATERIALIZED VIEW countries.country_eez_sub AS
SELECT country_eez.gid, country_eez."union", country_eez.mrgid_eez,
    country_eez.territory1, country_eez.mrgid_ter1,
    country_eez.iso_ter1, country_eez.iso_sov1, country_eez.pol_type,
    ST_Subdivide(ST_Transform(country_eez.geom, 3857)) AS geom
FROM countries.country_eez
WHERE country_eez."union"::text <> 'Antarctica'::text;

CREATE INDEX country_eez_sub_geom    ON countries.country_eez_sub USING GIST (geom);
CREATE INDEX country_eez_sub_iso_sov1 ON countries.country_eez_sub(iso_sov1);
CREATE INDEX country_eez_sub_iso_ter1 ON countries.country_eez_sub(iso_ter1);

CREATE MATERIALIZED VIEW countries.country_eez_3857 AS
SELECT country_eez.gid, country_eez."union", country_eez.mrgid_eez,
    country_eez.territory1, country_eez.mrgid_ter1,
    country_eez.iso_ter1, country_eez.iso_sov1, country_eez.pol_type,
    ST_Transform(country_eez.geom, 3857) AS geom
FROM countries.country_eez
WHERE country_eez."union"::text <> 'Antarctica'::text;

CREATE INDEX country_eez_3857_geom ON countries.country_eez_3857 USING GIST (geom);
```

### Global Energy Monitor (GEM)

GEM tracker data (coal, nuclear, hydro, gas, oil, bioenergy, chemicals, …) is imported
into the `gem_facility` PostGIS table (schema: [`schema/gem.sql`](../schema/gem.sql)).

This data is **not** managed by Imposm — it uses a separate import script:

```bash
# Apply schema (once):
make sql FILE=schema/gem.sql

# Download tracker xlsx files from globalenergymonitor.org → gem-data/
# Then import all at once:
./gem_import.sh
```

See [`gem_import.py`](./gem_import.py) for supported trackers and column mapping details,
and the root [`gem_import.sh`](../gem_import.sh) for the Docker-based import workflow.
