/**
 * Regression guard (#265): the Combat tab shows the actor's weapons (equipped
 * ones highlighted) and lets the user change which weapon is equipped — an
 * equip/unequip control on each weapon row, wired to the existing toggleEquip
 * action (shared by the character and NPC sheets).
 *
 * Source scan: the sheet pulls Foundry globals at load; the contract is the
 * literal toggle control + registered action.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMBAT = readFileSync(resolve(__dirname, '../src/templates/actor/panel/combat-station-panel.hbs'), 'utf8');
const CHAR_SHEET = readFileSync(resolve(__dirname, '../src/module/applications/actor/character-sheet.ts'), 'utf8');

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
