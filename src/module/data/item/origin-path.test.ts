import { afterAll, describe, expect, it } from 'vitest';
import { installFoundryDataStub, LeafField } from '../../testing/foundry-data-stub.ts';

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

describe('OriginPathData.regimentPoints (#160)', () => {
    it('is an optional, nullable whole number of points, unset by default', () => {
        expect(leaf('regimentPoints').options).toEqual({ required: false, nullable: true, initial: null, min: 0, integer: true });
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
