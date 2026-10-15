import { afterAll, describe, expect, it } from 'vitest';
import { ElementField, installFoundryDataStub, LeafField, SchemaRecord } from '../../testing/foundry-data-stub.ts';

/**
 * MutationData schema contract (#180): the Gift of the Gods additions are
 * optional — every field defaults to empty — and the `category` choices are the
 * shared {@link MUTATION_CATEGORIES} list, so existing Dark Heresy mutations load
 * unchanged while a Black Crusade Gift validates.
 *
 * `mutation.ts` evaluates `foundry.abstract` / `foundry.data.fields` at module
 * load, so the recording stub (testing/foundry-data-stub.ts) is installed BEFORE
 * the dynamic import. Each stub field records the options (and, for container
 * fields, the inner field) it was built with, which is the contract asserted here.
 */

afterAll(installFoundryDataStub());

const { default: MutationData } = await import('./mutation.ts');
const { MUTATION_CATEGORIES } = await import('../../rules/mutation-categories.ts');
const { GIFT_ALIGNMENTS, GIFT_ROLL_DIRECTIONS, GIFT_SUB_TABLES } = await import('../../rules/bc-gifts.ts');

const schema = MutationData.defineSchema();

/** Narrow a recorded field to the expected stub class, failing loudly otherwise. */
function leaf(value: object | undefined): LeafField {
    if (!(value instanceof LeafField)) throw new Error('expected a leaf field');
    return value;
}
function collection(value: object | undefined): ElementField {
    if (!(value instanceof ElementField)) throw new Error('expected a collection field');
    return value;
}
function record(value: object | undefined): SchemaRecord {
    if (!(value instanceof SchemaRecord)) throw new Error('expected a schema field');
    return value;
}

const gift = record(schema['gift']);

describe('MutationData schema', () => {
    it('keeps the inherited description + modifiers templates (flat changes stay on Path A)', () => {
        expect(schema['description']).toBeDefined();
        expect(schema['modifiers']).toBeDefined();
    });

    it('offers every shared mutation category, defaulting to minor', () => {
        const category = leaf(schema['category']);
        expect(category.options.choices).toEqual([...MUTATION_CATEGORIES]);
        expect(category.options.initial).toBe('minor');
    });

    it('adds a gift block whose collections default to empty and whose sub-table defaults to none', () => {
        expect(collection(gift.fields['grants']).options.initial).toEqual([]);
        expect(collection(gift.fields['riders']).options.initial).toEqual([]);
        expect(collection(gift.fields['characteristicRolls']).options.initial).toEqual([]);
        const subTable = leaf(gift.fields['subTable']);
        expect(subTable.options.initial).toBe('');
        expect(subTable.options.blank).toBe(true);
        expect(subTable.options.choices).toEqual([...GIFT_SUB_TABLES]);
    });

    it('shapes a rider as alignment / description / characteristics / skills / grants / activeEffect', () => {
        const rider = record(collection(gift.fields['riders']).element);
        expect(Object.keys(rider.fields).sort()).toEqual(['activeEffect', 'alignment', 'characteristics', 'description', 'grants', 'skills']);
        expect(leaf(rider.fields['alignment']).options.choices).toEqual([...GIFT_ALIGNMENTS]);
        expect(leaf(rider.fields['characteristics']).options.initial).toEqual({});
        expect(leaf(rider.fields['activeEffect']).options.initial).toBe('');
    });

    it('shapes an acquisition roll as characteristic / formula / direction', () => {
        const roll = record(collection(gift.fields['characteristicRolls']).element);
        expect(Object.keys(roll.fields).sort()).toEqual(['characteristic', 'direction', 'formula']);
        expect(leaf(roll.fields['direction']).options.choices).toEqual([...GIFT_ROLL_DIRECTIONS]);
    });
});
