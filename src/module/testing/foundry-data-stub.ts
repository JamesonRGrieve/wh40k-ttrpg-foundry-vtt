/**
 * A recording stand-in for Foundry's `foundry.abstract` / `foundry.data.fields`,
 * for unit tests that load a DataModel module outside Foundry. A model module
 * builds its classes and schema from those globals at load, so the stub is
 * installed BEFORE the model's dynamic import. Each stub field records the options
 * (and, for containers, the inner fields) it was built with, so a test can walk
 * the schema `defineSchema()` returns, and a getter can be read off the prototype.
 *
 * Usage (top level of a test file):
 *   const restore = installFoundryDataStub();
 *   afterAll(restore);
 *   const { default: OrderData } = await import('./order.ts');
 */

type AnyCtor = abstract new (...args: never[]) => object;

/** The construction options a schema contract asserts. */
export interface FieldOptions {
    initial?: string | number | boolean | readonly string[] | Readonly<Record<string, number>> | null;
    choices?: readonly string[];
    blank?: boolean;
    required?: boolean;
}

/** A leaf field (StringField, NumberField, ObjectField, …): records its options. */
export class LeafField {
    readonly options: FieldOptions;
    constructor(options: FieldOptions = {}) {
        this.options = options;
    }
}

/** A collection field (ArrayField, SetField): records its element field and options. */
export class ElementField {
    readonly element: object;
    readonly options: FieldOptions;
    constructor(element: object, options: FieldOptions = {}) {
        this.element = element;
        this.options = options;
    }
}

/** A SchemaField: records its sub-fields. */
export class SchemaRecord {
    readonly fields: Record<string, object>;
    constructor(fields: Record<string, object>) {
        this.fields = fields;
    }
}

const STUB_FIELDS: Record<string, AnyCtor> = { ArrayField: ElementField, SetField: ElementField, SchemaField: SchemaRecord };

interface FoundryStub {
    abstract: { DataModel: AnyCtor; TypeDataModel: AnyCtor };
    data: { fields: Record<string, AnyCtor> };
    utils: { mergeObject: <T extends object>(original: T, other: object) => T };
}

interface GlobalShim {
    foundry?: FoundryStub | undefined;
}

/** Install the stub on `globalThis.foundry`; returns the function that restores what was there. */
export function installFoundryDataStub(): () => void {
    const g = globalThis as GlobalShim;
    const original = g.foundry;
    g.foundry = {
        abstract: { DataModel: class {}, TypeDataModel: class {} },
        data: { fields: new Proxy<Record<string, AnyCtor>>({}, { get: (_target, name: string): AnyCtor => STUB_FIELDS[name] ?? LeafField }) },
        utils: { mergeObject: <T extends object>(base: T, other: object): T => ({ ...base, ...other }) },
    };
    return (): void => {
        g.foundry = original;
    };
}
