import i18next from 'i18next'
import style_base from './style_base.js'
import style_labels from './style_labels.js'
import style_oim_power from './style_oim_power.js'
import style_oim_power_heatmap from './style_oim_power_heatmap.js'
import style_oim_telecoms from './style_oim_telecoms.js'
import style_oim_petroleum from './style_oim_petroleum.js'
import style_oim_water from './style_oim_water.js'
import style_oim_other_pipelines from './style_oim_other_pipelines.js'
import style_osmose from './style_osmose.js'
import style_oim_railway from './style_oim_railway.js'
import style_oim_port from './style_oim_port.js'
import style_oim_airport from './style_oim_airport.js'
import style_oim_bridge from './style_oim_bridge.js'
import { StyleSpecification } from 'maplibre-gl'

const OIM_TILE_BASE = (import.meta.env.VITE_OIM_TILE_BASE as string | undefined) || window.location.origin

const oim_attribution =
  '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://openinframap.org/copyright">Open Infrastructure Map</a>'

function sunDeclinationAngle(date: Date): number {
  const dayOfYear =
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) /
    24 /
    60 /
    60 /
    1000

  return 23.44 * Math.cos((360 / 365) * (dayOfYear + 10) * (Math.PI / 180))
}

function sunPolarAngle(date: Date): number {
  const angle = ((date.getUTCHours() + date.getUTCMinutes() / 60) / 24) * 360
  return angle
}

function sunPosition(date: Date): [number, number, number] {
  return [1.5, 90 + sunDeclinationAngle(date), sunPolarAngle(date)]
}

const style: StyleSpecification = {
  version: 8,
  name: 'Open Infrastructure Map',
  projection: {
    type: 'mercator'
  },
  light: {
    anchor: 'map',
    color: '#F5F02E',
    intensity: 0.8,
    position: sunPosition(new Date())
  },
  sources: {
    basemap: {
      type: 'vector',
      tiles: [`${OIM_TILE_BASE}/basemap/{z}/{x}/{y}.mvt`],
      maxzoom: 15,
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
    },
    blackmarble: {
      type: 'raster',
      tiles: ['/blackmarble/{z}/{x}/{y}.webp'],
      tileSize: 256,
      maxzoom: 8,
      attribution:
        '<a href="https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VNP46A4/">NASA Black Marble 2024</a>'
    },
    satellite: {
      type: 'raster',
      tiles: ['/satellite/{z}/{x}/{y}.jpg'],
      tileSize: 256,
      maxzoom: 18,
      attribution: '© <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics'
    },
    power: {
      type: 'vector',
      tiles: [`${OIM_TILE_BASE}/map/power/{z}/{x}/{y}.pbf`],
      maxzoom: 17,
      attribution: oim_attribution
    },
    petroleum: {
      type: 'vector',
      tiles: [`${OIM_TILE_BASE}/map/petroleum/{z}/{x}/{y}.pbf`],
      maxzoom: 17,
      attribution: oim_attribution
    },
    telecoms: {
      type: 'vector',
      tiles: [`${OIM_TILE_BASE}/map/telecoms/{z}/{x}/{y}.pbf`],
      maxzoom: 17,
      attribution: oim_attribution
    },
    water: {
      type: 'vector',
      tiles: [`${OIM_TILE_BASE}/map/water/{z}/{x}/{y}.pbf`],
      maxzoom: 17,
      attribution: oim_attribution
    },
    solar_heatmap: {
      type: 'vector',
      tiles: [`${OIM_TILE_BASE}/map/solar_heatmap/{z}/{x}/{y}.pbf`],
      maxzoom: 17,
      attribution: oim_attribution
    },
    other_pipeline: {
      type: 'vector',
      tiles: [`${OIM_TILE_BASE}/map/other_pipeline/{z}/{x}/{y}.pbf`],
      maxzoom: 17,
      attribution: oim_attribution
    },
    railway: {
      type: 'vector',
      tiles: [`${OIM_TILE_BASE}/map/railway/{z}/{x}/{y}.pbf`],
      maxzoom: 17,
      attribution: oim_attribution
    },
    port: {
      type: 'vector',
      tiles: [`${OIM_TILE_BASE}/map/port/{z}/{x}/{y}.pbf`],
      maxzoom: 17,
      attribution: oim_attribution
    },
    airport: {
      type: 'vector',
      tiles: [`${OIM_TILE_BASE}/map/airport/{z}/{x}/{y}.pbf`],
      maxzoom: 17,
      attribution: oim_attribution
    },
    bridge: {
      type: 'vector',
      tiles: [`${OIM_TILE_BASE}/map/bridge/{z}/{x}/{y}.pbf`],
      maxzoom: 17,
      attribution: oim_attribution
    },
    osmose_errors_power: {
      type: 'vector',
      tiles: ['https://osmose.openstreetmap.fr/api/0.3/issues/{z}/{x}/{y}.mvt?tags=power'],
      maxzoom: 17,
      minzoom: 11
    }
  },
  glyphs: '/fonts/{fontstack}/{range}.pbf',
  layers: []
}

export function getLayers() {
  return [
    ...style_oim_power(),
    ...style_oim_power_heatmap,
    ...style_oim_petroleum(),
    ...style_oim_telecoms(),
    ...style_oim_water(),
    ...style_oim_other_pipelines(),
    ...style_osmose(),
    ...style_oim_railway(),
    ...style_oim_port(),
    ...style_oim_airport(),
    ...style_oim_bridge()
  ]
}

export function getStyle() {
  const oim_layers = [...getLayers(), ...style_labels(i18next.language)]

  oim_layers.sort((a, b) => {
    if (!a.zorder || !b.zorder) {
      throw new Error('zorder is required for all layers')
    }
    if (a.zorder < b.zorder) return -1
    if (a.zorder > b.zorder) return 1
    return 0
  })

  style.layers = [...style_base, ...oim_layers]
  return style
}
