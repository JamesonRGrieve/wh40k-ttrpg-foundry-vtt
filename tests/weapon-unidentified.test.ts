/**
 * Regression guard (#262): a weapon can be marked unidentified so players cannot
 * see its damage / penetration / range; the GM always sees them.
 *
 * - `system.state.identified` lives on the shared EquippableTemplate state and
 *   defaults to `true` (existing/RAW gear stays visible).
 * - It is per-instance runtime state, so it survives the compendium→world join:
 *   the hydration in `compendium-hydrate.ts` is "persisted wins" (the actor's
 *   stored value overlays the canonical body) and never writes the database.
 * - The actor-sheet weapon displays gate damage/pen/range on
 *   `(or item.system.state.identified @root.isGM)`.
 *
 * Source scan: the DataModels pull in Foundry globals at load and the templates
 * need Foundry's sheet context, so the contract is asserted on the source text.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const EQUIPPABLE = readRepoFile('src/module/data/shared/equippable-template.ts');
const HYDRATE = readRepoFile('src/module/compendium-hydrate.ts');
const WEAPON_PANEL = readRepoFile('src/templates/actor/panel/weapon-panel.hbs');
const COMBAT_PANEL = readRepoFile('src/templates/actor/panel/combat-station-panel.hbs');
const OVERVIEW = readRepoFile('src/templates/actor/player/tab-overview.hbs');
const WEAPON_SHEET = readRepoFile('src/templates/item/item-weapon-sheet.hbs');
const LANG = JSON.parse(readRepoFile('src/lang/en.json')) as { WH40K: { Weapon: Record<string, string> } };

describe('weapon identification schema (#262)', () => {
    it('declares identified on the shared EquippableState, defaulting to true', () => {
        expect(EQUIPPABLE).toContain('identified: boolean');
        expect(EQUIPPABLE).toMatch(/identified: new fields\.BooleanField\(\{ required: true, initial: true \}\)/);
    });

    it('survives the compendium→world join because hydration is persisted-wins', () => {
        // The in-memory join overlays the actor's PERSISTED system on top of the
        // canonical body (persisted wins), so a per-instance flag like
        // state.identified is never reset to the compendium default — and because
        // the join never writes the DB, there is nothing on disk to clobber.
        expect(HYDRATE).toMatch(/deepMerge\(structuredClone\(sourceSystem\), persistedSystem\)/);
        expect(HYDRATE).toMatch(/_source\?\.system \?\? item\.system/);
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

    it('no longer renders equipped-weapon stats on the Overview (#318) — nothing to gate there', () => {
        // #318 removed the Equipped Weapons panel from the Overview tab; the weapon
        // stat-concealment gating now lives on the weapon-panel and combat-panel only.
        expect(OVERVIEW).not.toMatch(/\(or weapon\.system\.state\.identified @root\.isGM\)/);
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
