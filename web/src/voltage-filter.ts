import maplibregl, { IControl, FilterSpecification } from 'maplibre-gl'
import { el, mount } from 'redom'
import { voltage_scale } from './style/style_oim_power.ts'
import './voltage-filter.css'

const VOLTAGE_LAYER_FIELDS: [string, string][] = [
  ['power_line_1', 'voltage'],
  ['power_line_2', 'voltage_2'],
  ['power_line_3', 'voltage_3'],
  ['power_line_underground_1', 'voltage'],
  ['power_line_underground_2', 'voltage_2'],
  ['power_line_underground_3', 'voltage_3'],
  ['power_line_disused', 'voltage'],
]

function voltageClassFilter(classIdx: number, field: string): FilterSpecification {
  const min = voltage_scale[classIdx][0]
  const next = voltage_scale[classIdx + 1]
  const max = next ? (next[0] as number) : null
  const val: FilterSpecification = ['to-number', ['coalesce', ['get', field], 0]] as any
  if (min === null) {
    return ['<', val, 10] as any
  } else if (max === null) {
    return ['>=', val, min as number] as any
  } else {
    return ['all', ['>=', val, min as number], ['<', val, max]] as any
  }
}

function voltageClassLabel(classIdx: number): string {
  const min = voltage_scale[classIdx][0]
  const next = voltage_scale[classIdx + 1]
  if (min === null) return '< 10 kV'
  if (!next) return `≥ ${min} kV`
  return `${min} kV`
}

export class VoltageFilter implements IControl {
  _map?: maplibregl.Map
  _container!: HTMLElement
  _button!: HTMLButtonElement
  _panel!: HTMLElement
  _selected: Set<number>
  _originalFilters: Map<string, FilterSpecification>
  _checkboxes: HTMLInputElement[]

  constructor() {
    this._originalFilters = new Map()
    this._checkboxes = []
    this._selected = this._loadSelected()
  }

  _loadSelected(): Set<number> {
    try {
      const stored = localStorage.getItem('oim-voltage-filter')
      if (stored) {
        const arr = JSON.parse(stored) as number[]
        return new Set(arr)
      }
    } catch (_) {}
    return new Set(voltage_scale.map((_, i) => i))
  }

  _saveSelected() {
    try {
      localStorage.setItem('oim-voltage-filter', JSON.stringify([...this._selected]))
    } catch (_) {}
  }

  onAdd(map: maplibregl.Map): HTMLElement {
    this._map = map

    this._button = el('button', {
      class: 'maplibregl-ctrl-icon oim-voltage-filter-btn',
      title: 'Фільтр за напругою',
      ariaLabel: 'Фільтр за напругою'
    }) as HTMLButtonElement

    this._panel = el('div', { class: 'oim-voltage-filter-panel' }) as HTMLElement
    this._buildPanel()
    mount(document.body, this._panel)

    this._button.onclick = () => {
      const r = this._button.getBoundingClientRect()
      this._panel.style.top = r.bottom + 4 + 'px'
      this._panel.style.right = document.documentElement.clientWidth - r.right + 'px'
      this._panel.classList.toggle('visible')
    }

    document.addEventListener('click', (e) => {
      if (!this._container.contains(e.target as Node) && !this._panel.contains(e.target as Node)) {
        this._panel.classList.remove('visible')
      }
    })

    map.on('styledata', () => {
      if (this._originalFilters.size === 0) this._storeOriginalFilters()
    })

    this._container = el('div', { class: 'maplibregl-ctrl maplibregl-ctrl-group' }, this._button) as HTMLElement
    return this._container
  }

  onRemove() {
    this._panel.remove()
    this._map = undefined
  }

  _storeOriginalFilters() {
    if (!this._map) return
    for (const [id] of VOLTAGE_LAYER_FIELDS) {
      try {
        const f = this._map.getFilter(id)
        if (f !== undefined) this._originalFilters.set(id, f as FilterSpecification)
      } catch (_) {}
    }
  }

  _buildPanel() {
    this._checkboxes = []

    const header = el('div', { class: 'vf-header' }, 'Напруга ліній')
    const actions = el('div', { class: 'vf-actions' })

    const allBtn = el('button', { class: 'vf-action-btn' }, 'Всі') as HTMLButtonElement
    const noneBtn = el('button', { class: 'vf-action-btn' }, 'Жодного') as HTMLButtonElement
    allBtn.onclick = () => this._setAll(true)
    noneBtn.onclick = () => this._setAll(false)
    mount(actions, allBtn)
    mount(actions, noneBtn)

    mount(this._panel, header)
    mount(this._panel, actions)

    for (let i = 0; i < voltage_scale.length; i++) {
      const [, color] = voltage_scale[i]
      const label = voltageClassLabel(i)

      const checkbox = el('input', { type: 'checkbox', id: `vf-${i}` }) as HTMLInputElement
      checkbox.checked = this._selected.has(i)
      this._checkboxes.push(checkbox)

      checkbox.onchange = () => {
        if (checkbox.checked) this._selected.add(i)
        else this._selected.delete(i)
        this._saveSelected()
        this._updateFilters()
      }

      const swatch = el('span', { class: 'vf-swatch', style: `background:${color}` })
      const row = el('label', { class: 'vf-row', htmlFor: `vf-${i}` }, checkbox, swatch, el('span', label))
      mount(this._panel, row)
    }
  }

  _setAll(value: boolean) {
    for (let i = 0; i < voltage_scale.length; i++) {
      if (value) this._selected.add(i)
      else this._selected.delete(i)
      if (this._checkboxes[i]) this._checkboxes[i].checked = value
    }
    this._saveSelected()
    this._updateFilters()
  }

  _updateFilters() {
    if (!this._map) return
    if (this._originalFilters.size === 0) this._storeOriginalFilters()

    for (const [id, field] of VOLTAGE_LAYER_FIELDS) {
      const orig = this._originalFilters.get(id)
      if (orig === undefined) continue

      if (this._selected.size === 0) {
        this._map.setFilter(id, ['==', ['literal', 1], ['literal', 0]] as any)
      } else if (this._selected.size === voltage_scale.length) {
        this._map.setFilter(id, orig)
      } else {
        const conditions = [...this._selected].map((i) => voltageClassFilter(i, field))
        const voltageExpr: FilterSpecification =
          conditions.length === 1 ? conditions[0] : (['any', ...conditions] as any)
        this._map.setFilter(id, ['all', orig, voltageExpr] as any)
      }
    }
  }
}
