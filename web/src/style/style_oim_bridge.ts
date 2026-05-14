import { LayerSpecificationWithZIndex } from './types.ts'
import { text_paint, font } from './common.js'
import { get_local_name } from './common.ts'
import { get, interpolate, match, zoom } from './stylehelpers.ts'

const bridge_color = match(get('highway'), [
  [['motorway', 'trunk'], '#e06000'],
  [['primary', 'secondary'], '#d09000'],
  [['tertiary', 'unclassified', 'residential'], '#888888'],
], match(get('railway'), [
  [['rail', 'narrow_gauge'], '#444444'],
  [['light_rail', 'subway', 'tram'], '#666666'],
], '#aaaaaa'))

const bridge_width = interpolate(zoom, [
  [7, 1],
  [10, 2],
  [13, 4],
  [16, 8]
])

export default function layers(): LayerSpecificationWithZIndex[] {
  return [
    {
      zorder: 245,
      id: 'bridge_casing',
      type: 'line',
      source: 'bridge',
      minzoom: 7,
      'source-layer': 'bridge',
      paint: {
        'line-color': '#333333',
        'line-width': interpolate(zoom, [[7, 2.5], [10, 4], [13, 7], [16, 13]]),
        'line-opacity': 0.5
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      }
    },
    {
      zorder: 246,
      id: 'bridge_line',
      type: 'line',
      source: 'bridge',
      minzoom: 7,
      'source-layer': 'bridge',
      paint: {
        'line-color': bridge_color,
        'line-width': bridge_width
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      }
    },
    {
      zorder: 543,
      id: 'bridge_label',
      type: 'symbol',
      source: 'bridge',
      minzoom: 10,
      'source-layer': 'bridge',
      filter: ['has', 'name'],
      paint: text_paint,
      layout: {
        'text-field': get_local_name(),
        'text-font': font,
        'text-size': 11,
        'symbol-placement': 'line',
        'text-offset': [0, 1],
        'text-optional': true
      }
    }
  ]
}
