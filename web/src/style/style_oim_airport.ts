import { LayerSpecificationWithZIndex } from './types.ts'
import { text_paint, font } from './common.js'
import { get_local_name } from './common.ts'
import { get, interpolate, match, zoom } from './stylehelpers.ts'

const aeroway_area_color = match(get('type'), [
  [['terminal'], '#c8a96e'],
  [['hangar'], '#a0856e'],
  [['apron'], '#d4c5a9'],
  [['helipad'], '#3d9970'],
], '#d4c5a9')

export default function layers(): LayerSpecificationWithZIndex[] {
  return [
    {
      zorder: 110,
      id: 'airport_area',
      type: 'fill',
      source: 'airport',
      minzoom: 6,
      'source-layer': 'airport',
      paint: {
        'fill-color': '#dfd9c8',
        'fill-opacity': 0.5,
        'fill-outline-color': '#9e8e6e'
      }
    },
    {
      zorder: 111,
      id: 'airport_area_outline',
      type: 'line',
      source: 'airport',
      minzoom: 6,
      'source-layer': 'airport',
      paint: {
        'line-color': '#9e8e6e',
        'line-width': interpolate(zoom, [[6, 0.5], [12, 2]])
      }
    },
    {
      zorder: 112,
      id: 'aeroway_area_fill',
      type: 'fill',
      source: 'airport',
      minzoom: 10,
      'source-layer': 'aeroway_area',
      paint: {
        'fill-color': aeroway_area_color,
        'fill-opacity': 0.6
      }
    },
    {
      zorder: 220,
      id: 'runway_line',
      type: 'line',
      source: 'airport',
      minzoom: 9,
      'source-layer': 'runway',
      filter: ['==', get('type'), 'runway'],
      paint: {
        'line-color': '#555',
        'line-width': interpolate(zoom, [[9, 2], [12, 6], [15, 20]])
      }
    },
    {
      zorder: 221,
      id: 'taxiway_line',
      type: 'line',
      source: 'airport',
      minzoom: 11,
      'source-layer': 'runway',
      filter: ['==', get('type'), 'taxiway'],
      paint: {
        'line-color': '#888',
        'line-width': interpolate(zoom, [[11, 1], [14, 4]])
      }
    },
    {
      zorder: 505,
      id: 'airport_point',
      type: 'circle',
      source: 'airport',
      minzoom: 6,
      maxzoom: 10,
      'source-layer': 'airport_point',
      paint: {
        'circle-radius': interpolate(zoom, [[6, 3], [9, 6]]),
        'circle-color': match(get('military'), [['yes', '#8B4513']], '#8B6914'),
        'circle-stroke-width': 1,
        'circle-stroke-color': '#5a3e00'
      }
    },
    {
      zorder: 506,
      id: 'helipad_point',
      type: 'circle',
      source: 'airport',
      minzoom: 10,
      'source-layer': 'helipad',
      paint: {
        'circle-radius': interpolate(zoom, [[10, 3], [14, 6]]),
        'circle-color': '#3d9970',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#1a5c42'
      }
    },
    {
      zorder: 537,
      id: 'airport_label',
      type: 'symbol',
      source: 'airport',
      minzoom: 7,
      'source-layer': 'airport_point',
      paint: text_paint,
      layout: {
        'text-field': get_local_name(),
        'text-font': font,
        'text-size': interpolate(zoom, [[7, 10], [12, 13]]),
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-optional': true
      }
    },
    {
      zorder: 538,
      id: 'airport_iata_label',
      type: 'symbol',
      source: 'airport',
      minzoom: 8,
      maxzoom: 11,
      'source-layer': 'airport_point',
      paint: text_paint,
      layout: {
        'text-field': ['get', 'iata'],
        'text-font': font,
        'text-size': 9,
        'text-anchor': 'bottom',
        'text-offset': [0, -0.8],
        'text-optional': true
      }
    }
  ]
}
