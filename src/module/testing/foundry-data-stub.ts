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

/**
 * Every stub field: the Foundry field class it stands for (`kind`, e.g. "NumberField")
 * and the arguments it was constructed with, so a test can assert either.
 */
export class StubField {
    readonly kind: string = 'DataField';
    readonly args: readonly object[];
    constructor(args: readonly object[]) {
        this.args = args;
    }

    /** Constructor argument `index`; throws when the field was built without it. */
    arg(index: number): object {
        const value = this.args.at(index);
        if (value === undefined) throw new Error(`${this.kind} has no constructor argument ${index}`);
        return value;
    }
}

/** A leaf field (StringField, NumberField, ObjectField, …): records its options. */
export class LeafField extends StubField {
    readonly options: FieldOptions;
    constructor(options?: FieldOptions, ...rest: object[]) {
        super(options === undefined ? rest : [options, ...rest]);
        this.options = options ?? {};
    }
}

/** An ObjectField: a leaf whose value is a free-form object, so any key beneath it is a valid path. */
class ObjectLeaf extends LeafField {}

/** A collection field (ArrayField, SetField): records its element field and options. */
export class ElementField extends StubField {
    readonly element: object;
    readonly options: FieldOptions;
    constructor(element: object, options?: FieldOptions) {
        super(options === undefined ? [element] : [element, options]);
        this.element = element;
        this.options = options ?? {};
    }
}

/** A SchemaField: records its sub-fields and options. */
export class SchemaRecord extends StubField {
    readonly fields: Record<string, object>;
    readonly options: FieldOptions;
    constructor(fields: Record<string, object>, options?: FieldOptions) {
        super(options === undefined ? [fields] : [fields, options]);
        this.fields = fields;
        this.options = options ?? {};
    }
}

const NAMED_FIELDS = new Map<string, AnyCtor>();

/** The stub class standing for `foundry.data.fields[name]`, its instances tagged with that name. */
function stubFieldClass(name: string): AnyCtor {
    const cached = NAMED_FIELDS.get(name);
    if (cached !== undefined) return cached;
    let named: AnyCtor;
    if (name === 'ArrayField' || name === 'SetField') {
        named = class extends ElementField {
            override readonly kind = name;
        };
    } else if (name === 'SchemaField') {
        named = class extends SchemaRecord {
            override readonly kind = name;
        };
    } else if (name === 'ObjectField') {
        named = class extends ObjectLeaf {
            override readonly kind = name;
        };
    } else {
        named = class extends LeafField {
            override readonly kind = name;
        };
    }
    NAMED_FIELDS.set(name, named);
    return named;
}

/** A SchemaField's sub-field by key, or undefined when it declares none. */
export function subField(record: SchemaRecord, key: string): object | undefined {
    return Object.entries(record.fields).find(([name]) => name === key)?.[1];
}

/** Stands in for a Handlebars expression in a path. */
const TEMPLATED = '\u0000';

/**
 * Whether a form input `name` (a dotted path below `system.`) names a field of the
 * schema. A `{{…}}` segment is a Handlebars index: under a collection it stands for
 * any element; under a SchemaField it must stand for one of `keys`, all of which the
 * SchemaField must declare. Any path continues below an ObjectField.
 */
export function schemaHasPath(fields: Record<string, object>, path: string, keys: readonly string[]): boolean {
    let field: object = new SchemaRecord(fields);
    // A `{{char.key}}` segment holds a dot of its own, so split around the Handlebars expressions.
    for (const segment of path.replace(/\{\{[^}]*\}\}/g, TEMPLATED).split('.')) {
        if (field instanceof ObjectLeaf) return true;
        const templated = segment === TEMPLATED;
        if (field instanceof ElementField && (templated || /^\d+$/.test(segment))) {
            field = field.element;
        } else if (field instanceof SchemaRecord && templated) {
            const record = field;
            const children = keys.map((key) => subField(record, key));
            const [first] = children;
            if (first === undefined || children.includes(undefined)) return false;
            // The keyed children share one shape, so the rest of the path is checked on the first.
            field = first;
        } else if (field instanceof SchemaRecord) {
            const child = subField(field, segment);
            if (child === undefined) return false;
            field = child;
        } else {
            return false;
        }
    }
    return true;
}

/** A value `getProperty` walks: a plain JSON-shaped tree. */
type PropertyValue = string | number | boolean | null | undefined | PropertyTree;
interface PropertyTree {
    readonly [key: string]: PropertyValue;
}

/** `foundry.utils.getProperty`: the value at a dotted path, or undefined. */
function readProperty(object: PropertyTree, path: string): PropertyValue {
    let cursor: PropertyValue = object;
    for (const key of path.split('.')) {
        if (typeof cursor !== 'object' || cursor === null) return undefined;
        cursor = cursor[key];
    }
    return cursor;
}

/**
 * Stands in for Foundry's DataModel base. `shimData` returns the source it was
 * given, as Foundry's does once its own shims have run.
 */
class StubDataModel {
    static shimData<T extends object>(data: T): T {
        return data;
    }
}

/** Stands in for Foundry's TypeDataModel, a DataModel. */
class StubTypeDataModel extends StubDataModel {}

/** What a suite adds to the stub: Foundry's application API, or more `foundry.utils` functions. */
export interface FoundryStubExtras {
    applications?: object;
    utils?: object;
}

interface FoundryStub {
    abstract: { DataModel: AnyCtor; TypeDataModel: AnyCtor };
    data: { fields: Record<string, AnyCtor> };
    utils: object;
    applications?: object;
}

interface GlobalShim {
    foundry?: FoundryStub | undefined;
}

/**
 * Install the stub on `globalThis.foundry`, with any `extras` a suite needs beside
 * the data layer; returns the function that restores what was there.
 */
export function installFoundryDataStub(extras: FoundryStubExtras = {}): () => void {
    const g = globalThis as GlobalShim;
    const original = g.foundry;
    g.foundry = {
        abstract: { DataModel: StubDataModel, TypeDataModel: StubTypeDataModel },
        data: { fields: new Proxy<Record<string, AnyCtor>>({}, { get: (_target, name: string): AnyCtor => stubFieldClass(name) }) },
        utils: { mergeObject: <T extends object>(base: T, other: object): T => ({ ...base, ...other }), getProperty: readProperty, ...extras.utils },
        ...(extras.applications === undefined ? {} : { applications: extras.applications }),
    };
    return (): void => {
        g.foundry = original;
    };
}
