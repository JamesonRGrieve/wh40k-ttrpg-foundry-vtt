/**
 * Unit tests for a condition's `visual` schema field (#595).
 *
 * `statusVisualField` defers all `foundry.data.fields` access until called, so it is
 * driven here with a stub that records each field's constructor options. The point:
 * every part defaults to "nothing", so a condition without a visual shows none; the
 * presets, filters, sound events and intensity ceiling come from the rules layer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STATUS_INTENSITY_CEILING, STATUS_SOUND_EVENTS, STATUS_VISUAL_FILTERS, STATUS_VISUAL_PRESETS } from '../../rules/status-visual.ts';

/** The options a stub field was constructed with. */
interface StubOptions {
    required?: boolean;
    blank?: boolean;
    initial?: string | number | never[];
    choices?: string[];
    min?: number;
    max?: number;
}

class StubField {
    constructor(public readonly options: StubOptions = {}) {}
}
class StringFieldStub extends StubField {}
class NumberFieldStub extends StubField {}
class ArrayFieldStub extends StubField {
    constructor(public readonly element: StubField, options: StubOptions = {}) {
        super(options);
    }
}
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

describe('statusVisualField (#595)', () => {
    beforeEach(() => {
        vi.stubGlobal('foundry', {
            data: { fields: { StringField: StringFieldStub, NumberField: NumberFieldStub, ArrayField: ArrayFieldStub, SchemaField: SchemaFieldStub } },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    async function loadField(): Promise<SchemaFieldStub> {
        const { statusVisualField } = await import('./status-visual-field.ts');
        return expectStub(statusVisualField(), SchemaFieldStub);
    }

    it('is optional, and every part defaults to no visual', async () => {
        const field = await loadField();
        expect(field.options.required).toBe(false);
        expect(Object.keys(field.fields)).toEqual(['preset', 'tint', 'filter', 'overlay', 'intensity', 'sounds']);
        for (const key of ['preset', 'tint', 'filter', 'overlay']) {
            expect(expectStub(field.fields[key], StringFieldStub).options).toMatchObject({ blank: true, initial: '' });
        }
        expect(expectStub(field.fields['sounds'], ArrayFieldStub).options.initial).toEqual([]);
    });

    it('offers the rules layer\'s presets and filters, each with "none"', async () => {
        const { fields } = await loadField();
        expect(expectStub(fields['preset'], StringFieldStub).options.choices).toEqual(['', ...STATUS_VISUAL_PRESETS]);
        expect(expectStub(fields['filter'], StringFieldStub).options.choices).toEqual(['', ...STATUS_VISUAL_FILTERS]);
    });

    it('scales intensity per stack from 0, capped at the rules ceiling', async () => {
        const intensity = expectStub((await loadField()).fields['intensity'], SchemaFieldStub);
        expect(expectStub(intensity.fields['perStack'], NumberFieldStub).options).toMatchObject({ initial: 0, min: 0 });
        expect(expectStub(intensity.fields['max'], NumberFieldStub).options).toMatchObject({ initial: 1, min: 1, max: STATUS_INTENSITY_CEILING });
    });

    it("plays sounds only on the rules layer's apply / remove events", async () => {
        const sounds = expectStub((await loadField()).fields['sounds'], ArrayFieldStub);
        const entry = expectStub(sounds.element, SchemaFieldStub);
        expect(expectStub(entry.fields['event'], StringFieldStub).options.choices).toEqual([...STATUS_SOUND_EVENTS]);
        expect(expectStub(entry.fields['src'], StringFieldStub).options).toMatchObject({ blank: false });
    });
});
