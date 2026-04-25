import { WH40K as WH40K_BASE } from '../config.ts';

export const WH40K: Record<string, unknown> = {};

// Merge the comprehensive config from config.mjs
Object.assign(WH40K, WH40K_BASE);

// Origin Path steps for WH40K RPG character creation
WH40K.originPath = {
    steps: [
        { key: 'homeWorld', label: 'Home World', choiceGroup: 'origin.home-world' },
        { key: 'birthright', label: 'Birthright', choiceGroup: 'origin.birthright' },
        { key: 'lureOfTheVoid', label: 'Lure of the Void', choiceGroup: 'origin.lure-of-the-void' },
        { key: 'trialsAndTravails', label: 'Trials and Travails', choiceGroup: 'origin.trials-and-travails' },
        { key: 'motivation', label: 'Motivation', choiceGroup: 'origin.motivation' },
        { key: 'career', label: 'Career', choiceGroup: 'origin.career' },
    ],
    compendium: 'wh40k-rpg.rt-items-origin-path',
};

WH40K.bio = {
    primary: [],
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
    },
};

// Sizes object for selectOptions helper (matches bio.size structure)
WH40K.sizes = {
    1: 'Minuscule (1)',
    2: 'Puny (2)',
    3: 'Scrawny (3)',
    4: 'Average (4)',
    5: 'Hulking (5)',
    6: 'Enormous (6)',
    7: 'Massive (7)',
    8: 'Immense (8)',
    9: 'Monumental (9)',
    10: 'Titanic (10)',
};

WH40K.items = {
    availability: ['Ubiquitous', 'Abundant', 'Plentiful', 'Common', 'Average', 'Scarce', 'Rare', 'Very Rare', 'Extremely Rare', 'Near Unique', 'Unique'],
    craftsmanship: ['Poor', 'Common', 'Good', 'Best'],
    vehicle_types: ['Walker', 'Wheeled', 'Tracked', 'Skimmer', 'Aircraft', 'Spacecraft'],
};

WH40K.combat = {
    las_fire_modes: ['Standard', 'Overcharge', 'Overload'],
    psychic_attacks: ['Psychic Bolt', 'Psychic Blast', 'Psychic Barrage', 'Psychic Storm'],
    damage_types: ['Energy', 'Impact', 'Rending', 'Explosive'],
    action_speeds: ['N/A', 'Free Action', 'Half Action', 'Full Action', '2 Full Actions', '3 Full Actions', 'Special'],
    sustained_speeds: ['No', 'Free Action', 'Half Action', 'Full Action'],
    psychic_subtypes: ['Concentration', 'Attack', 'Attack, Concentration'],
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
        weaponSkill: 'WS',
        ballisticSkill: 'BS',
        strength: 'S',
        toughness: 'T',
        agility: 'Ag',
        intelligence: 'Int',
        perception: 'Per',
        willpower: 'WP',
        fellowship: 'Fel',
    },
};

// Ship-related configuration
WH40K.ship = {
    hullTypes: ['Transport', 'Raider', 'Frigate', 'Light Cruiser', 'Cruiser', 'Grand Cruiser', 'Battleship'],
    componentTypes: ['Essential', 'Supplemental', 'Weapon', 'Hull'],
};

WH40K.ui = {
    toggleExpanded: function (name) {
        if (WH40K.ui.expanded.includes(name)) {
            const index = WH40K.ui.expanded.indexOf(name);
            if (index > -1) {
                WH40K.ui.expanded.splice(index, 1);
            }
        } else {
            WH40K.ui.expanded.push(name);
        }
    },
    expanded: [],
};

export function toggleUIExpanded(name) {
    CONFIG.wh40k.ui.toggleExpanded(name);
}

export function fieldMatch(val1, val2) {
    if (!val1 || !val2) return false;
    const one = val1.replace(/\s/g, '');
    const two = val2.replace(/\s/g, '');
    return one.toUpperCase() === two.toUpperCase();
}
