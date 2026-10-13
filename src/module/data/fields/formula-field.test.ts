import { afterAll, describe, expect, it } from 'vitest';

/**
 * FormulaField extends `foundry.data.fields.StringField` at definition time, so the
 * Foundry globals it touches are stubbed BEFORE a dynamic import (a static import
 * would hoist above the stub). `Roll` is stubbed as a parser that knows the formulas
 * these cases use and rejects anything else as an unresolved term, which is what
 * Foundry's parser does with the books' "no damage" dash.
 */
type AnyCtor = abstract new (...args: never[]) => object;

interface FoundryShim {
    foundry?: { data: { fields: { StringField: AnyCtor } }; utils: { mergeObject: (a: object, b: object) => object } } | undefined;
    Roll?: AnyCtor | undefined;
}

class StringFieldStub {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors Foundry's DataField static `_defaults`
    static get _defaults(): object {
        return {};
    }
}

/** The formulas the stub parser knows, mapped to whether each is deterministic. */
const PARSEABLE: ReadonlyMap<string, boolean> = new Map([
    ['1d10+3', false],
    ['2d10', false],
    ['4+2', true],
]);

function unresolvedTerm(formula: string): never {
    throw new Error(`Unresolved term in ${formula}`);
}

class RollStub {
    readonly isDeterministic: boolean;

    constructor(formula: string) {
        this.isDeterministic = PARSEABLE.get(formula) ?? unresolvedTerm(formula);
    }
}

const G = globalThis as FoundryShim;
const ORIGINAL = { foundry: G.foundry, Roll: G.Roll };
G.foundry = { data: { fields: { StringField: StringFieldStub } }, utils: { mergeObject: (a, b) => ({ ...a, ...b }) } };
G.Roll = RollStub;
afterAll(() => {
    G.foundry = ORIGINAL.foundry;
    G.Roll = ORIGINAL.Roll;
});

const { default: FormulaField } = await import('./formula-field.ts');

function field(deterministic = false): InstanceType<typeof FormulaField> {
    const instance = Object.create(FormulaField.prototype) as InstanceType<typeof FormulaField>;
    instance.deterministic = deterministic;
    return instance;
}

describe('FormulaField._validateType', () => {
    it('accepts a dice formula', () => {
        expect(() => field()._validateType('1d10+3')).not.toThrow();
    });

    it('accepts an empty formula without parsing it (a no-damage profile stores "", #601)', () => {
        expect(() => field(true)._validateType('')).not.toThrow();
    });

    it.each(['-', '—'])('rejects the books\' %j "no damage" notation, which must be migrated to damage.none', (dash) => {
        expect(() => field()._validateType(dash)).toThrow(`Invalid formula: ${dash}`);
    });

    it('rejects dice where a deterministic formula is required', () => {
        expect(() => field(true)._validateType('2d10')).toThrow('Invalid formula: 2d10');
        expect(() => field(true)._validateType('4+2')).not.toThrow();
    });
});
