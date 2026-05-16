import maplibregl, { LngLatBounds } from 'maplibre-gl'
import './cache_warmer.css'

function lon2tile(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z))
}

function lat2tile(lat: number, z: number): number {
  return Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, z)
  )
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

function countTiles(bounds: LngLatBounds, minZ: number, maxZ: number): number {
  let n = 0
  for (let z = minZ; z <= maxZ; z++) {
    const x0 = lon2tile(bounds.getWest(), z)
    const x1 = lon2tile(bounds.getEast(), z)
    const y0 = lat2tile(bounds.getNorth(), z)
    const y1 = lat2tile(bounds.getSouth(), z)
    n += (x1 - x0 + 1) * (y1 - y0 + 1)
  }
  return n
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
        /* ignore network errors */
      }
      done++
      onProgress(done, total)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
}

export class CacheWarmer implements maplibregl.IControl {
  private _map: maplibregl.Map | null = null
  private _btn: HTMLElement | null = null
  private _panel: HTMLElement | null = null
  private _abort = false
  private _running = false

  onAdd(map: maplibregl.Map): HTMLElement {
    this._map = map
    const container = document.createElement('div')
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group oim-cache-warmer'

    this._btn = document.createElement('button')
    this._btn.className = 'oim-cache-warmer-trigger'
    this._btn.title = 'Прогрів кешу'
    this._btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="8 17 12 21 16 17"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>
    </svg>`
    this._btn.onclick = () => this._toggle()
    container.appendChild(this._btn)

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
      this._renderPanel()
      this._panel.classList.remove('hidden')
    } else {
      this._panel.classList.add('hidden')
    }
  }

  private _renderPanel() {
    const map = this._map!
    const panel = this._panel!
    const currentZoom = Math.floor(map.getZoom())
    const minZ = Math.max(1, currentZoom - 1)
    const maxZ = Math.min(17, currentZoom + 2)

    panel.innerHTML = ''

    const title = document.createElement('div')
    title.className = 'oim-cw-title'
    title.textContent = 'Прогрів кешу'
    panel.appendChild(title)

    const rangeRow = document.createElement('div')
    rangeRow.className = 'oim-cw-row'

    const label = document.createElement('label')
    label.textContent = `Зуми: ${minZ} — `
    rangeRow.appendChild(label)

    const maxZInput = document.createElement('input')
    maxZInput.type = 'number'
    maxZInput.min = String(minZ)
    maxZInput.max = '17'
    maxZInput.value = String(maxZ)
    maxZInput.className = 'oim-cw-input'
    rangeRow.appendChild(maxZInput)
    panel.appendChild(rangeRow)

    const infoDiv = document.createElement('div')
    infoDiv.className = 'oim-cw-info'
    panel.appendChild(infoDiv)

    const updateInfo = () => {
      const bounds = map.getBounds()
      const count = countTiles(bounds, minZ, parseInt(maxZInput.value))
      infoDiv.textContent = `~${count.toLocaleString()} тайлів`
      infoDiv.style.color = count > 5000 ? '#d32f2f' : '#555'
    }
    maxZInput.addEventListener('input', updateInfo)
    updateInfo()

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
    startBtn.textContent = 'Розпочати'
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
      maxZInput.disabled = true
      progressWrap.classList.remove('hidden')

      const bounds = map.getBounds()
      const zMax = Math.min(17, parseInt(maxZInput.value))
      const tiles = Array.from(tilesInBounds(bounds, minZ, zMax))

      await warmTiles(
        tiles,
        6,
        (done, total) => {
          const pct = Math.round((done / total) * 100)
          progressFill.style.width = `${pct}%`
          progressText.textContent = `${done} / ${total} (${pct}%)`
        },
        () => this._abort
      )

      this._running = false
      if (this._abort) {
        startBtn.textContent = 'Перервано — повторити'
      } else {
        startBtn.textContent = '✓ Готово'
        progressFill.style.backgroundColor = '#2e7d32'
      }
      startBtn.disabled = false
      maxZInput.disabled = false
    }
  }
}
