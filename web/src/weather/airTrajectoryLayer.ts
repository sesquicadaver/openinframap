import type { Map, GeoJSONSource } from 'maplibre-gl'
import type { TrajectoryFeatureCollection } from './airTrajectoryClient'

const SOURCE_ID = 'oim-air-trajectory'
const LAYER_STRIP = 'oim-air-trajectory-strip'
const LAYER_CENTERLINE = 'oim-air-trajectory-centerline'
const LAYER_ENDPOINT = 'oim-air-trajectory-endpoint'

const EMPTY_FC: TrajectoryFeatureCollection = { type: 'FeatureCollection', features: [] }

export function addTrajectoryLayers(map: Map): void {
  map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY_FC })

  map.addLayer({
    id: LAYER_STRIP,
    type: 'fill',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'trajectory_strip'],
    paint: {
      'fill-color': '#3887be',
      'fill-opacity': 0.14
    }
  })

  map.addLayer({
    id: LAYER_STRIP + '-outline',
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'trajectory_strip'],
    paint: {
      'line-color': '#3887be',
      'line-width': 1,
      'line-opacity': 0.5
    }
  })

  map.addLayer({
    id: LAYER_CENTERLINE,
    type: 'line',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'trajectory_centerline'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#1a6fa8',
      'line-width': 2,
      'line-dasharray': [4, 3],
      'line-opacity': 0.85
    }
  })

  map.addLayer({
    id: LAYER_ENDPOINT,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'trajectory_endpoint'],
    paint: {
      'circle-radius': 7,
      'circle-color': '#1a6fa8',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-opacity': 0.9
    }
  })
}

export function updateTrajectoryData(map: Map, data: TrajectoryFeatureCollection): void {
  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
  source?.setData(data)
}

export function clearTrajectoryData(map: Map): void {
  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
  source?.setData(EMPTY_FC)
}

export function removeTrajectoryLayers(map: Map): void {
  for (const id of [
    LAYER_ENDPOINT,
    LAYER_CENTERLINE,
    LAYER_STRIP + '-outline',
    LAYER_STRIP
  ]) {
    if (map.getLayer(id)) map.removeLayer(id)
  }
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
}

export function setLayerVisibility(
  map: Map,
  layer: 'centerline' | 'endpoint',
  visible: boolean
): void {
  const id = layer === 'centerline' ? LAYER_CENTERLINE : LAYER_ENDPOINT
  if (map.getLayer(id)) {
    map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
  }
}
