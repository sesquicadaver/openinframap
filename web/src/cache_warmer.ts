import maplibregl, { LngLatBounds } from 'maplibre-gl'
import './cache_warmer.css'

const TILE_SIZE_KB = 20

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

export class CacheWarmer implements maplibregl.IControl {
  private _map: maplibregl.Map | null = null
  private _panel: HTMLElement | null = null
  private _abort = false
  private _running = false

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

  onRemove(): void {
    this._map = null
  }

  private _toggle() {
    if (!this._panel) return
    if (this._panel.classList.contains('hidden')) {
      this._panel.classList.remove('hidden')
      if (!this._running) this._renderIdle()
    } else {
      this._panel.classList.add('hidden')
    }
  }

  private _renderIdle() {
    const map = this._map!
    const panel = this._panel!
    panel.innerHTML = ''

    const title = document.createElement('div')
    title.className = 'oim-cw-title'
    title.textContent = 'Прогрів кешу'
    panel.appendChild(title)

    const status = document.createElement('div')
    status.className = 'oim-cw-status'
    status.textContent = 'Визначення максимального зуму...'
    panel.appendChild(status)

    const bounds = map.getBounds()
    const currentZ = Math.floor(map.getZoom())
    const minZ = Math.max(1, currentZ - 1)
    const center = map.getCenter()

    let selectedMaxZ = currentZ + 2

    probeMaxZoom([center.lng, center.lat], currentZ).then(detectedMaxZ => {
      status.remove()

      const table = document.createElement('table')
      table.className = 'oim-cw-table'
      table.innerHTML = `<thead><tr>
        <th>Зум</th>
        <th>Тайлів</th>
        <th>Всього</th>
        <th>Розмір</th>
      </tr></thead>`
      const tbody = document.createElement('tbody')
      table.appendChild(tbody)
      panel.appendChild(table)

      let cumulative = 0
      const rows: { z: number; row: HTMLTableRowElement }[] = []

      for (let z = minZ; z <= detectedMaxZ; z++) {
        const atZ = tilesAtZoom(bounds, z)
        cumulative += atZ
        const totalKb = cumulative * TILE_SIZE_KB

        const tr = document.createElement('tr')
        tr.className = 'oim-cw-row-sel'
        if (z <= currentZ + 2) tr.classList.add('selected')
        tr.innerHTML = `<td>${z}</td><td>${atZ.toLocaleString()}</td><td>${cumulative.toLocaleString()}</td><td>${formatSize(totalKb)}</td>`
        tr.onclick = () => {
          selectedMaxZ = z
          rows.forEach(r => r.row.classList.toggle('selected', r.z <= z))
        }
        tbody.appendChild(tr)
        rows.push({ z, row: tr })
      }

      selectedMaxZ = Math.min(currentZ + 2, detectedMaxZ)

      const note = document.createElement('div')
      note.className = 'oim-cw-note'
      note.textContent = `Макс. зум регіону: ${detectedMaxZ} · розмір ≈20 KB/тайл`
      panel.appendChild(note)

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
      panel.appendChild(progressWrap)

      const startBtn = document.createElement('button')
      startBtn.className = 'oim-cw-btn'
      startBtn.textContent = 'Завантажити виділені'
      panel.appendChild(startBtn)

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
        table.style.pointerEvents = 'none'
        progressWrap.classList.remove('hidden')

        const tiles = Array.from(tilesInBounds(bounds, minZ, selectedMaxZ))

        await warmTiles(
          tiles,
          6,
          (done, total) => {
            const pct = Math.round((done / total) * 100)
            progressFill.style.width = `${pct}%`
            progressText.textContent = `${done.toLocaleString()} / ${total.toLocaleString()} (${pct}%)`
          },
          () => this._abort
        )

        this._running = false
        table.style.pointerEvents = ''
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
}
