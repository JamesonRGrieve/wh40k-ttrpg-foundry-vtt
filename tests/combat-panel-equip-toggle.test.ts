/**
 * Regression guard (#265): the Combat tab shows the actor's weapons (equipped
 * ones highlighted) and lets the user change which weapon is equipped — an
 * equip/unequip control on each weapon row, wired to the existing toggleEquip
 * action (shared by the character and NPC sheets).
 *
 * Source scan: the sheet pulls Foundry globals at load; the contract is the
 * literal toggle control + registered action.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const COMBAT = readRepoFile('src/templates/actor/panel/combat-station-panel.hbs');
const CHAR_SHEET = readRepoFile('src/module/applications/actor/character-sheet.ts');
const BASE_ACTOR = readRepoFile('src/module/documents/base-actor.ts');
const WEAPON = readRepoFile('src/module/data/item/weapon.ts');

describe('Combat-tab weapon equip toggle (#265)', () => {
    it('renders an equip/unequip control on the weapon rows', () => {
        expect(COMBAT).toContain('data-action="toggleEquip"');
        // It reflects the equipped state (so the user can see and change it).
        expect(COMBAT).toMatch(/data-action="toggleEquip"[\s\S]*item\.system\.state\.equipped/);
    });

    it('still highlights the currently-equipped weapon row', () => {
        // The equipped row keeps its success-tinted background + check indicator.
        expect(COMBAT).toContain('fa-check-circle');
        // The row background is success-tinted only when the weapon is equipped.
        expect(COMBAT).toMatch(/item\.system\.state\.equipped[\s\S]*wh40k-color-success/);
    });

    it('binds to the existing toggleEquip action on the shared sheet', () => {
        expect(CHAR_SHEET).toContain("'toggleEquip': CharacterSheet.#toggleEquip");
    });
});

describe('Combat action gated to equipped weapons (#265, reopened)', () => {
    it('refuses a weapon roll via the shared equip gate with a localized warning', () => {
        expect(BASE_ACTOR).toContain('isWeaponAttackBlockedByEquip(item.system, enforceEquipped)');
        expect(BASE_ACTOR).toContain("t('WH40K.Warning.WeaponNotEquipped')");
    });

    it('no longer force-derives equipped state (so the stored toggle and gate are live)', () => {
        // The old `this.state.equipped = !this.state.inShipStorage` derivation made every
        // weapon permanently equipped, defeating both the highlight and the attack gate.
        expect(WEAPON).not.toMatch(/this\.state\.equipped\s*=\s*!this\.state\.inShipStorage/);
    });
});
