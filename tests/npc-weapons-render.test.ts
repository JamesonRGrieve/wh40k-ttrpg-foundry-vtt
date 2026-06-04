/**
 * Regression guard (#254): the NPC tab surfaces the NPC's weapons — both the
 * migrated simple-mode weapons (system.weapons.simple) and any embedded weapon
 * items — so an imported bestiary NPC's guns/blades actually show on the sheet.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const TAB_NPC = readRepoFile('src/templates/actor/npc/tab-npc.hbs');

describe('NPC weapons surface on the NPC tab (#254)', () => {
    it('renders a Weapons panel gated on having weapons', () => {
        expect(TAB_NPC).toContain('{{#if (or system.weapons.simple.length embeddedWeapons.length)}}');
    });

    it('lists the simple-mode weapons (name / damage / pen / range)', () => {
        expect(TAB_NPC).toContain('{{#each system.weapons.simple as |w|}}');
        expect(TAB_NPC).toContain('{{w.name}}');
        expect(TAB_NPC).toContain('{{w.damage}}');
        expect(TAB_NPC).toContain('{{w.range}}');
    });

    it('also lists any embedded weapon items', () => {
        expect(TAB_NPC).toContain('{{#each embeddedWeapons as |item|}}');
        expect(TAB_NPC).toContain('{{item.system.damageLabel}}');
    });
});
