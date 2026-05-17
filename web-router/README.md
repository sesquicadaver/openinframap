# OpenInfraMap Web Router

nginx container that acts as the single entry point for all HTTP traffic.
Listens on `:80` (and `:443` when TLS is configured).

## Routing

| Path prefix | Upstream | Notes |
|-------------|----------|-------|
| `/map/…` | `oim-tileserver` (Tegola) | Tile cache enabled (3650 d); gzip |
| `/satellite/…` | external CDN | Proxied; **bypasses auth** |
| `/authelia/…` | `oim-authelia:9091` | SSO login UI & API |
| `/stats`, `/about`, `/copyright`, `/exports`, `/api/…`, `/wikidata/…`, `/search/…`, `/sitemap.xml` | `oim-web-backend` | Protected by auth |
| everything else | `oim-web` (static nginx) | Protected by auth |

## Authentication

Every protected route issues a subrequest to Authelia (`/internal/authelia/authz`)
via `auth_request`. Unauthenticated requests are redirected to `/authelia/?rd=<original-url>`.

## Tile cache

Vector tiles served from `/map/…` are cached on disk at `/var/cache/nginx/tiles`
with a 3650-day inactive TTL (effectively permanent until explicitly purged).

## Configuration

`nginx.conf` is the only configuration file. Upstream service names (`oim-web`,
`oim-tileserver`, `oim-web-backend`, `oim-authelia`) are resolved via Docker's
internal DNS and must match the network aliases defined in `docker-compose.yml`.