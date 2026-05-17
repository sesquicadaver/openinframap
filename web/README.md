# Web Frontend

The web frontend for Open Infrastructure Map, written in TypeScript and built with [Vite](https://vitejs.dev/)
using [MapLibre GL JS](https://maplibre.org/).

## Development

```bash
npm install
npm run dev        # start Vite dev server with hot reload at http://localhost:5173
```

By default, tile and API requests are proxied to the production server at `openinframap.org`,
so no local backend is needed for frontend development.

## Available npm scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server (alias: `npm start`) |
| `npm run build` | Production build into `dist/` |
| `npm run lint` | Run ESLint + Prettier checks |
| `npm test` | Run Vitest test suite (requires dev server running) |
| `npm run extract` | Extract i18next translation keys from source into `src/locales/` |

## Testing

Linting uses [Prettier](https://prettier.io/) and [ESLint](https://eslint.org/):

```bash
npm run lint
```

The test suite uses [Vitest](https://vitest.dev/) with [Puppeteer](https://pptr.dev/) for
browser-based tests. Start the dev server first, then:

```bash
npm test
```

## Translation

Translation is handled via [i18next](https://www.i18next.com/) with strings loaded from
`src/locales/<lang>/translation.json`. When adding a new UI string:

1. Use `t('key', 'English fallback')` in source code.
2. Run `npm run extract` to update `src/locales/en/translation.json`.
3. Commit the updated file — Weblate picks it up automatically.

Translations are hosted on [Weblate](https://hosted.weblate.org/engage/open-infrastructure-map/).
Languages with > 75% coverage can be enabled — raise an issue to request activation.
