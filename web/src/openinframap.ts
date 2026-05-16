import maplibregl from 'maplibre-gl'
import { t } from 'i18next'
import { mount } from 'redom'

import { LayerSwitcher, URLHash, Layer, LayerGroup } from '@russss/maplibregl-layer-switcher'

import EditButton from './edit-control.js'
import InfoPopup from './popup/infopopup.js'
import KeyControl from './key/key.js'
import WarningBox from './warning-box/warning-box.js'
import OIMSearch from './search/search.ts'

import { getStyle, getLayers } from './style/style.js'

import { ValidationErrorPopup } from './popup/validation-error-popup.js'
import { SymbolLoader } from './symbol-loader.ts'
import { ClickRouter } from './click-router.js'
import { VoltageFilter } from './voltage-filter.ts'

export default class OpenInfraMap {
  map?: maplibregl.Map

  isWebglSupported() {
    if (window.WebGLRenderingContext) {
      const canvas = document.createElement('canvas')
      try {
        const context =
          canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ||
          canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true })
        if (context && typeof context.getParameter == 'function') {
          return true
        }
      } catch {
        // WebGL is supported, but disabled
      }
      return false
    }
    // WebGL not supported
    return false
  }

  constructor() {
    if (!this.isWebglSupported()) {
      const infobox = new WarningBox(t('warning', 'Warning'))
      infobox.update(t('warnings.webgl'))
      mount(document.body, infobox)
    }

    maplibregl.setRTLTextPlugin(
      '/mapbox-gl-rtl-text.min.js',
      true // Lazy load the plugin
    )
  }

  init() {
    const layer_switcher = new LayerSwitcher(
      [
        new LayerGroup(t('layers.background'), [
          new Layer('A', t('openstreetmap'), 'osm_', 'background', true),
          new Layer('SAT', t('satellite', 'Satellite'), 'satellite_', 'background', false),
          new Layer('N', t('layers.nighttime-lights'), 'black_marble', 'background', false)
        ]),
        new LayerGroup(t('layers.overlays'), [
          new Layer('L', t('layers.labels'), 'label_', true),
          new Layer('B', t('layers.borders'), 'boundaries_', true)
        ]),
        new LayerGroup(t('layers.heatmaps'), [
          new Layer('S', t('layers.solar-generation'), 'heatmap_', false)
        ]),
        new LayerGroup(t('layers.infrastructure'), [
          new Layer('PL', t('layers.power-lines', 'Power Lines'), 'power_line_', true),
          new Layer('PS', t('layers.power-substations', 'Substations'), 'power_substation', true),
          new Layer('PP', t('layers.power-plants', 'Power Plants'), 'power_plant', true),
          new Layer('PT', t('layers.power-towers', 'Pylons & Poles'), 'power_tower_', true),
          new Layer('T', t('layers.telecoms'), 'telecoms_', false),
          new Layer('O', t('layers.petroleum'), 'petroleum_', false),
          new Layer('I', t('layers.other-pipelines'), 'pipeline_', false),
          new Layer('W', t('layers.water'), 'water_', false),
          new Layer('RL', t('layers.railway-lines', 'Railway Lines'), 'railway_line_', false),
          new Layer('RS', t('layers.railway-stations', 'Stations'), 'railway_station_', false),
          new Layer('RT', t('layers.railway-traction', 'Traction Substations'), 'railway_traction_', false),
          new Layer('PO', t('layers.port', 'Ports'), 'port_', false),
          new Layer('FT', t('layers.ferry-terminals', 'Ferry Terminals'), 'ferry_terminal_', false),
          new Layer('BR', t('layers.bridges', 'Bridges'), 'bridge_', false),
          new Layer('AI', t('layers.airports', 'Airports'), 'airport_', false),
          new Layer('RW', t('layers.runways', 'Runways'), 'runway_', false),
        ]),
        new LayerGroup(t('layers.validation'), [
          new Layer('E', t('layers.osmose-power'), 'osmose_errors_power', false)
        ])
      ],
      t('layers.title', 'Layers')
    )
    const url_hash = new URLHash(layer_switcher)

    const map_style = getStyle()

    layer_switcher.setInitialVisibility(map_style)

    const map = new maplibregl.Map(
      url_hash.init({
        container: 'map',
        style: map_style,
        maxZoom: 20,
        zoom: 2,
        center: [12, 26],
        localIdeographFontFamily: "'Apple LiSung', 'Noto Sans', 'Noto Sans CJK SC', sans-serif"
      })
    )

    const clickRouter = new ClickRouter(map, map_style.layers)
    new SymbolLoader(map)

    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()

    url_hash.enable(map)
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true
        },
        trackUserLocation: true
      })
    )

    map.addControl(new maplibregl.ScaleControl({}), 'bottom-left')

    map.addControl(new KeyControl(), 'top-right')
    map.addControl(layer_switcher, 'top-right')
    map.addControl(new VoltageFilter(), 'top-right')
    map.addControl(new EditButton(), 'bottom-right')
    map.addControl(new OIMSearch(), 'top-left')
    new InfoPopup(
      getLayers().map((layer: { [x: string]: any }) => layer['id']),
      6
    ).add(map, clickRouter)
    new ValidationErrorPopup(map, clickRouter)

    clickRouter.register()
    this.map = map
  }
}
