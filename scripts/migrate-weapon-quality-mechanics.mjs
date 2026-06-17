/**
 * One-time migration (#303): copy the structured mechanical payloads from the
 * in-`src/` WEAPON_QUALITY_EFFECTS registry onto the matching weaponQuality
 * compendium documents as `system.mechanics`, so quality mechanics become
 * content data (Direction #7) read by the boot-time payload index rather than a
 * hardcoded table.
 *
 * Imports the payloads from the built dist (run `pnpm build` first) and writes
 * only each quality's *set* keys (the DataModel + the index's default-merge fill
 * the rest). The `description` string is dropped — the pack doc's effect /
 * description fields are the display source.
 *
 * Usage:  node scripts/migrate-weapon-quality-mechanics.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WEAPON_QUALITY_EFFECTS } from '../dist/module/rules/weapon-quality-effects.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACK_SOURCE = join(ROOT, 'src/packs/rogue-trader/rt-core-items-weapon-qualities/_source');

/** Build the `mechanics` payload for a quality: the registry entry minus `description`. */
function mechanicsFor(identifier) {
    const entry = WEAPON_QUALITY_EFFECTS[identifier];
    if (entry === undefined) return null;
    const { description: _drop, ...mechanics } = entry;
    return mechanics;
}

const files = readdirSync(PACK_SOURCE).filter((f) => f.endsWith('.json'));
const matchedIds = new Set();
let updated = 0;

for (const file of files) {
    const path = join(PACK_SOURCE, file);
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    const identifier = doc?.system?.identifier;
    if (typeof identifier !== 'string' || identifier === '') continue;

    const mechanics = mechanicsFor(identifier);
    if (mechanics === null) continue;

    matchedIds.add(identifier);
    doc.system.mechanics = mechanics;
    writeFileSync(path, `${JSON.stringify(doc, null, 4)}\n`);
    updated += 1;
}

const registryIds = Object.keys(WEAPON_QUALITY_EFFECTS);
const unmatched = registryIds.filter((id) => !matchedIds.has(id));

console.log(`[migrate-weapon-quality-mechanics] updated ${updated} doc(s) across ${registryIds.length} registry qualities.`);
if (unmatched.length > 0) {
    console.log(`[migrate-weapon-quality-mechanics] WARNING: ${unmatched.length} registry qualities have NO matching pack doc:`);
    console.log(`  ${unmatched.join(', ')}`);
} else {
    console.log('[migrate-weapon-quality-mechanics] every registry quality matched a pack doc.');
}
