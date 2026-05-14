import { LayerSpecificationWithZIndex } from './types.ts'
import { text_paint, font } from './common.js'
import { get_local_name } from './common.ts'
import { get, interpolate, match, zoom } from './stylehelpers.ts'

const railway_color = match(get('type'), [
  [['rail'], '#444444'],
  [['narrow_gauge'], '#6B4226'],
  [['light_rail', 'subway', 'tram', 'monorail'], '#888888'],
], '#888888')

const railway_width = interpolate(zoom, [
  [3, 0.4],
  [6, 0.8],
  [10, 1.5],
  [14, 2.5]
])

export default function layers(): LayerSpecificationWithZIndex[] {
  return [
    {
      zorder: 35,
      id: 'railway_line_casing',
      type: 'line',
      source: 'railway',
      minzoom: 7,
      'source-layer': 'railway_line',
      filter: ['all',
        ['!', ['get', 'disused']],
        ['!', ['has', 'construction']],
        ['in', ['get', 'type'], ['literal', ['rail', 'narrow_gauge', 'light_rail']]]
      ],
      paint: {
        'line-color': '#ffffff',
        'line-width': interpolate(zoom, [[7, 2], [14, 5]])
      }
    },
    {
      zorder: 36,
      id: 'railway_line_main',
      type: 'line',
      source: 'railway',
      minzoom: 3,
      'source-layer': 'railway_line',
      filter: ['all',
        ['!', ['get', 'disused']],
        ['!', ['has', 'construction']],
        ['!', ['in', ['get', 'type'], ['literal', ['tram', 'subway', 'light_rail', 'monorail']]]]
      ],
      paint: {
        'line-color': railway_color,
        'line-width': railway_width,
      }
    },
    {
      zorder: 36,
      id: 'railway_line_urban',
      type: 'line',
      source: 'railway',
      minzoom: 8,
      'source-layer': 'railway_line',
      filter: ['all',
        ['!', ['get', 'disused']],
        ['!', ['has', 'construction']],
        ['in', ['get', 'type'], ['literal', ['tram', 'subway', 'light_rail', 'monorail']]]
      ],
      paint: {
        'line-color': '#888888',
        'line-width': railway_width,
        'line-dasharray': [4, 2]
      }
    },
    {
      zorder: 36,
      id: 'railway_line_disused',
      type: 'line',
      source: 'railway',
      minzoom: 9,
      'source-layer': 'railway_line',
      filter: ['get', 'disused'],
      paint: {
        'line-color': '#aaaaaa',
        'line-width': 1,
        'line-dasharray': [4, 4]
      }
    },
    {
      zorder: 36,
      id: 'railway_line_construction',
      type: 'line',
      source: 'railway',
      minzoom: 7,
      'source-layer': 'railway_line',
      filter: ['has', 'construction'],
      paint: {
        'line-color': '#f5a623',
        'line-width': railway_width,
        'line-dasharray': [5, 3]
      }
    },
    {
      zorder: 540,
      id: 'railway_station_label',
      type: 'symbol',
      source: 'railway',
      minzoom: 5,
      'source-layer': 'railway_station',
      filter: ['==', ['get', 'type'], 'station'],
      paint: text_paint,
      layout: {
        'text-field': get_local_name(),
        'text-font': font,
        'text-size': interpolate(zoom, [[5, 9], [10, 11], [14, 13]]),
        'text-anchor': 'center',
        'text-optional': true,
      }
    },
    {
      zorder: 160,
      id: 'railway_traction_substation',
      type: 'fill',
      source: 'railway',
      minzoom: 12,
      'source-layer': 'railway_traction_substation',
      paint: {
        'fill-color': '#c9530a',
        'fill-opacity': 0.3,
        'fill-outline-color': '#c9530a'
      }
    },
    {
      zorder: 541,
      id: 'railway_traction_substation_point',
      type: 'symbol',
      source: 'railway',
      minzoom: 9,
      'source-layer': 'railway_traction_substation_point',
      paint: text_paint,
      layout: {
        'text-field': get_local_name(),
        'text-font': font,
        'text-size': 10,
        'text-anchor': 'top',
        'text-offset': [0, 0.5],
        'text-optional': true,
      }
    },
    {
      zorder: 545,
      id: 'railway_label',
      type: 'symbol',
      source: 'railway',
      minzoom: 10,
      'source-layer': 'railway_line',
      filter: ['all',
        ['!', ['get', 'disused']],
        ['in', ['get', 'type'], ['literal', ['rail', 'narrow_gauge']]]
      ],
      paint: text_paint,
      layout: {
        'text-field': get_local_name(),
        'text-font': font,
        'symbol-placement': 'line',
        'symbol-spacing': 500,
        'text-size': 10,
        'text-offset': [0, 1],
        'text-max-angle': 10
      }
    }
  ]
}
