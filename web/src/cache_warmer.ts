import maplibregl, { LngLatBounds } from 'maplibre-gl'
import './cache_warmer.css'

const TILE_SIZE_KB = 20

interface Country {
  name: string
  bbox: [number, number, number, number] // [west, south, east, north]
}

const COUNTRIES: Country[] = [
  { name: 'Україна',      bbox: [22.137, 44.386, 40.228, 52.380] },
  { name: 'Білорусь',     bbox: [23.178, 51.319, 32.776, 56.172] },
  { name: 'Молдова',      bbox: [26.618, 45.466, 30.136, 48.492] },
  { name: 'Польща',       bbox: [14.122, 49.000, 24.146, 54.836] },
  { name: 'Словаччина',   bbox: [16.833, 47.758, 22.558, 49.613] },
  { name: 'Угорщина',     bbox: [16.113, 45.737, 22.897, 48.585] },
  { name: 'Румунія',      bbox: [20.261, 43.619, 29.757, 48.265] },
  { name: 'Литва',        bbox: [20.957, 53.897, 26.835, 56.450] },
  { name: 'Латвія',       bbox: [20.972, 55.676, 28.241, 57.970] },
  { name: 'Естонія',      bbox: [21.767, 57.509, 28.210, 59.693] },
  { name: 'Фінляндія',    bbox: [19.120, 59.694, 31.587, 70.092] },
  { name: 'Швеція',       bbox: [10.964, 55.338, 24.166, 69.060] },
  { name: 'Норвегія',     bbox: [4.992,  57.979, 31.293, 71.185] },
  { name: 'Туреччина',    bbox: [25.664, 35.819, 44.793, 42.141] },
  { name: 'Росія (Захід)',bbox: [28.000, 48.000, 60.000, 60.000] },
  { name: 'Німеччина',    bbox: [5.867,  47.270, 15.043, 55.058] },
  { name: 'Австрія',      bbox: [9.530,  46.372, 17.161, 49.021] },
  { name: 'Чехія',        bbox: [12.091, 48.551, 18.860, 51.056] },
]

function lon2tile(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z))
}

function lat2tile(lat: number, z: number): number {
  return Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, z)
  )
}

function tilesAtZoom(bounds: LngLatBounds, z: number): number {
  const x0 = lon2tile(bounds.getWest(), z)
  const x1 = lon2tile(bounds.getEast(), z)
  const y0 = lat2tile(bounds.getNorth(), z)
  const y1 = lat2tile(bounds.getSouth(), z)
  return (x1 - x0 + 1) * (y1 - y0 + 1)
}

function* tilesInBounds(bounds: LngLatBounds, minZ: number, maxZ: number): Generator<[number, number, number]> {
  for (let z = minZ; z <= maxZ; z++) {
    const x0 = lon2tile(bounds.getWest(), z)
    const x1 = lon2tile(bounds.getEast(), z)
    const y0 = lat2tile(bounds.getNorth(), z)
    const y1 = lat2tile(bounds.getSouth(), z)
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        yield [z, x, y]
      }
    }
  }
}

function formatSize(kb: number): string {
  if (kb < 1024) return `~${kb} KB`
  if (kb < 1024 * 1024) return `~${(kb / 1024).toFixed(1)} MB`
  return `~${(kb / 1024 / 1024).toFixed(2)} GB`
}

async function probeMaxZoom(center: [number, number], startZ: number): Promise<number> {
  let maxZ = startZ
  for (let z = startZ + 1; z <= 23; z++) {
    const x = lon2tile(center[0], z)
    const y = lat2tile(center[1], z)
    try {
      const res = await fetch(`/satellite/${z}/${x}/${y}.jpg`, { method: 'HEAD', cache: 'no-store' })
      if (res.ok) {
        maxZ = z
      } else {
        break
      }
    } catch {
      break
    }
  }
  return maxZ
}

async function warmTiles(
  tiles: [number, number, number][],
  concurrency: number,
  onProgress: (done: number, total: number) => void,
  shouldAbort: () => boolean
): Promise<void> {
  let done = 0
  const total = tiles.length
  const iter = tiles[Symbol.iterator]()

  async function worker() {
    for (const [z, x, y] of iter) {
      if (shouldAbort()) return
      try {
        await fetch(`/satellite/${z}/${x}/${y}.jpg`, { method: 'GET', cache: 'no-store' })
      } catch {
        /* ignore */
      }
      done++
      onProgress(done, total)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
}

type SourceMode = 'viewport' | 'draw' | 'country'

export class CacheWarmer implements maplibregl.IControl {
  private _map: maplibregl.Map | null = null
  private _panel: HTMLElement | null = null
  private _abort = false
  private _running = false
  private _mode: SourceMode = 'viewport'

  onAdd(map: maplibregl.Map): HTMLElement {
    this._map = map
    const container = document.createElement('div')
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group oim-cache-warmer'

    const btn = document.createElement('button')
    btn.className = 'oim-cache-warmer-trigger'
    btn.title = 'Прогрів кешу'
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="8 17 12 21 16 17"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>
    </svg>`
    btn.onclick = () => this._toggle()
    container.appendChild(btn)

    this._panel = document.createElement('div')
    this._panel.className = 'oim-cache-warmer-panel hidden'
    container.appendChild(this._panel)

    return container
  }

  onRemove(): void { this._map = null }

  private _toggle() {
    if (!this._panel) return
    if (this._panel.classList.contains('hidden')) {
      this._panel.classList.remove('hidden')
      if (!this._running) this._renderSourcePicker()
    } else {
      this._panel.classList.add('hidden')
    }
  }

  private _renderSourcePicker() {
    const panel = this._panel!
    panel.innerHTML = ''

    const title = document.createElement('div')
    title.className = 'oim-cw-title'
    title.textContent = 'Прогрів кешу'
    panel.appendChild(title)

    const tabs = document.createElement('div')
    tabs.className = 'oim-cw-tabs'

    const tabDefs: { id: SourceMode; label: string }[] = [
      { id: 'viewport', label: 'Екран' },
      { id: 'draw',     label: 'Намалювати' },
      { id: 'country',  label: 'Країна' },
    ]

    const tabEls: Record<string, HTMLButtonElement> = {}
    tabDefs.forEach(({ id, label }) => {
      const t = document.createElement('button')
      t.className = 'oim-cw-tab' + (id === this._mode ? ' active' : '')
      t.textContent = label
      t.onclick = () => {
        this._mode = id
        Object.values(tabEls).forEach(el => el.classList.remove('active'))
        t.classList.add('active')
        renderModeContent()
      }
      tabEls[id] = t
      tabs.appendChild(t)
    })
    panel.appendChild(tabs)

    const modeArea = document.createElement('div')
    panel.appendChild(modeArea)

    const tableArea = document.createElement('div')
    panel.appendChild(tableArea)

    const renderModeContent = () => {
      modeArea.innerHTML = ''
      tableArea.innerHTML = ''

      if (this._mode === 'viewport') {
        this._loadZoneTable(this._map!.getBounds(), tableArea)
      } else if (this._mode === 'draw') {
        const hint = document.createElement('div')
        hint.className = 'oim-cw-hint'
        hint.textContent = 'Натисніть кнопку, потягніть прямокутник на карті'
        modeArea.appendChild(hint)

        const drawBtn = document.createElement('button')
        drawBtn.className = 'oim-cw-btn oim-cw-btn-outline'
        drawBtn.textContent = '✏ Намалювати зону'
        drawBtn.onclick = async () => {
          this._panel!.classList.add('hidden')
          const bounds = await this._drawBbox()
          this._panel!.classList.remove('hidden')
          if (bounds) {
            tableArea.innerHTML = ''
            this._loadZoneTable(bounds, tableArea)
          }
        }
        modeArea.appendChild(drawBtn)
      } else if (this._mode === 'country') {
        const search = document.createElement('input')
        search.type = 'text'
        search.placeholder = 'Пошук країни...'
        search.className = 'oim-cw-search'
        modeArea.appendChild(search)

        const select = document.createElement('select')
        select.className = 'oim-cw-select'
        select.size = 5

        const buildList = (filter: string) => {
          select.innerHTML = ''
          COUNTRIES.filter(c => c.name.toLowerCase().includes(filter.toLowerCase())).forEach(c => {
            const opt = document.createElement('option')
            opt.value = JSON.stringify(c.bbox)
            opt.textContent = c.name
            select.appendChild(opt)
          })
        }
        buildList('')

        search.addEventListener('input', () => buildList(search.value))
        select.addEventListener('change', () => {
          const bbox = JSON.parse(select.value) as [number, number, number, number]
          const bounds = new maplibregl.LngLatBounds([bbox[0], bbox[1], bbox[2], bbox[3]])
          tableArea.innerHTML = ''
          this._loadZoneTable(bounds, tableArea)
        })

        modeArea.appendChild(select)
      }
    }

    renderModeContent()
  }

  private _loadZoneTable(bounds: LngLatBounds, container: HTMLElement) {
    const map = this._map!
    const currentZ = Math.floor(map.getZoom())
    const minZ = Math.max(1, currentZ - 1)
    const center = bounds.getCenter()

    const status = document.createElement('div')
    status.className = 'oim-cw-status'
    status.textContent = 'Визначення максимального зуму...'
    container.appendChild(status)

    probeMaxZoom([center.lng, center.lat], currentZ).then(detectedMaxZ => {
      status.remove()

      let selectedMaxZ = Math.min(currentZ + 2, detectedMaxZ)

      const tableWrap = document.createElement('div')
      tableWrap.className = 'oim-cw-table-wrap'
      const table = document.createElement('table')
      table.className = 'oim-cw-table'
      table.innerHTML = `<thead><tr><th>Зум</th><th>Тайлів</th><th>Всього</th><th>Розмір</th></tr></thead>`
      const tbody = document.createElement('tbody')
      table.appendChild(tbody)
      tableWrap.appendChild(table)
      container.appendChild(tableWrap)

      let cumulative = 0
      const rows: { z: number; row: HTMLTableRowElement }[] = []

      for (let z = minZ; z <= detectedMaxZ; z++) {
        const atZ = tilesAtZoom(bounds, z)
        cumulative += atZ
        const tr = document.createElement('tr')
        tr.className = 'oim-cw-row-sel' + (z <= selectedMaxZ ? ' selected' : '')
        tr.innerHTML = `<td>${z}</td><td>${atZ.toLocaleString()}</td><td>${cumulative.toLocaleString()}</td><td>${formatSize(cumulative * TILE_SIZE_KB)}</td>`
        tr.onclick = () => {
          selectedMaxZ = z
          rows.forEach(r => r.row.classList.toggle('selected', r.z <= z))
        }
        tbody.appendChild(tr)
        rows.push({ z, row: tr })
      }

      const note = document.createElement('div')
      note.className = 'oim-cw-note'
      note.textContent = `Макс. зум регіону: ${detectedMaxZ} · ≈${TILE_SIZE_KB} KB/тайл`
      container.appendChild(note)

      const progressWrap = document.createElement('div')
      progressWrap.className = 'oim-cw-progress-wrap hidden'
      const progressBar = document.createElement('div')
      progressBar.className = 'oim-cw-progress-bar'
      const progressFill = document.createElement('div')
      progressFill.className = 'oim-cw-progress-fill'
      progressBar.appendChild(progressFill)
      const progressText = document.createElement('div')
      progressText.className = 'oim-cw-progress-text'
      progressWrap.appendChild(progressBar)
      progressWrap.appendChild(progressText)
      container.appendChild(progressWrap)

      const startBtn = document.createElement('button')
      startBtn.className = 'oim-cw-btn'
      startBtn.textContent = 'Завантажити виділені'
      container.appendChild(startBtn)

      startBtn.onclick = async () => {
        if (this._running) {
          this._abort = true
          startBtn.textContent = 'Зупинка...'
          startBtn.disabled = true
          return
        }
        this._abort = false
        this._running = true
        startBtn.textContent = 'Зупинити'
        tableWrap.style.pointerEvents = 'none'
        tableWrap.style.opacity = '0.5'
        progressWrap.classList.remove('hidden')

        const tiles = Array.from(tilesInBounds(bounds, minZ, selectedMaxZ))
        await warmTiles(tiles, 6,
          (done, total) => {
            const pct = Math.round((done / total) * 100)
            progressFill.style.width = `${pct}%`
            progressText.textContent = `${done.toLocaleString()} / ${total.toLocaleString()} (${pct}%)`
          },
          () => this._abort
        )

        this._running = false
        tableWrap.style.pointerEvents = ''
        tableWrap.style.opacity = ''
        if (this._abort) {
          startBtn.textContent = 'Перервано — повторити'
          startBtn.disabled = false
        } else {
          startBtn.textContent = '✓ Готово'
          progressFill.style.backgroundColor = '#2e7d32'
        }
      }
    })
  }

  private _drawBbox(): Promise<LngLatBounds | null> {
    return new Promise(resolve => {
      const map = this._map!
      const mapContainer = map.getContainer()

      const overlay = document.createElement('div')
      overlay.style.cssText = 'position:absolute;inset:0;cursor:crosshair;z-index:999;background:rgba(0,0,0,0.05);'
      const hint = document.createElement('div')
      hint.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:#fff;padding:6px 12px;border-radius:4px;font-size:13px;white-space:nowrap;pointer-events:none;'
      hint.textContent = 'Затисніть та протягніть · Escape — відмінити'
      overlay.appendChild(hint)

      const rect = document.createElement('div')
      rect.style.cssText = 'position:absolute;border:2px solid #1565C0;background:rgba(21,101,192,0.12);pointer-events:none;display:none;'

      mapContainer.appendChild(overlay)
      mapContainer.appendChild(rect)

      let startX = 0, startY = 0, drawing = false

      const onDown = (e: MouseEvent) => {
        drawing = true
        const cr = mapContainer.getBoundingClientRect()
        startX = e.clientX - cr.left
        startY = e.clientY - cr.top
        rect.style.left = startX + 'px'
        rect.style.top = startY + 'px'
        rect.style.width = '0'
        rect.style.height = '0'
        rect.style.display = 'block'
      }

      const onMove = (e: MouseEvent) => {
        if (!drawing) return
        const cr = mapContainer.getBoundingClientRect()
        const x = e.clientX - cr.left
        const y = e.clientY - cr.top
        rect.style.left = Math.min(x, startX) + 'px'
        rect.style.top = Math.min(y, startY) + 'px'
        rect.style.width = Math.abs(x - startX) + 'px'
        rect.style.height = Math.abs(y - startY) + 'px'
      }

      const cleanup = () => {
        overlay.removeEventListener('mousedown', onDown)
        overlay.removeEventListener('mousemove', onMove)
        overlay.removeEventListener('mouseup', onUp)
        document.removeEventListener('keydown', onKey)
        overlay.remove()
        rect.remove()
      }

      const onUp = (e: MouseEvent) => {
        if (!drawing) return
        drawing = false
        const cr = mapContainer.getBoundingClientRect()
        const x = e.clientX - cr.left
        const y = e.clientY - cr.top
        cleanup()
        if (Math.abs(x - startX) < 10 || Math.abs(y - startY) < 10) {
          resolve(null)
          return
        }
        const p1 = map.unproject([Math.min(x, startX), Math.min(y, startY)])
        const p2 = map.unproject([Math.max(x, startX), Math.max(y, startY)])
        resolve(new maplibregl.LngLatBounds([p1.lng, p2.lat, p2.lng, p1.lat]))
      }

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { cleanup(); resolve(null) }
      }

      overlay.addEventListener('mousedown', onDown)
      overlay.addEventListener('mousemove', onMove)
      overlay.addEventListener('mouseup', onUp)
      document.addEventListener('keydown', onKey)
    })
  }
}
