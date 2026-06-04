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

describe('Combat-tab weapon equip toggle (#265)', () => {
    it('renders an equip/unequip control on the weapon rows', () => {
        expect(COMBAT).toContain('data-action="toggleEquip"');
        // It reflects the equipped state (so the user can see and change it).
        expect(COMBAT).toMatch(/data-action="toggleEquip"[\s\S]*item\.system\.state\.equipped/);
    });

    it('still highlights the currently-equipped weapon row', () => {
        // The equipped row keeps its success-tinted background + check indicator.
        expect(COMBAT).toContain('fa-check-circle');
    });

    it('binds to the existing toggleEquip action on the shared sheet', () => {
        expect(CHAR_SHEET).toContain("'toggleEquip': CharacterSheet.#toggleEquip");
    });
});
