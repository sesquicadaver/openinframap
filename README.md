[![IRC](https://img.shields.io/badge/IRC-%23osm--infrastructure-brightgreen)](https://webchat.oftc.net/?channels=osm-infrastructure)
[![Matrix](https://img.shields.io/matrix/osm-infrastructure:matrix.org?server_fqdn=matrix.org&logo=matrix)](https://matrix.to/#/#osm-infrastructure:matrix.org)
[![Mastodon](https://img.shields.io/badge/dynamic/json?label=Mastodon&color=6364ff&query=followers_count&url=https://en.osm.town/api/v1/accounts/lookup?acct=OpenInfraMap&logo=mastodon)](https://en.osm.town/@OpenInfraMap)

# Open Infrastructure Map
This is the main repository for [Open Infrastructure Map](https://openinframap.org), a map showing the world's
infrastructure from [OpenStreetMap](https://www.openstreetmap.org).

![Screenshot of OpenInfraMap](./docs/screenshots/main.png)

## Translations
We're aiming to make OpenInfraMap multilingual - if you can help translate, please
[contribute on Weblate](https://hosted.weblate.org/engage/open-infrastructure-map/).
[![Translation status](https://hosted.weblate.org/widget/open-infrastructure-map/multi-auto.svg)](https://hosted.weblate.org/engage/open-infrastructure-map/)

Anyone can add a new language to Weblate - once the translation is more than 75% complete, please raise [an issue](https://github.com/openinframap/openinframap/issues) so we can enable it on the website.

## Repository structure

| Directory | Description |
|-----------|-------------|
| [`web/`](./web) | TypeScript/MapLibre GL JS frontend (Vite) |
| [`web-backend/`](./web-backend) | Python (Starlette) stats & API backend |
| [`web-router/`](./web-router) | nginx reverse proxy — routes traffic between services |
| [`tegola/`](./tegola) | Vector tile server config (Tegola + YAML-based layer DSL) |
| [`imposm/`](./imposm) | OSM → PostGIS import config (Imposm 3 mapping + Python DSL) |
| [`schema/`](./schema) | SQL schema — views, functions, GEM facilities table |
| [`authelia/`](./authelia) | Authelia 4.37 SSO config (used in self-hosted deployment) |
| [`gem-data/`](./gem-data) | Drop Global Energy Monitor xlsx/csv files here before import |

## Development
For details on how to develop Open Infrastructure Map, see the [architecture documentation](./docs/architecture.md).

Quick start (Docker):

```bash
docker compose up -d
# Frontend dev server with hot reload (uses production tile/API backend):
cd web && npm install && npm run dev
```
