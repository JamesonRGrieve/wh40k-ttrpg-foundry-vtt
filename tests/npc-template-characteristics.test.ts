/**
 * Regression (#656): the NPC Template sheet's characteristic inputs were named by
 * the list index, not the characteristic. The sheet hands the tab a list of
 * `{ key, label, short, value, unnatural }`, and `{{#each characteristics as |char key|}}`
 * makes `key` the index, so editing Weapon Skill wrote `system.baseCharacteristics.0`.
 * The unnatural inputs also targeted `system.unnaturalCharacteristics`, a path the
 * schema doesn't have; the schema field is `system.unnaturals`.
 */

import HbsLib from 'handlebars';
import { describe, expect, it } from 'vitest';
import tabSrc from '../src/templates/item/npc-template/tab-characteristics.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';
import { readRepoFile } from './lib/repo-file.ts';

initializeStoryHandlebars();

function render(): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = HbsLib.compile(tabSrc)({
        tab: { cssClass: 'active' },
        characteristics: [
            { key: 'weaponSkill', label: 'Weapon Skill', short: 'WS', value: 35, unnatural: 0 },
            { key: 'strength', label: 'Strength', short: 'S', value: 40, unnatural: 2 },
        ],
        system: { trainedSkills: [], unnaturals: { strength: 2 } },
    });
    return host;
}

describe('NPC Template sheet form (#656)', () => {
    // Every NPC Template tab renders into one form. A name used by two inputs submits
    // as an array, which fails the field's validation and drops the whole update:
    // `system.baseArmour` on the Characteristics and Equipment tabs did exactly that.
    it('no form field name is used by two inputs across the tabs', () => {
        const names = ['tab-basics', 'tab-characteristics', 'tab-equipment', 'tab-abilities', 'tab-preview', 'header'].flatMap((part) =>
            Array.from(readRepoFile(`src/templates/item/npc-template/${part}.hbs`).matchAll(/name="(system\.[^"{]+)"/g), (m) => m[1]),
        );
        expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
    });
});

describe('NPC Template characteristics tab (#656)', () => {
    it('names each base characteristic input by its key and shows its value', () => {
        const inputs = Array.from(render().querySelectorAll<HTMLInputElement>('input[name^="system.baseCharacteristics."]'));
        expect(inputs.map((input) => [input.name, input.value])).toEqual([
            ['system.baseCharacteristics.weaponSkill', '35'],
            ['system.baseCharacteristics.strength', '40'],
        ]);
    });

    it('names each unnatural input under system.unnaturals by key and shows its value', () => {
        const root = render();
        const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[name^="system.unnaturals."]'));
        expect(inputs.map((input) => [input.name, input.value])).toEqual([
            ['system.unnaturals.weaponSkill', '0'],
            ['system.unnaturals.strength', '2'],
        ]);
        expect(root.querySelector('[name^="system.unnaturalCharacteristics"]')).toBeNull();
    });
});
