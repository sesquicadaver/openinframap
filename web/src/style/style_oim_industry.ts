import { LayerSpecificationWithZIndex } from './types.ts'
import { text_paint, font } from './common.js'
import { get_local_name } from './common.ts'
import { get, interpolate, match, zoom } from './stylehelpers.ts'

const zone_fill_color = match(get('type'), [
  [['quarry'], '#C4A265'],
  [['industrial'], '#9090A8'],
], '#9090A8')

const zone_line_color = match(get('type'), [
  [['quarry'], '#8B6914'],
  [['industrial'], '#606078'],
], '#606078')

export default function layers(): LayerSpecificationWithZIndex[] {
  return [
    {
      zorder: 12,
      id: 'industry_zone',
      type: 'fill',
      source: 'industry',
      minzoom: 8,
      'source-layer': 'industrial_zone',
      paint: {
        'fill-color': zone_fill_color,
        'fill-opacity': 0.2,
      }
    },
    {
      zorder: 13,
      id: 'industry_zone_outline',
      type: 'line',
      source: 'industry',
      minzoom: 8,
      'source-layer': 'industrial_zone',
      paint: {
        'line-color': zone_line_color,
        'line-width': interpolate(zoom, [[8, 0.4], [12, 1]])
      }
    },
    {
      zorder: 14,
      id: 'industry_works',
      type: 'fill',
      source: 'industry',
      minzoom: 10,
      'source-layer': 'works_polygon',
      paint: {
        'fill-color': '#7878A0',
        'fill-opacity': 0.35,
        'fill-outline-color': '#4A4A70'
      }
    },
    {
      zorder: 509,
      id: 'industry_works_point',
      type: 'circle',
      source: 'industry',
      minzoom: 9,
      maxzoom: 13,
      'source-layer': 'works_point',
      paint: {
        'circle-radius': interpolate(zoom, [[9, 3], [12, 5]]),
        'circle-color': '#7878A0',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#4A4A70'
      }
    },
    {
      zorder: 533,
      id: 'industry_label',
      type: 'symbol',
      source: 'industry',
      minzoom: 11,
      'source-layer': 'works_point',
      paint: text_paint,
      layout: {
        'text-field': get_local_name(),
        'text-font': font,
        'text-size': interpolate(zoom, [[11, 9], [14, 12]]),
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-optional': true
      }
    }
  ]
}
