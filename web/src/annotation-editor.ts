import maplibregl, { IControl, LngLat } from 'maplibre-gl'
import { el, mount } from 'redom'
import './annotation-editor.css'

type DrawMode = 'none' | 'geofence' | 'label'

const DRAW_SOURCE = 'annotation-draw'
const ANN_SOURCE = 'annotations'

interface AnnotationRecord {
  id?: number
  name: string
  geofence?: GeoJSON.Polygon
  label_point?: GeoJSON.Point
}

export class AnnotationEditor implements IControl {
  _map?: maplibregl.Map
  _container!: HTMLElement
  _btn!: HTMLButtonElement
  _panel!: HTMLElement
  _statusEl!: HTMLElement
  _nameInput!: HTMLInputElement
  _editingId: number | null = null

  _mode: DrawMode = 'none'
  _vertices: LngLat[] = []
  _labelPoint: LngLat | null = null

  onAdd(map: maplibregl.Map): HTMLElement {
    this._map = map

    this._btn = el('button', { class: 'ann-toggle-btn', title: 'Редактор шарів' }, '✏') as HTMLButtonElement
    this._btn.onclick = () => this._togglePanel()

    this._container = el(
      'div',
      { class: 'maplibregl-ctrl maplibregl-ctrl-group ann-ctrl' },
      this._btn
    ) as HTMLElement

    this._panel = el('div', { class: 'ann-panel' }) as HTMLElement
    mount(document.body, this._panel)

    map.on('load', () => {
      this._initLayers()
      this._reloadAnnotations()
    })

    return this._container
  }

  onRemove(): void {
    this._setMode('none')
    this._panel.remove()
    this._map = undefined
  }

  _togglePanel(): void {
    if (this._panel.classList.contains('visible')) {
      this._closePanel()
    } else {
      this._openPanel()
    }
  }

  _openPanel(): void {
    this._buildPanel()
    this._panel.classList.add('visible')
    this._btn.classList.add('active')
  }

  _closePanel(): void {
    this._setMode('none')
    this._panel.classList.remove('visible')
    this._btn.classList.remove('active')
    this._clearDrawPreview()
  }

  _buildPanel(): void {
    while (this._panel.firstChild) this._panel.removeChild(this._panel.firstChild)

    this._nameInput = el('input', {
      type: 'text',
      class: 'ann-name-input',
      placeholder: "Назва об'єкта або зони",
    }) as HTMLInputElement

    this._statusEl = el('div', { class: 'ann-status' }, 'Оберіть дію') as HTMLElement

    const fenceBtn = el('button', {
      class: 'ann-btn',
      onclick: () => this._startGeofence(),
    }, '⬡ Намалювати геозону')

    const labelBtn = el('button', {
      class: 'ann-btn',
      onclick: () => this._setMode('label'),
    }, '📍 Поставити геомітку')

    const clearBtn = el('button', {
      class: 'ann-btn',
      onclick: () => { this._resetDraw(); this._setStatus('Очищено.') },
    }, '✕ Очистити')

    const saveBtn = el('button', {
      class: 'ann-btn ann-btn-save',
      onclick: () => this._save(),
    }, '💾 Зберегти')

    const listTitle = el('div', { class: 'ann-section-title' }, 'Збережені анотації:')
    const listEl = el('ul', { class: 'ann-list', id: 'ann-list' }) as HTMLElement

    mount(this._panel, el('div', { class: 'ann-header' },
      el('span', 'Редактор шарів'),
      el('button', { class: 'ann-close', onclick: () => this._closePanel() }, '×')
    ))
    mount(this._panel, el('div', { class: 'ann-body' },
      el('label', { class: 'ann-label' }, 'Назва:'),
      this._nameInput,
      el('div', { class: 'ann-row' }, fenceBtn, labelBtn, clearBtn),
      this._statusEl,
      el('div', { class: 'ann-row ann-footer' }, saveBtn),
      listTitle,
      listEl
    ))

    this._refreshList(listEl)
  }

  async _refreshList(listEl: HTMLElement): Promise<void> {
    try {
      const resp = await fetch('/api/annotations')
      if (!resp.ok) return
      const geojson = await resp.json() as GeoJSON.FeatureCollection
      const seen = new Set<number>()
      const items: HTMLElement[] = []
      for (const f of geojson.features) {
        const id = f.properties?.id as number
        if (seen.has(id)) continue
        seen.add(id)
        const name = (f.properties?.name as string) || `#${id}`
        items.push(el('li', { class: 'ann-list-item' },
          el('span', name),
          el('button', { class: 'ann-list-load', onclick: () => this._loadRecord(id) }, '✎'),
          el('button', { class: 'ann-list-del', onclick: () => this._deleteById(id) }, '✕')
        ) as HTMLElement)
      }
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild)
      if (items.length === 0) {
        mount(listEl, el('li', { class: 'ann-list-empty' }, 'Немає анотацій'))
      } else {
        items.forEach(i => mount(listEl, i))
      }
    } catch (err) {
      console.warn('list annotations failed', err)
    }
  }

  _startGeofence(): void {
    this._vertices = []
    this._syncDrawSource()
    this._setMode('geofence')
  }

  _setMode(mode: DrawMode): void {
    if (!this._map) return
    const prev = this._mode
    this._mode = mode

    this._map.off('click', this._onClick)
    this._map.off('dblclick', this._onDblClick)

    if (prev !== 'none') {
      this._map.getCanvas().style.cursor = ''
    }

    if (mode === 'geofence') {
      this._map.getCanvas().style.cursor = 'crosshair'
      this._map.on('click', this._onClick)
      this._map.on('dblclick', this._onDblClick)
      this._setStatus('Клікайте для точок. Двічі — завершити полігон.')
    } else if (mode === 'label') {
      this._map.getCanvas().style.cursor = 'crosshair'
      this._map.on('click', this._onClick)
      this._setStatus('Клікніть для встановлення геомітки.')
    } else {
      this._setStatus('Оберіть дію.')
    }
  }

  _onClick = (e: maplibregl.MapMouseEvent): void => {
    if (this._mode === 'geofence') {
      this._vertices.push(e.lngLat)
      this._syncDrawSource()
    } else if (this._mode === 'label') {
      this._labelPoint = e.lngLat
      this._syncDrawSource()
      this._setMode('none')
      this._setStatus(`Геомітка: ${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`)
    }
  }

  _onDblClick = (e: maplibregl.MapMouseEvent): void => {
    e.preventDefault()
    if (this._mode === 'geofence' && this._vertices.length >= 3) {
      this._setMode('none')
      this._setStatus(`Геозона з ${this._vertices.length} точок готова.`)
    }
  }

  _setStatus(msg: string): void {
    if (this._statusEl) this._statusEl.textContent = msg
  }

  _resetDraw(): void {
    this._vertices = []
    this._labelPoint = null
    this._editingId = null
    if (this._nameInput) this._nameInput.value = ''
    this._setMode('none')
    this._syncDrawSource()
  }

  _syncDrawSource(): void {
    if (!this._map) return
    const features: GeoJSON.Feature[] = []
    const coords = this._vertices.map(v => [v.lng, v.lat])

    if (this._mode === 'geofence' && coords.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: { ftype: 'preview' },
      })
    } else if (coords.length >= 3) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
        properties: { ftype: 'geofence' },
      })
    }

    for (const v of this._vertices) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
        properties: { ftype: 'vertex' },
      })
    }

    if (this._labelPoint) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [this._labelPoint.lng, this._labelPoint.lat] },
        properties: { ftype: 'label' },
      })
    }

    const src = this._map.getSource(DRAW_SOURCE) as maplibregl.GeoJSONSource | undefined
    src?.setData({ type: 'FeatureCollection', features })
  }

  _clearDrawPreview(): void {
    const src = this._map?.getSource(DRAW_SOURCE) as maplibregl.GeoJSONSource | undefined
    src?.setData({ type: 'FeatureCollection', features: [] })
  }

  async _loadRecord(id: number): Promise<void> {
    try {
      const resp = await fetch(`/api/annotation/${id}`)
      if (!resp.ok) return
      const data = await resp.json() as AnnotationRecord
      if (!data) return
      this._editingId = id
      if (this._nameInput) this._nameInput.value = data.name || ''
      this._vertices = []
      this._labelPoint = null
      if (data.geofence?.coordinates?.[0]) {
        const ring = data.geofence.coordinates[0] as [number, number][]
        this._vertices = ring.slice(0, -1).map(([lng, lat]) => new LngLat(lng, lat))
      }
      if (data.label_point?.coordinates) {
        const [lng, lat] = data.label_point.coordinates as [number, number]
        this._labelPoint = new LngLat(lng, lat)
      }
      this._setMode('none')
      this._syncDrawSource()
      this._setStatus(`Завантажено: ${data.name || `#${id}`}`)
    } catch (err) {
      console.warn('load record failed', err)
    }
  }

  async _save(): Promise<void> {
    const name = this._nameInput?.value?.trim() || ''
    if (!name) { this._setStatus('Введіть назву.'); return }

    const geofence: GeoJSON.Polygon | undefined =
      this._vertices.length >= 3
        ? {
            type: 'Polygon',
            coordinates: [[
              ...this._vertices.map(v => [v.lng, v.lat] as [number, number]),
              [this._vertices[0].lng, this._vertices[0].lat],
            ]],
          }
        : undefined

    const label_point: GeoJSON.Point | undefined = this._labelPoint
      ? { type: 'Point', coordinates: [this._labelPoint.lng, this._labelPoint.lat] }
      : undefined

    const payload = {
      ...(this._editingId ? { id: this._editingId } : {}),
      name,
      ...(geofence ? { geofence } : {}),
      ...(label_point ? { label_point } : {}),
    }

    try {
      const resp = await fetch('/api/annotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (resp.ok) {
        const result = await resp.json() as { id: number }
        this._editingId = result.id
        this._setStatus('✅ Збережено!')
        await this._reloadAnnotations()
        const listEl = document.getElementById('ann-list') as HTMLElement | null
        if (listEl) this._refreshList(listEl)
      } else {
        this._setStatus('❌ Помилка збереження.')
      }
    } catch (err) {
      this._setStatus(`❌ ${err}`)
    }
  }

  async _deleteById(id: number): Promise<void> {
    if (!confirm('Видалити цю анотацію?')) return
    try {
      const resp = await fetch(`/api/annotation/${id}`, { method: 'DELETE' })
      if (resp.ok) {
        if (this._editingId === id) this._resetDraw()
        await this._reloadAnnotations()
        const listEl = document.getElementById('ann-list') as HTMLElement | null
        if (listEl) this._refreshList(listEl)
      }
    } catch (err) {
      this._setStatus(`❌ ${err}`)
    }
  }

  async _reloadAnnotations(): Promise<void> {
    if (!this._map) return
    try {
      const resp = await fetch('/api/annotations')
      if (!resp.ok) return
      const geojson = await resp.json()
      const src = this._map.getSource(ANN_SOURCE) as maplibregl.GeoJSONSource | undefined
      src?.setData(geojson)
    } catch (err) {
      console.warn('reload annotations failed', err)
    }
  }

  _initLayers(): void {
    if (!this._map) return

    this._map.addSource(DRAW_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    this._map.addSource(ANN_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })

    this._map.addLayer({
      id: 'ann-fence-fill',
      type: 'fill',
      source: ANN_SOURCE,
      filter: ['==', ['get', 'feature_type'], 'geofence'],
      paint: { 'fill-color': '#0057b8', 'fill-opacity': 0.12 },
    })
    this._map.addLayer({
      id: 'ann-fence-line',
      type: 'line',
      source: ANN_SOURCE,
      filter: ['==', ['get', 'feature_type'], 'geofence'],
      paint: { 'line-color': '#0057b8', 'line-width': 2 },
    })
    this._map.addLayer({
      id: 'ann-labels',
      type: 'symbol',
      source: ANN_SOURCE,
      filter: ['==', ['get', 'feature_type'], 'label'],
      layout: {
        'text-field': ['get', 'name'],
        'text-anchor': 'top',
        'text-offset': [0, 0.6],
        'text-size': 13,
        'text-font': ['Noto Sans Regular'],
      },
      paint: {
        'text-color': '#003399',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
      },
    })
    this._map.addLayer({
      id: 'ann-label-dot',
      type: 'circle',
      source: ANN_SOURCE,
      filter: ['==', ['get', 'feature_type'], 'label'],
      paint: { 'circle-color': '#0057b8', 'circle-radius': 6,
               'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
    })
    this._map.addLayer({
      id: 'draw-fence-fill',
      type: 'fill',
      source: DRAW_SOURCE,
      filter: ['==', ['get', 'ftype'], 'geofence'],
      paint: { 'fill-color': '#ff6600', 'fill-opacity': 0.18 },
    })
    this._map.addLayer({
      id: 'draw-fence-line',
      type: 'line',
      source: DRAW_SOURCE,
      filter: ['in', ['get', 'ftype'], ['literal', ['geofence', 'preview']]],
      paint: { 'line-color': '#ff6600', 'line-width': 2, 'line-dasharray': [4, 2] },
    })
    this._map.addLayer({
      id: 'draw-vertices',
      type: 'circle',
      source: DRAW_SOURCE,
      filter: ['==', ['get', 'ftype'], 'vertex'],
      paint: { 'circle-color': '#ff6600', 'circle-radius': 5,
               'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
    })
    this._map.addLayer({
      id: 'draw-label-dot',
      type: 'circle',
      source: DRAW_SOURCE,
      filter: ['==', ['get', 'ftype'], 'label'],
      paint: { 'circle-color': '#0057b8', 'circle-radius': 8,
               'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
    })
  }
}
