/**
 * Unit tests for the `prerequisites` schema field (#673, #675).
 *
 * `prerequisitesField` defers all `foundry.data.fields` access until called, so it is
 * driven here with a stub that records each field's constructor options. The point:
 * every key the shape in `rules/prerequisites.ts` reads is stored, each defaults to
 * "no prerequisite", and the alignment's choices come from the rules layer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREREQUISITE_ALIGNMENTS } from '../../rules/prerequisites.ts';

/** The options a stub field was constructed with. */
interface StubOptions {
    required?: boolean;
    blank?: boolean;
    initial?: string | Record<string, never> | never[];
    choices?: string[];
}

class StubField {
    constructor(public readonly options: StubOptions = {}) {}
}
class StringFieldStub extends StubField {}
class ObjectFieldStub extends StubField {}
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

describe('prerequisitesField (#673, #675)', () => {
    beforeEach(() => {
        vi.stubGlobal('foundry', {
            data: { fields: { StringField: StringFieldStub, ObjectField: ObjectFieldStub, ArrayField: ArrayFieldStub, SchemaField: SchemaFieldStub } },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    async function loadField(): Promise<SchemaFieldStub> {
        const { prerequisitesField } = await import('./prerequisites-field.ts');
        return expectStub(prerequisitesField(), SchemaFieldStub);
    }

    it('stores every key the structured shape reads', async () => {
        expect(Object.keys((await loadField()).fields)).toEqual(['text', 'characteristics', 'skills', 'talents', 'talentsAny', 'alignment', 'thresholds']);
    });

    it('defaults every gate to "no prerequisite"', async () => {
        const { fields } = await loadField();
        expect(expectStub(fields['text'], StringFieldStub).options).toMatchObject({ blank: true, initial: '' });
        expect(expectStub(fields['characteristics'], ObjectFieldStub).options.initial).toEqual({});
        expect(expectStub(fields['thresholds'], ObjectFieldStub).options.initial).toEqual({});
        for (const list of ['skills', 'talents', 'talentsAny']) {
            const field = expectStub(fields[list], ArrayFieldStub);
            expect(field.options.initial).toEqual([]);
            expect(field.element).toBeInstanceOf(StringFieldStub);
        }
    });

    it("offers the rules layer's alignments, defaulting to none", async () => {
        const alignment = expectStub((await loadField()).fields['alignment'], StringFieldStub);
        expect(alignment.options).toMatchObject({ blank: true, initial: '', choices: [...PREREQUISITE_ALIGNMENTS] });
    });
});
