export type DurationHours = 24 | 48 | 72

export interface TrajectoryFeature {
  type: 'Feature'
  geometry:
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Polygon'; coordinates: [number, number][][] }
    | { type: 'Point'; coordinates: [number, number] }
  properties: {
    kind: 'trajectory_centerline' | 'trajectory_strip' | 'trajectory_endpoint'
    durationHours: DurationHours
    widthKm?: number
  }
}

export interface TrajectoryFeatureCollection {
  type: 'FeatureCollection'
  features: TrajectoryFeature[]
}

export async function fetchAirTrajectory(
  lat: number,
  lon: number,
  durationHours: DurationHours,
  signal: AbortSignal
): Promise<TrajectoryFeatureCollection> {
  const url = `/api/weather/air-trajectory?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&durationHours=${durationHours}`
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Trajectory request failed: ${response.status}`)
  }
  return response.json() as Promise<TrajectoryFeatureCollection>
}
