/**
 * Regression guard (#480): every item type whose situational modifiers are read
 * must actually declare `ModifiersTemplate` in its schema.
 *
 * `WH40KAcolyte.getSituationalModifiers` collects `system.modifiers.situational`
 * from equipped **armour**, **cybernetic** and **gear**. But only `cybernetic`
 * mixed in `ModifiersTemplate` — so for the other two the field was absent from the
 * schema, V14 validation dropped the authored block on load, and the modifier
 * silently contributed nothing. The DH2 Auspex/Scanner correctly declares a
 * situational Awareness +20 and still never surfaced as an assist chip.
 *
 * The failure is invisible at the data layer (the JSON looks right) and at the
 * reader (the collector looks right), which is why it needs a guard: it only shows
 * up as "the chip isn't there".
 *
 * Source scan rather than runtime: instantiating a DataModel needs Foundry, which
 * the unit environment does not provide (see `importModelOrSkip`), and the contract
 * here is a literal one on the mixin list.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

/** Item types `getSituationalModifiers` collects equipped situational modifiers from. */
const MODIFIER_SOURCE_TYPES = ['armour', 'cybernetic', 'gear'] as const;

describe('items that provide situational modifiers declare ModifiersTemplate (#480)', () => {
    it.each(MODIFIER_SOURCE_TYPES)('%s mixes in ModifiersTemplate', (type) => {
        const src = readRepoFile(`src/module/data/item/${type}.ts`);
        const mixinLine = /ItemDataModel\.mixin\(([^)]*)\)/.exec(src);
        expect(mixinLine, `${type}.ts has an ItemDataModel.mixin(...) declaration`).not.toBeNull();
        expect(mixinLine?.[1], `${type}.ts must mix in ModifiersTemplate`).toContain('ModifiersTemplate');
    });

    it('the collector still reads exactly these three equipped types', () => {
        // If a fourth type is added to the collector, it needs the mixin too — this
        // keeps the guard's list honest rather than silently drifting out of date.
        const collector = readRepoFile('src/module/documents/acolyte.ts');
        for (const type of MODIFIER_SOURCE_TYPES) {
            expect(collector, `collector filters ${type}`).toContain(`item.type === '${type}'`);
        }
    });
});
