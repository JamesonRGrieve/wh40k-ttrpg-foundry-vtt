/**
 * Regression guard (#227): per-weapon attack actions are NOT listed on the combat
 * panel — they belong on the weapon attack dialog (opened from a weapon, where a
 * target / RoF mode / modifiers are chosen). The panel keeps only the non-per-weapon
 * actions: combat talents, movement, reactions, and utility tools.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const panel = readFileSync(resolve(__dirname, '../src/templates/actor/panel/combat-actions-panel.hbs'), 'utf8');
const sheet = readFileSync(resolve(__dirname, '../src/module/applications/actor/character-sheet.ts'), 'utf8');

describe('combat panel no longer lists per-weapon attack actions (#227)', () => {
    it('drops the Attack / Melee / Ranged attack-action groups', () => {
        expect(panel).not.toContain('heading="Attack Actions"');
        expect(panel).not.toContain('heading="Melee Attacks"');
        expect(panel).not.toContain('heading="Ranged Attacks"');
        expect(panel).not.toContain('items=generalAttacks');
        expect(panel).not.toContain('items=meleeAttacks');
        expect(panel).not.toContain('items=rangedAttacks');
    });

    it('keeps the non-per-weapon action groups', () => {
        expect(panel).toContain('heading="Movement Actions"');
        expect(panel).toContain('heading="Reactions"');
        expect(panel).toContain('heading="Combat Talents"');
        expect(panel).toContain('heading="Utility Actions"');
    });

    it('the sheet no longer partitions attacks into melee/ranged/general for the panel', () => {
        expect(sheet).not.toContain('sheetContext.meleeAttacks =');
        expect(sheet).not.toContain('sheetContext.rangedAttacks =');
        expect(sheet).not.toContain('sheetContext.generalAttacks =');
    });
});
