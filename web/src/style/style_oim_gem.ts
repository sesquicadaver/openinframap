import { LayerSpecificationWithZIndex } from './types.ts'
import { text_paint, font } from './common.js'
import { get, interpolate, match, zoom } from './stylehelpers.ts'

const gem_color = match(get('tracker'), [
  [['coal'],       '#555555'],
  [['nuclear'],    '#FF9800'],
  [['hydro'],      '#00BCD4'],
  [['gas'],        '#2196F3'],
  [['oil'],        '#795548'],
  [['oil_gas'],    '#A1887F'],
  [['bioenergy'],  '#4CAF50'],
  [['chemicals'],  '#9C27B0'],
  [['power'],      '#F44336'],
], '#9E9E9E')

const gem_radius = interpolate(zoom, [
  [2,  3],
  [6,  4],
  [10, 6],
  [14, 9],
])

export default function layers(): LayerSpecificationWithZIndex[] {
  return [
    {
      zorder: 470,
      id: 'gem_facility_circle',
      type: 'circle',
      source: 'gem',
      minzoom: 2,
      'source-layer': 'gem_facility',
      paint: {
        'circle-radius': gem_radius,
        'circle-color': gem_color,
        'circle-opacity': 0.85,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
      }
    },
    {
      zorder: 471,
      id: 'gem_facility_label',
      type: 'symbol',
      source: 'gem',
      minzoom: 10,
      'source-layer': 'gem_facility',
      paint: text_paint,
      layout: {
        'text-field': get('name'),
        'text-font': font,
        'text-size': 10,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-optional': true,
      }
    },
  ]
}
