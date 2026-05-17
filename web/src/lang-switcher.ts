import './lang-switcher.css'
import i18next from 'i18next'
import type { Map, IControl } from 'maplibre-gl'

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'uk', label: 'UK' }
] as const

export class LanguageSwitcher implements IControl {
  private container!: HTMLDivElement

  onAdd(_map: Map): HTMLElement {
    this.container = document.createElement('div')
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group oim-lang-switcher'
    this.container.setAttribute('role', 'group')
    this.container.setAttribute('aria-label', i18next.t('language.switch', 'Switch language'))
    this.render()
    return this.container
  }

  onRemove(): void {
    this.container.remove()
  }

  private currentLang(): string {
    return i18next.language.split('-')[0]
  }

  private render(): void {
    const current = this.currentLang()
    this.container.innerHTML = ''

    for (const { code, label } of LANGS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = label
      btn.className = code === current ? 'active' : ''
      btn.setAttribute('aria-pressed', String(code === current))
      btn.setAttribute('aria-label', label)
      btn.addEventListener('click', () => this.switchTo(code))
      this.container.appendChild(btn)
    }
  }

  private switchTo(code: string): void {
    if (this.currentLang() === code) return
    localStorage.setItem('i18nextLng', code)
    window.location.reload()
  }
}
