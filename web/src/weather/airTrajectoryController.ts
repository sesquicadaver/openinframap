import './airTrajectoryController.css'
import type { Map, IControl, MapMouseEvent } from 'maplibre-gl'
import {
  fetchAirTrajectory,
  type DurationHours,
  type TrajectoryFeatureCollection
} from './airTrajectoryClient'
import {
  addTrajectoryLayers,
  clearTrajectoryData,
  removeTrajectoryLayers,
  setLayerVisibility,
  updateTrajectoryData
} from './airTrajectoryLayer'

const DEBOUNCE_MS = 600
const DURATIONS: DurationHours[] = [24, 48, 72]

// ---------------------------------------------------------------------------
// Shared state — owns trajectory logic, notifies both IControls via callbacks
// ---------------------------------------------------------------------------

class AirTrajectoryState {
  active = false
  duration: DurationHours = 24
  showCenterline = true
  showEndpoint = true

  private _map: Map | null = null
  private abortCtrl: AbortController | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  private _onActiveChange: Array<(active: boolean) => void> = []
  private _onStatus: Array<(msg: string, cls?: 'loading' | 'error') => void> = []

  onActiveChange(cb: (active: boolean) => void): void { this._onActiveChange.push(cb) }
  onStatus(cb: (msg: string, cls?: 'loading' | 'error') => void): void { this._onStatus.push(cb) }
  getMap(): Map | null { return this._map }

  setMap(map: Map): void { this._map = map }

  toggle(): void { this.active ? this.disable() : this.enable() }

  enable(): void {
    if (!this._map || this.active) return
    this.active = true
    addTrajectoryLayers(this._map)
    this._map.on('click', this._onClick)
    this._map.getCanvas().style.cursor = 'crosshair'
    this._fireActive(true)
    this._fireStatus('Click on the map to set start point')
  }

  disable(): void {
    if (!this._map || !this.active) return
    this.active = false
    this._map.off('click', this._onClick)
    this._map.getCanvas().style.cursor = ''
    this.abortCtrl?.abort()
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    removeTrajectoryLayers(this._map)
    this._fireActive(false)
    this._fireStatus('')
  }

  setDuration(h: DurationHours): void {
    this.duration = h
    if (this.active && this._map) {
      clearTrajectoryData(this._map)
      this._fireStatus('Click on the map to set start point')
    }
  }

  private _onClick = (event: MapMouseEvent): void => {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(
      () => void this._update(event.lngLat.lat, event.lngLat.lng),
      DEBOUNCE_MS
    )
  }

  private async _update(lat: number, lon: number): Promise<void> {
    this.abortCtrl?.abort()
    this.abortCtrl = new AbortController()
    this._fireStatus('Computing…', 'loading')
    try {
      const data = await fetchAirTrajectory(lat, lon, this.duration, this.abortCtrl.signal)
      this._applyVisibility(data)
      if (this._map) updateTrajectoryData(this._map, data)
      this._fireStatus(`+${this.duration}h trajectory`)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      this._fireStatus(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  private _applyVisibility(data: TrajectoryFeatureCollection): void {
    data.features = data.features.filter((f) => {
      if (f.properties.kind === 'trajectory_centerline' && !this.showCenterline) return false
      if (f.properties.kind === 'trajectory_endpoint' && !this.showEndpoint) return false
      return true
    })
  }

  private _fireActive(v: boolean): void { this._onActiveChange.forEach((cb) => cb(v)) }
  private _fireStatus(msg: string, cls?: 'loading' | 'error'): void {
    this._onStatus.forEach((cb) => cb(msg, cls))
  }
}

// ---------------------------------------------------------------------------
// Toggle button — standalone IControl (icon-only, like MapLibre's own buttons)
// ---------------------------------------------------------------------------

export class AirTrajectoryToggle implements IControl {
  private container!: HTMLDivElement
  private btn!: HTMLButtonElement

  constructor(private state: AirTrajectoryState) {}

  onAdd(map: Map): HTMLElement {
    this.state.setMap(map)

    this.container = document.createElement('div')
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group'

    this.btn = document.createElement('button')
    this.btn.type = 'button'
    this.btn.className = 'oim-wind-toggle'
    this.btn.title = 'Air Trajectory'
    this.btn.setAttribute('aria-label', 'Air Trajectory')
    this.btn.setAttribute('aria-pressed', 'false')
    this.btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12 C7 6 12 3 17 8 C22 13 18 20 12 20 C8 20 5 17 5 12Z"/>
      <circle cx="5" cy="12" r="2" fill="currentColor" stroke="none"/>
    </svg>`
    this.btn.addEventListener('click', () => this.state.toggle())

    this.state.onActiveChange((active) => {
      this.btn.classList.toggle('active', active)
      this.btn.setAttribute('aria-pressed', String(active))
    })

    this.container.appendChild(this.btn)
    return this.container
  }

  onRemove(): void {
    this.state.disable()
    this.container.remove()
  }
}

// ---------------------------------------------------------------------------
// Settings panel — separate IControl, hidden until mode is active
// ---------------------------------------------------------------------------

export class AirTrajectoryPanel implements IControl {
  private container!: HTMLDivElement
  private elStatus!: HTMLDivElement
  private durButtons: Partial<Record<DurationHours, HTMLButtonElement>> = {}
  private _map: Map | null = null

  constructor(private state: AirTrajectoryState) {}

  onAdd(map: Map): HTMLElement {
    this._map = map
    this.container = document.createElement('div')
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group oim-trajectory-panel'
    this.container.hidden = true

    this._build()

    this.state.onActiveChange((active) => { this.container.hidden = !active })
    this.state.onStatus((msg, cls) => {
      this.elStatus.textContent = msg
      this.elStatus.className = 'oim-trajectory-panel__status' + (cls ? ` ${cls}` : '')
    })

    return this.container
  }

  onRemove(): void { this.container.remove() }

  private _build(): void {
    const durLabel = document.createElement('div')
    durLabel.className = 'oim-trajectory-panel__label'
    durLabel.textContent = 'Duration'

    const durRow = document.createElement('div')
    durRow.className = 'oim-trajectory-panel__durations'

    for (const h of DURATIONS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = `${h}h`
      btn.className =
        'oim-trajectory-panel__dur-btn' + (h === this.state.duration ? ' active' : '')
      btn.addEventListener('click', () => {
        this.state.setDuration(h)
        for (const [k, b] of Object.entries(this.durButtons) as [string, HTMLButtonElement][]) {
          b.classList.toggle('active', Number(k) === h)
        }
      })
      durRow.appendChild(btn)
      this.durButtons[h] = btn
    }

    const optionsDiv = document.createElement('div')
    optionsDiv.className = 'oim-trajectory-panel__options'
    optionsDiv.appendChild(this._checkbox('Centerline', true, (v) => {
      this.state.showCenterline = v
      const m = this._map
      if (m && this.state.active) setLayerVisibility(m, 'centerline', v)
    }))
    optionsDiv.appendChild(this._checkbox('Endpoint', true, (v) => {
      this.state.showEndpoint = v
      const m = this._map
      if (m && this.state.active) setLayerVisibility(m, 'endpoint', v)
    }))

    this.elStatus = document.createElement('div')
    this.elStatus.className = 'oim-trajectory-panel__status'

    this.container.append(durLabel, durRow, optionsDiv, this.elStatus)
  }

  private _checkbox(
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void
  ): HTMLLabelElement {
    const el = document.createElement('label')
    el.className = 'oim-trajectory-panel__option'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = checked
    input.addEventListener('change', () => onChange(input.checked))
    el.append(input, document.createTextNode(label))
    return el
  }
}

// ---------------------------------------------------------------------------
// Factory — returns [toggleButton, settingsPanel] sharing the same state
// ---------------------------------------------------------------------------

export function createAirTrajectoryControls(): [AirTrajectoryToggle, AirTrajectoryPanel] {
  const state = new AirTrajectoryState()
  return [new AirTrajectoryToggle(state), new AirTrajectoryPanel(state)]
}
