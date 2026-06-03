/**
 * Regression guard (#262): a weapon can be marked unidentified so players cannot
 * see its damage / penetration / range; the GM always sees them.
 *
 * - `system.state.identified` lives on the shared EquippableTemplate state and
 *   defaults to `true` (existing/RAW gear stays visible).
 * - It is a per-instance runtime flag, so it is preserved across the
 *   compendium→world resync.
 * - The actor-sheet weapon displays gate damage/pen/range on
 *   `(or item.system.state.identified @root.isGM)`.
 *
 * Source scan: the DataModels pull in Foundry globals at load and the templates
 * need Foundry's sheet context, so the contract is asserted on the source text.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string): string => readFileSync(resolve(__dirname, '..', p), 'utf8');

const EQUIPPABLE = read('src/module/data/shared/equippable-template.ts');
const RESYNC = read('src/module/compendium-resync.ts');
const WEAPON_PANEL = read('src/templates/actor/panel/weapon-panel.hbs');
const COMBAT_PANEL = read('src/templates/actor/panel/combat-station-panel.hbs');
const OVERVIEW = read('src/templates/actor/player/tab-overview.hbs');
const WEAPON_SHEET = read('src/templates/item/item-weapon-sheet.hbs');
const LANG = JSON.parse(read('src/lang/en.json')) as { WH40K: { Weapon: Record<string, string> } };

describe('weapon identification schema (#262)', () => {
    it('declares identified on the shared EquippableState, defaulting to true', () => {
        expect(EQUIPPABLE).toContain('identified: boolean');
        expect(EQUIPPABLE).toMatch(/identified: new fields\.BooleanField\(\{ required: true, initial: true \}\)/);
    });

    it('preserves system.state.identified across the compendium→world resync', () => {
        // The weapon preserve list must keep the per-instance flag from being
        // clobbered back to the compendium default.
        expect(RESYNC).toMatch(/'weapon':\s*\[[^\]]*'state\.identified'/);
    });
});

describe('weapon stat concealment gating (#262)', () => {
    it('gates the weapon-panel damage/pen/range on identified-or-GM', () => {
        const gates = WEAPON_PANEL.match(/\(or item\.system\.state\.identified @root\.isGM\)/g) ?? [];
        // damage, penetration, range = three gated stats.
        expect(gates.length).toBeGreaterThanOrEqual(3);
        expect(WEAPON_PANEL).toContain('WH40K.Weapon.ConcealedStat');
    });

    it('gates the combat-panel weapon-row Dmg/Range on identified-or-GM', () => {
        const gates = COMBAT_PANEL.match(/\(or item\.system\.state\.identified @root\.isGM\)/g) ?? [];
        expect(gates.length).toBeGreaterThanOrEqual(2);
    });

    it('gates the overview equipped-weapon damage/range on identified-or-GM', () => {
        expect(OVERVIEW).toMatch(/\(or weapon\.system\.state\.identified @root\.isGM\)/);
    });

    it('exposes a GM Identified toggle on the weapon item sheet', () => {
        expect(WEAPON_SHEET).toContain('name="system.state.identified"');
    });
});

describe('weapon identification langpack (#262)', () => {
    it('provides the concealed-stat and identified labels', () => {
        expect(LANG.WH40K.Weapon.Identified).toBeDefined();
        expect(LANG.WH40K.Weapon.ConcealedStat).toBeDefined();
        expect(LANG.WH40K.Weapon.ConcealedHint).toBeDefined();
    });
});
