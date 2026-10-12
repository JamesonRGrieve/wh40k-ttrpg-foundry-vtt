/**
 * Unit tests for the `specialAbility` Distinction / Renown schema fragment (#171).
 *
 * `specialAbilityDistinctionSchema` defers all `foundry.data.fields` access until
 * called, so it is driven here with a stub that records each field's constructor
 * options. The point of the suite: every new field is optional with a default
 * (so pre-existing special abilities load unchanged), the `choices` come from the
 * rules-layer constants, and the shared simple-effect fragment (which malignancy
 * also uses) never gains these fields.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The options a stub field was constructed with. */
interface StubOptions {
    required?: boolean;
    nullable?: boolean;
    blank?: boolean;
    initial?: string | number | null | never[];
    choices?: string[];
    min?: number;
    integer?: boolean;
}

class StubField {
    constructor(public readonly options: StubOptions = {}) {}
}
class StringFieldStub extends StubField {}
class NumberFieldStub extends StubField {}
class HTMLFieldStub extends StubField {}
class ArrayFieldStub extends StubField {
    constructor(public readonly element: StubField, options: StubOptions) {
        super(options);
    }
}
class SchemaFieldStub {
    constructor(public readonly fields: Record<string, StubField>) {}
}

describe('specialAbilityDistinctionSchema', () => {
    beforeEach(() => {
        vi.stubGlobal('foundry', {
            data: {
                fields: {
                    StringField: StringFieldStub,
                    NumberField: NumberFieldStub,
                    HTMLField: HTMLFieldStub,
                    ArrayField: ArrayFieldStub,
                    SchemaField: SchemaFieldStub,
                },
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    async function loadSchema(): Promise<Record<string, object>> {
        const { specialAbilityDistinctionSchema } = await import('./special-ability-fields.ts');
        return specialAbilityDistinctionSchema();
    }

    /** Narrow a schema entry to the stub class it was built from, failing loudly otherwise. */
    function expectStub<T extends object>(value: object | undefined, ctor: new (...args: never[]) => T): T {
        if (!(value instanceof ctor)) throw new Error(`expected a ${ctor.name}`);
        return value;
    }

    it('declares exactly the Distinction / Renown fields', async () => {
        const schema = await loadSchema();
        expect(Object.keys(schema)).toEqual(['category', 'renownRequired', 'renownReward', 'cost', 'marks', 'grant']);
    });

    it('defaults category to speciality so existing special abilities load unchanged', async () => {
        const schema = await loadSchema();
        const category = expectStub(schema['category'], StringFieldStub);
        expect(category.options.initial).toBe('speciality');
        expect(category.options.choices).toEqual(['speciality', 'advanced', 'distinction', 'mark']);
    });

    it('makes renownRequired an optional nullable Renown rank', async () => {
        const schema = await loadSchema();
        const rank = expectStub(schema['renownRequired'], StringFieldStub);
        expect(rank.options).toMatchObject({ required: false, nullable: true, initial: null });
        expect(rank.options.choices).toEqual(['initiated', 'respected', 'distinguished', 'famed', 'hero']);
    });

    it('makes renownReward and cost non-negative integers defaulting to 0', async () => {
        const schema = await loadSchema();
        for (const key of ['renownReward', 'cost']) {
            expect(expectStub(schema[key], NumberFieldStub).options).toMatchObject({ initial: 0, min: 0, integer: true, nullable: false });
        }
    });

    it('defaults marks to an empty UUID list', async () => {
        const schema = await loadSchema();
        const marks = expectStub(schema['marks'], ArrayFieldStub);
        expect(marks.options.initial).toEqual([]);
        expect(marks.element).toBeInstanceOf(StringFieldStub);
    });

    it('defaults the grant trait and Active Effect id to blank', async () => {
        const schema = await loadSchema();
        const { trait, activeEffect } = expectStub(schema['grant'], SchemaFieldStub).fields;
        expect(expectStub(trait, StringFieldStub).options).toMatchObject({ blank: true, initial: '' });
        expect(expectStub(activeEffect, StringFieldStub).options).toMatchObject({ blank: true, initial: '' });
    });

    it('does not leak into the shared simple-effect fragment malignancy uses', async () => {
        const { simpleEffectItemSchema } = await import('../shared/simple-effect-item.ts');
        const malignancy = simpleEffectItemSchema('effect');
        const schema = await loadSchema();
        for (const key of Object.keys(schema)) {
            expect(malignancy).not.toHaveProperty(key);
        }
    });
});
