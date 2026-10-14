/**
 * Unit tests for the grenade `rider` schema field (#135).
 *
 * `grenadeRiderField` defers all `foundry.data.fields` access until called, so it is
 * driven here with a stub that records each field's constructor options. The point:
 * a weapon without a rider persists `null` (nullable, null default), the enums come
 * from the rules layer, and the effect cannot be blank.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RIDER_AFFECTS, RIDER_AREA_MEASURES, RIDER_DURATION_KINDS, RIDER_TEST_CHARACTERISTICS } from '../../rules/grenade-rider.ts';

/** The options a stub field was constructed with. */
interface StubOptions {
    required?: boolean;
    nullable?: boolean;
    blank?: boolean;
    initial?: string | number | null;
    choices?: string[];
    min?: number;
    integer?: boolean;
}

class StubField {
    constructor(public readonly options: StubOptions = {}) {}
}
class StringFieldStub extends StubField {}
class NumberFieldStub extends StubField {}
class SchemaFieldStub extends StubField {
    constructor(public readonly fields: Record<string, StubField>, options: StubOptions = {}) {
        super(options);
    }
}

/** Narrow a schema entry to the stub class it was built from, failing loudly otherwise. */
function expectStub<T extends object>(value: object | undefined, ctor: new (...args: never[]) => T): T {
    if (!(value instanceof ctor)) throw new Error(`expected a ${ctor.name}`);
    return value;
}

describe('grenadeRiderField', () => {
    beforeEach(() => {
        vi.stubGlobal('foundry', { data: { fields: { StringField: StringFieldStub, NumberField: NumberFieldStub, SchemaField: SchemaFieldStub } } });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    async function loadField(): Promise<SchemaFieldStub> {
        const { grenadeRiderField } = await import('./grenade-rider-field.ts');
        return expectStub(grenadeRiderField(), SchemaFieldStub);
    }

    it('is an optional nullable block that defaults to no rider', async () => {
        const field = await loadField();
        expect(field.options).toMatchObject({ required: false, nullable: true, initial: null });
        expect(Object.keys(field.fields)).toEqual(['test', 'affects', 'condition', 'area', 'duration', 'effectRollShift', 'effect']);
    });

    it('offers no test or any non-Influence characteristic, with integer modifiers for everyone and for a psyker', async () => {
        const test = expectStub((await loadField()).fields['test'], SchemaFieldStub);
        const characteristic = expectStub(test.fields['characteristic'], StringFieldStub);
        expect(characteristic.options.choices).toEqual(['', ...RIDER_TEST_CHARACTERISTICS]);
        expect(characteristic.options.initial).toBe('');
        expect(expectStub(test.fields['modifier'], NumberFieldStub).options).toMatchObject({ integer: true, initial: 0 });
        expect(expectStub(test.fields['psykerModifier'], NumberFieldStub).options).toMatchObject({ integer: true, initial: 0 });
    });

    it('touches everyone by default, and applies no condition unless one is authored (#623)', async () => {
        const field = await loadField();
        expect(expectStub(field.fields['affects'], StringFieldStub).options).toMatchObject({ blank: true, initial: '', choices: [...RIDER_AFFECTS] });
        // The condition is a registry id read at resolution time; the registry is loaded from the packs, so no fixed choices.
        expect(expectStub(field.fields['condition'], StringFieldStub).options).toMatchObject({ blank: true, initial: '' });
        expect(expectStub(field.fields['condition'], StringFieldStub).options.choices).toBeUndefined();
    });

    it('draws the area measure and duration kind from the rules layer', async () => {
        const field = await loadField();
        const area = expectStub(field.fields['area'], SchemaFieldStub);
        expect(expectStub(area.fields['measure'], StringFieldStub).options.choices).toEqual([...RIDER_AREA_MEASURES]);
        const duration = expectStub(field.fields['duration'], SchemaFieldStub);
        expect(expectStub(duration.fields['kind'], StringFieldStub).options.choices).toEqual([...RIDER_DURATION_KINDS]);
        expect(expectStub(duration.fields['base'], NumberFieldStub).options).toMatchObject({ min: 0, integer: true });
    });

    it('keeps the effect-roll step non-negative and the effect non-blank', async () => {
        const field = await loadField();
        const shift = expectStub(field.fields['effectRollShift'], SchemaFieldStub);
        expect(expectStub(shift.fields['perDegree'], NumberFieldStub).options).toMatchObject({ min: 0, integer: true, initial: 0 });
        expect(expectStub(shift.fields['max'], NumberFieldStub).options).toMatchObject({ min: 0, integer: true, initial: 0 });
        expect(expectStub(field.fields['effect'], StringFieldStub).options).toMatchObject({ required: true, blank: false });
    });
});
