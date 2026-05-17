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

export class AirTrajectoryController implements IControl {
  private map?: Map
  private container!: HTMLDivElement

  private active = false
  private duration: DurationHours = 24
  private showCenterline = true
  private showEndpoint = true

  private abortCtrl: AbortController | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  private elToggle!: HTMLButtonElement
  private elStatus!: HTMLDivElement
  private durButtons: Partial<Record<DurationHours, HTMLButtonElement>> = {}

  onAdd(map: Map): HTMLElement {
    this.map = map

    this.container = document.createElement('div')
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group oim-trajectory-ctrl'

    this.buildUI()
    return this.container
  }

  onRemove(): void {
    if (this.map) {
      this.disable()
    }
    this.container.remove()
    this.map = undefined
  }

  private buildUI(): void {
    this.elToggle = document.createElement('button')
    this.elToggle.type = 'button'
    this.elToggle.className = 'oim-trajectory-ctrl__toggle'
    this.elToggle.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12 C7 6 12 3 17 8 C22 13 18 20 12 20 C8 20 5 17 5 12Z"/>
        <circle cx="5" cy="12" r="2" fill="currentColor" stroke="none"/>
      </svg>
      Air Trajectory`
    this.elToggle.addEventListener('click', () => this.toggleActive())

    const panel = document.createElement('div')
    panel.className = 'oim-trajectory-ctrl__panel'

    const durLabel = document.createElement('div')
    durLabel.className = 'oim-trajectory-ctrl__label'
    durLabel.textContent = 'Duration'

    const durRow = document.createElement('div')
    durRow.className = 'oim-trajectory-ctrl__durations'

    for (const h of DURATIONS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = `${h}h`
      btn.className = 'oim-trajectory-ctrl__dur-btn' + (h === this.duration ? ' active' : '')
      btn.addEventListener('click', () => this.setDuration(h))
      durRow.appendChild(btn)
      this.durButtons[h] = btn
    }

    const optionsDiv = document.createElement('div')
    optionsDiv.className = 'oim-trajectory-ctrl__options'

    optionsDiv.appendChild(
      this.buildCheckbox('Show centerline', this.showCenterline, (v) => {
        this.showCenterline = v
        if (this.map) setLayerVisibility(this.map, 'centerline', v)
      })
    )
    optionsDiv.appendChild(
      this.buildCheckbox('Show endpoint', this.showEndpoint, (v) => {
        this.showEndpoint = v
        if (this.map) setLayerVisibility(this.map, 'endpoint', v)
      })
    )

    this.elStatus = document.createElement('div')
    this.elStatus.className = 'oim-trajectory-ctrl__status'

    panel.append(durLabel, durRow, optionsDiv, this.elStatus)
    this.container.append(this.elToggle, panel)
  }

  private buildCheckbox(
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void
  ): HTMLLabelElement {
    const el = document.createElement('label')
    el.className = 'oim-trajectory-ctrl__option'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = checked
    input.addEventListener('change', () => onChange(input.checked))
    el.append(input, document.createTextNode(label))
    return el
  }

  private toggleActive(): void {
    this.active ? this.disable() : this.enable()
  }

  private enable(): void {
    if (!this.map) return
    this.active = true
    this.elToggle.classList.add('active')
    addTrajectoryLayers(this.map)
    this.map.on('mousemove', this.onMouseMove)
    this.setStatus('Move cursor over the map')
  }

  private disable(): void {
    if (!this.map) return
    this.active = false
    this.elToggle.classList.remove('active')
    this.map.off('mousemove', this.onMouseMove)
    this.abortCtrl?.abort()
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    removeTrajectoryLayers(this.map)
    this.setStatus('')
  }

  private setDuration(h: DurationHours): void {
    this.duration = h
    for (const [k, btn] of Object.entries(this.durButtons) as [string, HTMLButtonElement][]) {
      btn.classList.toggle('active', Number(k) === h)
    }
    if (this.active && this.map) {
      clearTrajectoryData(this.map)
      this.setStatus('Move cursor over the map')
    }
  }

  private onMouseMove = (event: MapMouseEvent): void => {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      void this.update(event.lngLat.lat, event.lngLat.lng)
    }, DEBOUNCE_MS)
  }

  private async update(lat: number, lon: number): Promise<void> {
    this.abortCtrl?.abort()
    this.abortCtrl = new AbortController()

    this.setStatus('Computing…', 'loading')

    try {
      const data = await fetchAirTrajectory(lat, lon, this.duration, this.abortCtrl.signal)
      this.applyVisibilityFilters(data)
      if (this.map) updateTrajectoryData(this.map, data)
      this.setStatus(`+${this.duration}h trajectory`)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : String(err)
      this.setStatus(msg, 'error')
    }
  }

  private applyVisibilityFilters(data: TrajectoryFeatureCollection): void {
    if (!this.showCenterline || !this.showEndpoint) {
      data.features = data.features.filter((f) => {
        if (f.properties.kind === 'trajectory_centerline' && !this.showCenterline) return false
        if (f.properties.kind === 'trajectory_endpoint' && !this.showEndpoint) return false
        return true
      })
    }
  }

  private setStatus(msg: string, cls?: 'loading' | 'error'): void {
    this.elStatus.textContent = msg
    this.elStatus.className =
      'oim-trajectory-ctrl__status' + (cls ? ` ${cls}` : '')
  }
}
