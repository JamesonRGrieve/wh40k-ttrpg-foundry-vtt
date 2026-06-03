#!/usr/bin/env node
/**
 * One-shot data migration (#239): repoint compendium `img` paths that reference
 * the dead `modules/game-icons-net-font/...` module to Foundry-core icons that
 * resolve. The recommended module manifest (fitzthum/game-icons-net) is a 404,
 * and the legacy `icons/svg/<name>` paths it remapped from were themselves
 * non-resolving — so these icons never displayed. Every target below is from the
 * set the system itself treats as "definitely exists" (item.ts `_getDefaultIcon`)
 * or is already used by shipped pack documents, mapped by semantic category.
 *
 * Run: node scripts/fix-pack-module-icons.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKS_ROOT = 'src/packs';
const PREFIX = 'modules/game-icons-net-font/svg/';

/** game-icons basename (without .svg) → confirmed-present Foundry-core icon. */
const REMAP = {
    'alien-bug': 'icons/svg/mystery-man.svg',
    'android-mask': 'icons/svg/mystery-man.svg',
    'astronaut-helmet': 'icons/svg/mystery-man.svg',
    'backpack': 'icons/svg/item-bag.svg',
    'book': 'icons/svg/book.svg',
    'brain': 'icons/svg/lightning.svg',
    'conversation': 'icons/svg/mystery-man.svg',
    'crested-helmet': 'icons/svg/shield.svg',
    'crossed-swords': 'icons/svg/sword.svg',
    'crosshairs': 'icons/svg/target.svg',
    'crown': 'icons/svg/item-bag.svg',
    'daggers': 'icons/svg/sword.svg',
    'dice-twenty-faces-twenty': 'icons/svg/d20.svg',
    'domino-mask': 'icons/svg/mystery-man.svg',
    'eagle-emblem': 'icons/svg/angel.svg',
    'evil-eyes': 'icons/svg/eye.svg',
    'gears': 'icons/svg/clockwork.svg',
    'hidden': 'icons/svg/mystery-man.svg',
    'holy-symbol': 'icons/svg/holy-shield.svg',
    'jeep': 'icons/svg/mech.svg',
    'laser-gun': 'icons/svg/sword.svg',
    'medal': 'icons/svg/item-bag.svg',
    'network-bars': 'icons/svg/clockwork.svg',
    'ninja': 'icons/svg/mystery-man.svg',
    'parachute': 'icons/svg/item-bag.svg',
    'radio-tower': 'icons/svg/tower.svg',
    'ringed-planet': 'icons/svg/sun.svg',
    'robotic-arm': 'icons/svg/upgrade.svg',
    'rune-stone': 'icons/svg/statue.svg',
    'shield': 'icons/svg/shield.svg',
    'spaceship': 'icons/svg/mech.svg',
    'stone-throne': 'icons/svg/statue.svg',
};

const DEFAULT_TARGET = 'icons/svg/item-bag.svg';

/** Recursively collect all *.json files under a directory. */
function jsonFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...jsonFiles(full));
        else if (entry.endsWith('.json')) out.push(full);
    }
    return out;
}

let filesChanged = 0;
let refsChanged = 0;
const unmapped = new Set();

for (const file of jsonFiles(PACKS_ROOT)) {
    const original = readFileSync(file, 'utf8');
    if (!original.includes(PREFIX)) continue;
    const updated = original.replace(new RegExp(`${PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([a-z0-9-]+)\\.svg`, 'g'), (_match, name) => {
        refsChanged++;
        const target = REMAP[name];
        if (target === undefined) unmapped.add(name);
        return target ?? DEFAULT_TARGET;
    });
    if (updated !== original) {
        writeFileSync(file, updated);
        filesChanged++;
    }
}

console.log(`[fix-pack-module-icons] rewrote ${refsChanged} refs across ${filesChanged} files`);
if (unmapped.size > 0) console.log(`[fix-pack-module-icons] unmapped (fell back to ${DEFAULT_TARGET}):`, [...unmapped].join(', '));
