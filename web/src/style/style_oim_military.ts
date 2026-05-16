import { LayerSpecificationWithZIndex } from './types.ts'
import { text_paint, font } from './common.js'
import { get_local_name } from './common.ts'
import { get, interpolate, match, zoom } from './stylehelpers.ts'

const military_fill_color = match(get('type'), [
  [['bunker', 'ammunition'], '#5D4037'],
  [['base', 'naval_base', 'installation'], '#6B7432'],
  [['barracks'], '#7D8B3E'],
  [['range', 'training_area'], '#8D9E4A'],
  [['depot'], '#6B7432'],
], '#6B7432')

export default function layers(): LayerSpecificationWithZIndex[] {
  return [
    {
      zorder: 10,
      id: 'military_area',
      type: 'fill',
      source: 'military',
      minzoom: 6,
      'source-layer': 'military_polygon',
      paint: {
        'fill-color': military_fill_color,
        'fill-opacity': 0.2,
      }
    },
    {
      zorder: 11,
      id: 'military_area_outline',
      type: 'line',
      source: 'military',
      minzoom: 6,
      'source-layer': 'military_polygon',
      paint: {
        'line-color': '#6B7432',
        'line-width': interpolate(zoom, [[6, 0.5], [12, 1.5]]),
        'line-dasharray': [4, 2]
      }
    },
    {
      zorder: 508,
      id: 'military_point',
      type: 'circle',
      source: 'military',
      minzoom: 8,
      maxzoom: 12,
      'source-layer': 'military_point',
      paint: {
        'circle-radius': interpolate(zoom, [[8, 3], [11, 5]]),
        'circle-color': military_fill_color,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#3E4520'
      }
    },
    {
      zorder: 532,
      id: 'military_label',
      type: 'symbol',
      source: 'military',
      minzoom: 9,
      'source-layer': 'military_point',
      paint: text_paint,
      layout: {
        'text-field': get_local_name(),
        'text-font': font,
        'text-size': interpolate(zoom, [[9, 9], [13, 12]]),
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-optional': true
      }
    }
  ]
}
