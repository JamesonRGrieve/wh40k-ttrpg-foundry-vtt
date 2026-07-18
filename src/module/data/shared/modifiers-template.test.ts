import { afterAll, describe, expect, it } from 'vitest';
// Type-only import (erased at runtime, so it does not evaluate the module before the stub is installed).
import type { DynamicModifierEntry } from './modifiers-template.ts';

/**
 * Characterization of `ModifiersTemplate.defineSchema()`'s situational channels.
 *
 * `situational.characteristics`, `situational.skills`, and `situational.combat`
 * were three byte-identical copies of the same conditional-entry sub-schema;
 * #427 collapses them into the module-local `situationalEntrySchema()` factory.
 * This test pins the emitted shape so the DRY collapse is proven
 * behaviour-preserving: all three channels must still produce an identical
 * `ArrayField` of `{ key, value, condition, icon }` entries, with the
 * `fa-exclamation-triangle` icon default and the `{ required, initial }` options
 * intact. A dropped field, a changed default, or divergence between the three
 * channels fails here.
 *
 * `ModifiersTemplate` extends `SystemDataModel` (→ `foundry.abstract.TypeDataModel`)
 * and `defineSchema()` constructs `foundry.data.fields.*` instances at call time,
 * so a recording stub of those globals is installed BEFORE the dynamic import
 * (a static import would evaluate the module chain before the stub is in place).
 * Each field ctor records its `kind` and constructor `args`, letting us walk the
 * schema tree without a live Foundry runtime.
 */

/** A recording stand-in for a `foundry.data.fields.*` instance. */
class RecordingField {
    readonly _kind: string;
    /** The exact constructor arguments (every field arg is an object). */
    readonly _args: readonly object[];
    constructor(kind: string, args: readonly object[]) {
        this._kind = kind;
        this._args = args;
    }

    /** Positional constructor argument `i`, which the stub guarantees is present. */
    arg(i: number): object {
        const a = this._args[i];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) sees `object`, tsconfig.json (flag on) sees `object | undefined` and requires this guard.
        if (a === undefined) throw new Error(`missing arg ${i} on ${this._kind}`);
        return a;
    }
}

/** The `{ fieldName: DataField }` map a `SchemaField` is constructed from. */
interface FieldMap {
    readonly [key: string]: RecordingField;
}

// Concrete ctor for the recording classes; broad abstract ctor for the stub slot
// (the real `foundry.data.fields` exposes `DataField` as an abstract ctor, and
// `foundry.abstract.*` are abstract, so the slots must admit abstract ctors).
type FieldCtor = new (...args: object[]) => RecordingField;
type AnyCtor = abstract new (...args: never[]) => object;

/** Build a recording field class that tags its instances with `kind`. */
function makeField(kind: string): FieldCtor {
    return class extends RecordingField {
        constructor(...args: object[]) {
            super(kind, args);
        }
    };
}

const fields = {
    ArrayField: makeField('ArrayField'),
    ObjectField: makeField('ObjectField'),
    NumberField: makeField('NumberField'),
    SchemaField: makeField('SchemaField'),
    StringField: makeField('StringField'),
    BooleanField: makeField('BooleanField'),
};

interface FoundryStub {
    abstract: { DataModel: AnyCtor; TypeDataModel: AnyCtor };
    data: { fields: Record<string, AnyCtor> };
}
interface GlobalShim {
    foundry?: FoundryStub | undefined;
}
const G = globalThis as GlobalShim;
const ORIGINAL_FOUNDRY = G.foundry;
G.foundry = {
    abstract: { DataModel: class {}, TypeDataModel: class {} },
    data: { fields },
};

afterAll(() => {
    G.foundry = ORIGINAL_FOUNDRY;
});

// Imported after the stub is in place (the module evaluates `foundry.*` at load).
const modifiersModule = await import('./modifiers-template.ts');
const { default: ModifiersTemplate } = modifiersModule;
const {
    DYNAMIC_MODIFIER_TARGETS,
    DYNAMIC_MODIFIER_MODES,
    DYNAMIC_MODIFIER_SIDES,
    DYNAMIC_SCALE_SOURCES,
    DYNAMIC_SCALE_FIELDS,
    DYNAMIC_SCALE_ROUNDING,
    DYNAMIC_SCALE_MULTIPLIERS,
    DYNAMIC_MODIFIER_WHEN,
    DYNAMIC_DURATION_UNITS,
    DYNAMIC_DURATION_UPKEEP,
    DYNAMIC_DURATION_STACKING,
} = modifiersModule;

/** Narrow a schema slot to the recording-field the stub guarantees it is. */
function field(x: object): RecordingField {
    return x as RecordingField;
}

/** A named sub-field of a `SchemaField`. */
function subField(schemaField: RecordingField, key: string): RecordingField {
    const map = schemaField.arg(0) as FieldMap;
    const child = map[key];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) sees `RecordingField`, tsconfig.json (flag on) sees `RecordingField | undefined` and requires this guard.
    if (child === undefined) throw new Error(`missing field: ${key}`);
    return child;
}

/** A JSON-able description of a recorded field tree, for structural equality. */
interface Descriptor {
    readonly kind: string;
    readonly options?: object;
    readonly element?: Descriptor;
    readonly fields?: Readonly<Record<string, Descriptor>>;
}

function describeField(f: RecordingField): Descriptor {
    if (f._kind === 'ArrayField') {
        return { kind: 'ArrayField', options: f.arg(1), element: describeField(field(f.arg(0))) };
    }
    if (f._kind === 'SchemaField') {
        const out: Record<string, Descriptor> = {};
        for (const key of Object.keys(f.arg(0))) {
            out[key] = describeField(subField(f, key));
        }
        return { kind: 'SchemaField', fields: out };
    }
    return { kind: f._kind, options: f.arg(0) };
}

describe('situationalEntrySchema (via ModifiersTemplate.defineSchema)', () => {
    const schema = ModifiersTemplate.defineSchema();
    const modifiersSlot = schema['modifiers'];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) sees `DataField`, tsconfig.json (flag on) sees `DataField | undefined` and requires this guard.
    if (modifiersSlot === undefined) throw new Error('schema missing modifiers field');
    const situational = subField(field(modifiersSlot), 'situational');

    const channels = ['characteristics', 'skills', 'combat'] as const;

    // The exact shape each situational channel must emit — an ArrayField of
    // conditional entries with the fa-exclamation-triangle icon default.
    const expectedEntry: Descriptor = {
        kind: 'ArrayField',
        options: { required: true, initial: [] },
        element: {
            kind: 'SchemaField',
            fields: {
                key: { kind: 'StringField', options: { required: true } },
                value: { kind: 'NumberField', options: { required: true, initial: 0 } },
                condition: { kind: 'StringField', options: { required: true } },
                icon: { kind: 'StringField', options: { required: false, initial: 'fa-exclamation-triangle' } },
                // #246/#440 test-variant scoping tag (blank = universal).
                appliesToVariant: { kind: 'StringField', options: { required: false, blank: true, initial: '' } },
            },
        },
    };

    it('exposes exactly the three situational channels', () => {
        expect(Object.keys(situational.arg(0)).sort()).toEqual(['characteristics', 'combat', 'skills']);
    });

    it.each(channels)('channel %s emits the shared conditional-entry ArrayField', (channel) => {
        expect(describeField(subField(situational, channel))).toEqual(expectedEntry);
    });

    it('produces identical shapes across all three channels (DRY factory)', () => {
        const shapes = channels.map((c) => describeField(subField(situational, c)));
        expect(shapes[1]).toEqual(shapes[0]);
        expect(shapes[2]).toEqual(shapes[0]);
    });

    it('defaults the situational-entry icon to fa-exclamation-triangle', () => {
        for (const channel of channels) {
            const entry = describeField(subField(situational, channel));
            expect(entry.kind).toBe('ArrayField');
            const element = entry.element;
            if (element === undefined) throw new Error('ArrayField descriptor missing element');
            expect(element.kind).toBe('SchemaField');
            expect(element.fields?.['icon']).toEqual({
                kind: 'StringField',
                options: { required: false, initial: 'fa-exclamation-triangle' },
            });
        }
    });
});

describe('dynamicModifiers schema (data-driven modifier hooks, Direction #7)', () => {
    const schema = ModifiersTemplate.defineSchema();
    const modifiersSlot = schema['modifiers'];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) sees `DataField`, tsconfig.json (flag on) sees `DataField | undefined`.
    if (modifiersSlot === undefined) throw new Error('schema missing modifiers field');
    const dynamic = subField(field(modifiersSlot), 'dynamicModifiers');

    it('is an ArrayField initialising to empty (legacy items carry none)', () => {
        expect(dynamic._kind).toBe('ArrayField');
        expect(dynamic.arg(1)).toEqual({ required: true, initial: [] });
    });

    /** The choices array recorded on a StringField descriptor's options bag. */
    function choicesOf(f: Descriptor | undefined): readonly string[] | undefined {
        // eslint-disable-next-line no-restricted-syntax -- test: the recorded StringField options bag carries the `choices` array we authored
        return (f?.options as { choices?: readonly string[] } | undefined)?.choices;
    }
    function entryFieldsOf(): Readonly<Record<string, Descriptor>> {
        return describeField(field(dynamic.arg(0))).fields ?? {};
    }

    it('each entry exposes the full hook surface (what / how-much / when / duration)', () => {
        const entry = describeField(field(dynamic.arg(0)));
        expect(entry.kind).toBe('SchemaField');
        expect(Object.keys(entry.fields ?? {}).sort()).toEqual(
            [
                'condition',
                'conditionValue',
                'duration',
                'formula',
                'label',
                'mode',
                'scale',
                'side',
                'target',
                'targetKey',
                'value',
                'valueFormula',
                'when',
            ].sort(),
        );
    });

    it('wires every choice vocabulary on the entry from the exported consts', () => {
        const entryFields = entryFieldsOf();
        expect(choicesOf(entryFields['target'])).toEqual([...DYNAMIC_MODIFIER_TARGETS]);
        expect(choicesOf(entryFields['mode'])).toEqual([...DYNAMIC_MODIFIER_MODES]);
        expect(choicesOf(entryFields['side'])).toEqual([...DYNAMIC_MODIFIER_SIDES]);
        expect(choicesOf(entryFields['when'])).toEqual([...DYNAMIC_MODIFIER_WHEN]);
    });

    it('wires the scale sub-schema choice vocabularies from the exported consts', () => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) vs tsconfig.strict.json (flag on).
        const scaleFields = entryFieldsOf()['scale']?.fields ?? {};
        expect(choicesOf(scaleFields['source'])).toEqual([...DYNAMIC_SCALE_SOURCES]);
        expect(choicesOf(scaleFields['field'])).toEqual([...DYNAMIC_SCALE_FIELDS]);
        expect(choicesOf(scaleFields['round'])).toEqual([...DYNAMIC_SCALE_ROUNDING]);
        expect(choicesOf(scaleFields['multiplier'])).toEqual([...DYNAMIC_SCALE_MULTIPLIERS]);
    });

    it('wires the duration sub-schema choice vocabularies from the exported consts', () => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) vs tsconfig.strict.json (flag on).
        const durationFields = entryFieldsOf()['duration']?.fields ?? {};
        expect(choicesOf(durationFields['unit'])).toEqual([...DYNAMIC_DURATION_UNITS]);
        expect(choicesOf(durationFields['upkeep'])).toEqual([...DYNAMIC_DURATION_UPKEEP]);
        expect(choicesOf(durationFields['stacking'])).toEqual([...DYNAMIC_DURATION_STACKING]);
    });

    it('carries a temporary-effect duration lifecycle with a nested crash after-effect', () => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) vs tsconfig.strict.json (flag on).
        const durationFields = entryFieldsOf()['duration']?.fields ?? {};
        expect(Object.keys(durationFields).sort()).toEqual(['aftereffect', 'save', 'stacking', 'sustained', 'unit', 'upkeep', 'value', 'valueFormula'].sort());
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) vs tsconfig.strict.json (flag on).
        expect(durationFields['aftereffect']?.kind).toBe('SchemaField');
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) vs tsconfig.strict.json (flag on).
        expect(durationFields['sustained']?.kind).toBe('BooleanField');
    });
});

describe('ModifiersTemplate.hasDynamicModifiers getter', () => {
    /** A fully-populated hook fixture (every schema field present), so no `as unknown` cast is needed. */
    const SAMPLE_HOOK: DynamicModifierEntry = {
        target: 'damage',
        targetKey: '',
        side: 'attacker',
        mode: 'add',
        value: 2,
        valueFormula: '',
        scale: { source: '', field: 'bonus', factor: 1, round: 'up', multiplier: '', min: null, max: null },
        when: 'always',
        condition: '',
        conditionValue: '',
        duration: {
            unit: 'instant',
            value: 0,
            valueFormula: '',
            sustained: false,
            upkeep: '',
            stacking: 'none',
            save: { characteristic: '', difficulty: 0 },
            aftereffect: { target: 'characteristic', targetKey: '', value: 0, valueFormula: '', durationUnit: 'instant', durationValue: 0 },
        },
        formula: '',
        label: '',
    };

    /** Build a ModifiersTemplate without the DataModel constructor and set only the field the getter reads. */
    function withDynamic(dynamicModifiers: DynamicModifierEntry[]): InstanceType<typeof ModifiersTemplate> {
        // eslint-disable-next-line no-restricted-syntax -- test: bypass the DataModel constructor to exercise one pure getter
        const inst = Object.create(ModifiersTemplate.prototype) as InstanceType<typeof ModifiersTemplate>;
        // eslint-disable-next-line no-restricted-syntax -- test: the getter reads only modifiers.dynamicModifiers; a partial modifiers object suffices
        (inst as { modifiers: { dynamicModifiers: DynamicModifierEntry[] } }).modifiers = { dynamicModifiers };
        return inst;
    }

    it('is false with no hooks and true once one is declared', () => {
        expect(withDynamic([]).hasDynamicModifiers).toBe(false);
        expect(withDynamic([SAMPLE_HOOK]).hasDynamicModifiers).toBe(true);
    });
});
