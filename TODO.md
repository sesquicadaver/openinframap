## Цільова архітектура розширення

Поточний проєкт логічно розширювати як **модульну GIS-платформу**:

```text
OSM / external datasets / climate data
        ↓
import layer: Imposm / custom ETL / API proxy
        ↓
PostGIS / cache / materialized views
        ↓
Tegola vector tiles або окремий raster/weather overlay
        ↓
MapLibre frontend + layer registry + legend + controls
```

OpenInfraMap уже має правильну базову архітектуру: frontend на TypeScript + MapLibre GL JS, backend на Starlette, БД PostgreSQL/PostGIS, імпорт через Imposm 3, tile server через Tegola. 

---

# План робіт

## 1. Ввести єдиний реєстр шарів у frontend

Замість ручного додавання кожного шару в різні місця frontend треба зробити централізований registry.

Рекомендована структура:

```text
web/src/layers/
  registry.ts
  types.ts
  groups/
    power.ts
    telecom.ts
    water.ts
    petroleum.ts
    climate.ts
    transport.ts
```

Кожен шар має описуватись конфігурацією:

```ts
type MapLayerConfig = {
  id: string;
  group: "power" | "telecom" | "water" | "climate" | "transport";
  titleKey: string;
  sourceLayer: string;
  minzoom: number;
  maxzoom?: number;
  defaultVisible: boolean;
  legend: LegendItem[];
  style: maplibregl.LayerSpecification[];
};
```

Ціль: новий шар додається не через зміну логіки UI, а через один config-entry.

---

## 2. Розширювати OSM-шари через Imposm modules

Поточний підхід у репозиторії правильний: `imposm/main.py` імпортує тематичні модулі `power`, `telecoms`, `petroleum`, `water`, які генерують mapping для Imposm. 

Нові OSM-шари треба додавати так само:

```text
imposm/rail.py
imposm/transport.py
imposm/renewables.py
imposm/industrial.py
imposm/environment.py
```

Після цього підключати модуль у `imposm/main.py`:

```python
import rail  # noqa
import transport  # noqa
```

Поточні приклади вже є: `telecoms.py` описує telecom-шари через OSM-теги, а `water.py` описує водну інфраструктуру.  

---

## 3. Черговість додавання нових інфраструктурних шарів

Пріоритет варто визначати за практичною цінністю:

| Пріоритет | Шари                                              | Джерело                          |
| --------- | ------------------------------------------------- | -------------------------------- |
| 1         | Залізниця, електрифікація, тягові підстанції      | OSM                              |
| 1         | Газопроводи, нафтопроводи, компресорні станції    | OSM / petroleum module           |
| 1         | Водна інфраструктура, насосні станції, резервуари | OSM                              |
| 2         | Телеком: вежі, дата-центри, кабелі                | OSM                              |
| 2         | Порти, аеропорти, логістичні вузли                | OSM                              |
| 3         | Промислові об’єкти                                | OSM                              |
| 3         | Адміністративні межі / зони відповідальності      | OSM / Natural Earth / local data |
| 4         | Демографія, щільність населення                   | external datasets                |
| 4         | Ризики: повені, пожежі, спека, вітер              | climate/weather datasets         |

Для OSM-шарів pipeline однаковий:

```text
OSM tags → Imposm table → PostGIS view → Tegola layer → MapLibre style → UI toggle
```

---

## 4. Відокремити raw import від presentation model

Не варто напряму використовувати сирі Imposm-таблиці в frontend.

Рекомендована схема БД:

```text
import_osm       -- сирі таблиці Imposm
infra            -- нормалізовані infrastructure tables/views
tiles            -- optimized views для Tegola
analytics        -- risk scoring, summaries, climate joins
```

Приклад:

```sql
CREATE MATERIALIZED VIEW tiles.rail_line AS
SELECT
    osm_id,
    geometry,
    type,
    name,
    operator,
    electrified,
    voltage,
    gauge,
    CASE
        WHEN construction IS NOT NULL THEN 'construction'
        WHEN disused IS NOT NULL THEN 'disused'
        ELSE 'active'
    END AS status
FROM import_osm.rail_line;
```

Перевага: frontend і Tegola не залежать напряму від деталей OSM-tagging.

---

## 5. Модульна конфігурація Tegola

Для кожного нового шару треба мати окремий SQL-layer у Tegola:

```toml
[[providers.layers]]
name = "rail_line"
geometry_fieldname = "geometry"
id_fieldname = "osm_id"
geometry_type = "LineString"
sql = """
SELECT
    osm_id,
    geometry,
    type,
    status,
    electrified,
    voltage,
    gauge
FROM tiles.rail_line
WHERE geometry && !BBOX!
"""
```

Tegola вже є частиною архітектури OpenInfraMap як tile server. 

---

# Інтеграція кліматичних / погодних шарів

## 6. Розділити “weather forecast” і “climate”

Треба не змішувати два різні типи даних:

| Тип                               | Приклад                                                            | Оптимальне джерело                                 |
| --------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| **Поточна погода / forecast**     | вітер, опади, температура, грози, тиск                             | Windy.com API                                      |
| **Історія / клімат / reanalysis** | середні температури, історичний вітер, аномалії, кліматичні ризики | ERA5 / Copernicus / власний raster pipeline        |
| **Ризики для інфраструктури**     | wind risk для ЛЕП, flood risk для підстанцій                       | власна аналітика на основі forecast + climate data |

Windy.com API краще підходить для **погодних forecast overlays**, а не для повноцінної кліматичної бази.

---

## 7. Windy.com Map Forecast API — як map overlay

Windy.com має **Map Forecast API**, який дає погодну карту з шарами, particles, legend, picker та isolines. Важливе обмеження: API базується на **Leaflet 1.4.x**, тоді як OpenInfraMap frontend використовує **MapLibre GL JS**. ([api.windy.com][1])

Тому є два варіанти інтеграції.

### Варіант A — рекомендований: окремий Weather Mode

```text
Infrastructure Mode:
  MapLibre + OpenInfraMap vector tiles

Weather Mode:
  Windy Map Forecast API + синхронізовані infrastructure overlays
```

Це найстабільніший варіант, бо не треба насильно змішувати MapLibre canvas і Leaflet/Windy map.

### Варіант B — синхронізований overlay

```text
MapLibre main map
Windy Leaflet map у overlay container
camera sync: center / zoom / bounds
```

Це складніше. Windy API має обмеження: лише один Windy Map instance на сторінці, використовує global CSS/id selectors і активно використовує `localStorage`. ([api.windy.com][1])

Мій висновок: **для production краще Weather Mode, не змішаний canvas overlay**.

---

## 8. Windy.com Point Forecast API — для аналітики об’єктів

Для інфраструктури корисніший не лише візуальний шар, а й точковий прогноз для об’єктів:

```text
ЛЕП / підстанція / генератор
        ↓
координати або centroid
        ↓
Windy Point Forecast API
        ↓
wind_gust / temp / precip / pressure / cape
        ↓
risk score
```

Point Forecast API повертає machine-readable forecast для заданих координат через POST-запит. ([api.windy.com][2])

Приклад використання:

```text
- прогноз поривів вітру для ЛЕП
- ризик обмерзання
- екстремальна температура для підстанцій
- опади для доступності об’єктів
- CAPE / грозовий ризик
```

Важливо: Point Forecast API **не повертає історичні дані**, лише актуальні forecast values на наступні дні; ECMWF у Point Forecast не включений через ліцензійні умови. ([api.windy.com][3])

API key для Point Forecast треба ховати за backend proxy, не викладати в frontend.

---

## 9. Windy.com licensing / production-ризик

Для production не можна закладатися на free/testing режим.

Windy Map Forecast API має testing tier тільки для development, а Professional tier призначений для production/corporate використання. Professional pricing на сторінці Windy API вказаний як 990 €/year, з окремою опцією ECMWF. ([api.windy.com][4])

Point Forecast API testing tier повертає модифіковані/перемішані дані й також не призначений для production; Professional має production quota. ([api.windy.com][3])

Отже, перед інтеграцією потрібно зафіксувати:

```text
- тип API: Map Forecast / Point Forecast / обидва
- production license
- дозволені моделі
- quota
- allowed domains
- attribution requirements
- data retention policy
```

---

## 10. Windy.app — не основний API-кандидат

Windy.app варто розглядати обережно. Офіційні сторінки описують його як професійний mobile/weather app з моделями, weather profiles, live map і Weather Archive, але не як публічний developer map-layer API рівня Windy.com API. ([WINDY.APP][5])

Практична рекомендація:

```text
Windy.com API  → для інтеграції в карту
Windy.app      → тільки зовнішні посилання / партнерський доступ / окремий контракт
```

---

# Якщо потрібні саме кліматичні шари

## 11. Для climate/reanalysis краще окремий pipeline на ERA5

Для справжніх кліматичних шарів краще використовувати ERA5 / Copernicus Climate Data Store, а не Windy. ERA5 надає hourly reanalysis для атмосферних, land-surface і sea-state параметрів, доступний з 1940 року, на регулярній сітці 0.25° × 0.25°, з оновленням приблизно за 5 днів після реального часу. ([climate.copernicus.eu][6])

Рекомендований pipeline:

```text
ERA5 / ERA5-Land NetCDF / GRIB
        ↓
ETL: xarray / rasterio / rio-cogeo
        ↓
COG / MBTiles / GeoTIFF
        ↓
raster tile server
        ↓
MapLibre raster layer
```

Шари:

```text
- середня температура
- температурні аномалії
- середня швидкість вітру
- максимальні пориви
- precipitation sum
- drought index
- flood exposure
- icing risk
- heat stress
```

---

# 12. Backend для погодної аналітики

Додати в `web-backend` окремий модуль:

```text
web-backend/
  weather/
    windy_client.py
    cache.py
    risk.py
    schemas.py
```

Функції:

```text
GET /api/weather/point?lat=...&lon=...
GET /api/weather/asset/{asset_id}
GET /api/weather/risk/power-line/{osm_id}
```

Логіка:

```text
1. frontend передає координати або osm_id
2. backend знаходить geometry/centroid у PostGIS
3. backend викликає Windy Point Forecast API
4. відповідь кешується
5. frontend отримує нормалізований forecast/risk payload
```

Кешування:

```text
forecast cache TTL: 1–3 години
risk score TTL: 3–6 годин
climate aggregates: days/months
```

---

# 13. Risk scoring для інфраструктури

Окремий практичний напрям — не просто показати погоду, а рахувати ризики.

Приклад для електромереж:

```text
power_line + wind_gust forecast → wind exposure
power_substation + precipitation forecast → flooding exposure
power_tower + freezing temperature + precipitation → icing risk
power_generator + temperature anomaly → heat stress
```

Приклад таблиці:

```sql
CREATE TABLE analytics.asset_weather_risk (
    asset_type text NOT NULL,
    asset_id bigint NOT NULL,
    forecast_time timestamptz NOT NULL,
    risk_type text NOT NULL,
    risk_score numeric NOT NULL,
    source text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (asset_type, asset_id, forecast_time, risk_type)
);
```

---

# 14. План реалізації по етапах

## Етап 1 — Layer foundation

```text
[ ] Створити frontend layer registry
[ ] Уніфікувати layer groups
[ ] Уніфікувати legend/toggle/i18n
[ ] Додати contract для source-layer naming
[ ] Додати smoke tests для layer visibility
```

Результат: нові шари додаються контрольовано, без хаотичних змін UI.

---

## Етап 2 — Нові OSM-шари

```text
[ ] Обрати 2–3 пріоритетні групи: rail / transport / industrial
[ ] Додати imposm modules
[ ] Згенерувати mapping.json
[ ] Зробити full re-import
[ ] Створити PostGIS views
[ ] Додати Tegola layers
[ ] Додати MapLibre styles
```

Важливо: якщо змінюються Imposm mapping files, потрібен re-import OSM database. Це прямо зазначено в архітектурній документації проєкту. 

---

## Етап 3 — Windy.com Map Forecast PoC

```text
[ ] Отримати Windy Map Forecast API key
[ ] Створити Weather Mode route/view
[ ] Підключити Leaflet 1.4.x + Windy libBoot
[ ] Реалізувати layer selector: wind / temp / rain / pressure
[ ] Перевірити CSS conflicts
[ ] Перевірити attribution і production license
```

Ціль PoC: зрозуміти, чи достатньо окремого Windy weather mode без складного MapLibre/Leaflet overlay.

---

## Етап 4 — Windy Point Forecast + backend proxy

```text
[ ] Додати backend proxy endpoint
[ ] Сховати Windy API key на backend
[ ] Додати Redis/Postgres cache
[ ] Реалізувати forecast by coordinate
[ ] Реалізувати forecast by asset_id
[ ] Додати risk score для power_line і power_substation
```

Це дасть більше практичної цінності, ніж просто weather overlay.

---

## Етап 5 — Climate/reanalysis pipeline

```text
[ ] Визначити climate datasets: ERA5 / ERA5-Land
[ ] Вибрати параметри: wind, gust, precipitation, temperature
[ ] Підготувати ETL з NetCDF/GRIB у COG/MBTiles
[ ] Додати raster tile serving
[ ] Додати MapLibre raster layers
[ ] Побудувати climate risk aggregates
```

---

## Етап 6 — Production hardening

```text
[ ] API quota monitoring
[ ] cache hit-rate monitoring
[ ] tile generation metrics
[ ] layer performance tests
[ ] map rendering regression tests
[ ] attribution/legal review
[ ] disaster fallback: вимкнення Windy overlay при API failure
```

---

# Рекомендована стратегія

Найраціональніший порядок:

```text
1. Спочатку зробити layer registry.
2. Потім додати 2–3 нові OSM-шари через Imposm/PostGIS/Tegola.
3. Потім зробити Windy.com Map Forecast як окремий Weather Mode.
4. Потім додати Windy Point Forecast через backend proxy.
5. Для справжніх кліматичних шарів — окремий ERA5 pipeline, не Windy.
```

Ключове рішення: **Windy.com використовувати для forecast-візуалізації та точкового прогнозу, а кліматичні/історичні шари будувати окремо через ERA5/Copernicus.**

[1]: https://api.windy.com/map-forecast/docs?utm_source=chatgpt.com "Documentation - Map Forecast - Windy API"
[2]: https://api.windy.com/point-forecast/docs?utm_source=chatgpt.com "Documentation - Point Forecast - Windy API"
[3]: https://api.windy.com/point-forecast/pricing?utm_source=chatgpt.com "Point Forecast - Windy API"
[4]: https://api.windy.com/map-forecast/pricing?utm_source=chatgpt.com "Map Forecast - Windy API"
[5]: https://windy.app/company/what-is-windy-app.html?utm_source=chatgpt.com "What is Windy.app - Windy.app"
[6]: https://climate.copernicus.eu/climate-reanalysis?utm_source=chatgpt.com "Climate reanalysis | Copernicus"
