import { LayerSpecificationWithZIndex } from './types.ts'
import { text_paint, font } from './common.js'
import { get_local_name } from './common.ts'
import { interpolate, zoom } from './stylehelpers.ts'

export default function layers(): LayerSpecificationWithZIndex[] {
  return [
    {
      zorder: 115,
      id: 'port_area',
      type: 'fill',
      source: 'port',
      minzoom: 7,
      'source-layer': 'port',
      paint: {
        'fill-color': '#005f8f',
        'fill-opacity': 0.15,
        'fill-outline-color': '#005f8f'
      }
    },
    {
      zorder: 116,
      id: 'port_area_outline',
      type: 'line',
      source: 'port',
      minzoom: 7,
      'source-layer': 'port',
      paint: {
        'line-color': '#005f8f',
        'line-width': interpolate(zoom, [[7, 0.5], [12, 1.5]]),
        'line-opacity': 0.7
      }
    },
    {
      zorder: 230,
      id: 'pier_line',
      type: 'line',
      source: 'port',
      minzoom: 11,
      'source-layer': 'pier',
      paint: {
        'line-color': '#6b8fa8',
        'line-width': interpolate(zoom, [[11, 1], [15, 3]])
      }
    },
    {
      zorder: 510,
      id: 'port_point',
      type: 'circle',
      source: 'port',
      minzoom: 7,
      'source-layer': 'port_point',
      paint: {
        'circle-radius': interpolate(zoom, [[7, 3], [10, 5], [14, 7]]),
        'circle-color': '#005f8f',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#003a57'
      }
    },
    {
      zorder: 511,
      id: 'ferry_terminal_point',
      type: 'circle',
      source: 'port',
      minzoom: 8,
      'source-layer': 'ferry_terminal',
      paint: {
        'circle-radius': interpolate(zoom, [[8, 4], [12, 6]]),
        'circle-color': '#0077b6',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#003a57'
      }
    },
    {
      zorder: 535,
      id: 'port_label',
      type: 'symbol',
      source: 'port',
      minzoom: 9,
      'source-layer': 'port_point',
      paint: text_paint,
      layout: {
        'text-field': get_local_name(),
        'text-font': font,
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-optional': true
      }
    },
    {
      zorder: 536,
      id: 'ferry_terminal_label',
      type: 'symbol',
      source: 'port',
      minzoom: 10,
      'source-layer': 'ferry_terminal',
      paint: text_paint,
      layout: {
        'text-field': get_local_name(),
        'text-font': font,
        'text-size': 10,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-optional': true
      }
    }
  ]
}
