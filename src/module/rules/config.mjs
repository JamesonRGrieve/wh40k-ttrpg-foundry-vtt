import { eliteAdvancesNames } from './elite-advances.mjs';
import { homeworldNames } from './homeworlds.mjs';
import { attackSpecialsNames } from './attack-specials.mjs';
import { backgroundNames } from './backgrounds.mjs';
import { roleNames } from './roles.mjs';
import { divinationNames } from './divinations.mjs';

export const DarkHeresy = {};

DarkHeresy.bio = {
  homeWorld: homeworldNames(),
  background: backgroundNames(),
  role: roleNames(),
  elite: eliteAdvancesNames(),
  divination: divinationNames(),
  primary: ['background', 'role', 'elite', 'homeWorld', 'divination'],
};

DarkHeresy.items = {
  availability: ['Ubiquitous', 'Abundant', 'Common', 'Average', 'Scarce', 'Rare', 'Very Rare', 'Extremely Rare', 'Near Unique', 'Unique'],
  craftsmanship: ['Poor', 'Common', 'Good', 'Best'],
};

DarkHeresy.combat = {
  damage_types: ['Energy', 'Impact', 'Rending', 'Explosive'],
  special: attackSpecialsNames(),
  weapon_class: ['Pistol', 'Basic', 'Heavy', 'Thrown', 'Melee'],
  weapon_type: [
    'Bolt',
    'Flame',
    'Las',
    'Launcher',
    'Low-Tech',
    'Melta',
    'Plasma',
    'Solid Projectile',
    'Exotic',
    'Grenades/Missiles',
    'Explosives',
    'Chain',
    'Force',
    'Power',
    'Shock',
  ],
  armour_type: ['Basic', 'Flak', 'Mesh', 'Carapace', 'Power'],
};

DarkHeresy.ui = {
  toggleExpanded: function (name) {
    if (DarkHeresy.ui.expanded.includes(name)) {
      const index = DarkHeresy.ui.expanded.indexOf(name);
      if (index > -1) {
        DarkHeresy.ui.expanded.splice(index, 1);
      }
    } else {
      DarkHeresy.ui.expanded.push(name);
    }
  },
  expanded: [],
};

export function toggleUIExpanded(name) {
  CONFIG.dh.ui.toggleExpanded(name);
}

export function fieldMatch(val1, val2) {
  let one = val1.replace(/\s/g, '');
  let two = val2.replace(/\s/g, '');
  return one.toUpperCase() === two.toUpperCase();
}
