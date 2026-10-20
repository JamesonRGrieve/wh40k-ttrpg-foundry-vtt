import { afterAll, describe, expect, it } from 'vitest';
import { installFoundryDataStub, LeafField, SchemaRecord } from '../../testing/foundry-data-stub.ts';

/**
 * OriginPathData schema (#160): the Only War Regiment Creation Points field, and
 * the Regiment Creation and Dark Heresy 1e steps the compendium content is
 * authored on. A step outside `choices` fails validation, so a Regimental
 * Drawback could not load as a document.
 */

afterAll(installFoundryDataStub());

const { default: OriginPathData } = await import('./origin-path.ts');

const schema = OriginPathData.defineSchema();

function leaf(name: string): LeafField {
    const field = Object.entries(schema).find(([key]) => key === name)?.[1];
    if (!(field instanceof LeafField)) throw new Error(`no leaf field ${name}`);
    return field;
}

function record(name: string): SchemaRecord {
    const field = Object.entries(schema).find(([key]) => key === name)?.[1];
    if (!(field instanceof SchemaRecord)) throw new Error(`no schema field ${name}`);
    return field;
}

describe('OriginPathData.regimentPoints (#160)', () => {
    it('is an optional, nullable whole number of points, unset by default', () => {
        expect(leaf('regimentPoints').options).toEqual({ required: false, nullable: true, initial: null, min: 0, integer: true });
    });
});

describe('OriginPathData.grantsPsychicPowers (#681)', () => {
    it('is a required flag, off by default, so only an authored origin unlocks psychic powers', () => {
        expect(leaf('grantsPsychicPowers').options).toEqual({ required: true, initial: false });
    });
});

describe('OriginPathData.stepIndex (#688)', () => {
    it('has no upper bound, so a DH1 career-path origin’s index of 9 validates', () => {
        // The field is a whole number from 0 with no `max`: 9 (and any later line's step) is in range.
        expect(leaf('stepIndex').options).toEqual({ required: true, initial: 0, min: 0, integer: true });
    });
});

describe('OriginPathData.grants (#688)', () => {
    it('has no flat wounds grant: an origin’s wound bonus lives only in modifiers.resources.wounds', () => {
        const grants = record('grants');
        expect({ wounds: 'wounds' in grants.fields, woundsFormula: 'woundsFormula' in grants.fields }).toEqual({ wounds: false, woundsFormula: true });
    });
});

describe('OriginPathData.step', () => {
    it('accepts every step the Only War Regiment Creation content is authored on', () => {
        expect(leaf('step').options.choices).toEqual(
            expect.arrayContaining(['regimentType', 'commandingOfficer', 'trainingDoctrine', 'specialEquipmentDoctrine', 'regimentalDrawback']),
        );
    });

    it('accepts the Dark Heresy 1e career path step', () => {
        expect(leaf('step').options.choices).toContain('careerPath');
    });
});
