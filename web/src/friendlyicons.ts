import { manifest } from 'virtual:render-svg'

// Map layers icons to show in the infobox
const friendlyIcons: { [key: string]: string } = {
  power_substation_transformer: manifest['svg']['power_transformer'],
  power_tower_pylon: manifest['svg']['power_tower'],
  power_tower_pole: manifest['svg']['power_pole'],
  power_plant_generator_symbol: manifest['svg']['power_generator']
}

export default friendlyIcons
