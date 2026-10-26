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

describe('Combat-tab Draw / Holster weapon action (#404)', () => {
    it('surfaces the equip control as an explicit Draw / Holster action', () => {
        // The DH2 Ready halves: Draw a stowed weapon, Holster a drawn one.
        expect(COMBAT).toContain('WH40K.Weapon.DrawWeapon');
        expect(COMBAT).toContain('WH40K.Weapon.HolsterWeapon');
        // Both labels hang off the equipped-state conditional on the toggleEquip control
        // (Holster when drawn, Draw when holstered), with an accessible label.
        const idx = COMBAT.indexOf('data-action="toggleEquip"');
        const control = COMBAT.slice(idx, idx + 500);
        expect(control).toContain('HolsterWeapon');
        expect(control).toContain('DrawWeapon');
        expect(control).toContain('aria-label=');
    });

    it('is no longer hidden behind hover — the toggleEquip control is persistently visible', () => {
        // #404: the old control was opacity-0 until group-hover; the delete button beside it
        // stays hover-only, so scope the check to the toggleEquip control's own markup.
        const idx = COMBAT.indexOf('data-action="toggleEquip"');
        const control = COMBAT.slice(Math.max(0, idx - 600), idx);
        expect(control).not.toContain('tw-opacity-0');
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

describe('the row buttons never cover the Range column (#698)', () => {
    /** A Tailwind spacing step in rem (tw-pr-14 → 3.5, tw-right-8 → 2, tw-w-5 → 1.25). */
    const step = (cls: string, prefix: string): number => Number(new RegExp(`\\b${prefix}-(\\d+)\\b`).exec(cls)?.[1] ?? 'NaN') / 4;
    const classOf = (marker: string): string => {
        const at = COMBAT.indexOf(marker);
        const open = COMBAT.lastIndexOf('<', at);
        return /class="([^"]*)"/.exec(COMBAT.slice(open, COMBAT.indexOf('>', at)))?.[1] ?? '';
    };

    it('reserves room on the header and every row for the absolutely placed Draw/Holster and Delete buttons', () => {
        const header = /<div class="([^"]*tw-grid-cols-content-auto-auto[^"]*)">\s*<span[^>]*>\{\{localize "WH40K\.Items\.Weapon"\}\}/.exec(COMBAT)?.[1] ?? '';
        const row = classOf('data-item-type="weapon"');
        const toggle = classOf('data-action="toggleEquip"');
        // The leftmost button edge, measured from the row's right: right offset plus width.
        const buttonsReach = step(toggle, 'tw-right') + step(toggle, 'tw-w');
        expect(step(header, 'tw-pr')).toBeGreaterThanOrEqual(buttonsReach);
        expect(step(row, 'tw-pr')).toBe(step(header, 'tw-pr'));
    });
});
