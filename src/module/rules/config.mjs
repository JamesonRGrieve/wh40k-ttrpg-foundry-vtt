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
    size: {
        4: 'Average (4)',
        1: 'Minuscule (1)',
        2: 'Puny (2)',
        3: 'Scrawny (3)',
        5: 'Hulking (5)',
        6: 'Enormous (6)',
        7: 'Massive (7)',
        8: 'Immense (8)',
        9: 'Monumental (9)',
        10: 'Titanic (10)',
    }
};

DarkHeresy.items = {
    availability: ['Ubiquitous', 'Abundant', 'Plentiful', 'Common', 'Average', 'Scarce', 'Rare', 'Very Rare', 'Extremely Rare', 'Near Unique', 'Unique'],
    craftsmanship: ['Poor', 'Common', 'Good', 'Best'],
    vehicle_types: ['Walker', 'Wheeled', 'Tracked', 'Skimmer', 'Aircraft', 'Spacecraft']
};

DarkHeresy.combat = {
    las_fire_modes: ['Standard', 'Overcharge', 'Overload'],
    psychic_attacks: ['Psychic Bolt', 'Psychic Blast', 'Psychic Barrage', 'Psychic Storm'],
    damage_types: ['Energy', 'Impact', 'Rending', 'Explosive'],
    action_speeds: ['N/A', 'Free Action', 'Half Action', 'Full Action', '2 Full Actions', '3 Full Actions', 'Special'],
    sustained_speeds: ['No', 'Free Action', 'Half Action', 'Full Action'],
    psychic_subtypes: ['Concentration', 'Attack', 'Attack, Concentration'],
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
    characteristics: {
        'weaponSkill': 'WS',
        'ballisticSkill': 'BS',
        'strength': 'S',
        'toughness': 'T',
        'agility': 'Ag',
        'intelligence': 'Int',
        'perception': 'Per',
        'willpower': 'WP',
        'fellowship': 'Fel',
        'influence': 'Inf'
    }
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
