import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { ShipActionOrderSystem, ShipActionOrderView } from '../../rules/ship-actions.ts';
import { HAS_PRIVATE_CONTENT } from '../../testing/private-content.ts';
import { readRepoFile } from '../../testing/repo-file.ts';

/**
 * OrderData schema contract and the voidcraft Extended / Manoeuvre Action lists
 * (#186). The lists were always empty: the sheet read flags (`shipAction`,
 * `manoeuvreAction`, flat `skill`) that the schema never declared, so Foundry
 * stripped them on load. These tests clean the REAL pack documents through the
 * real schema and assert both lists come out full.
 *
 * `order.ts` evaluates `foundry.abstract` / `foundry.data.fields` at module load,
 * so a recording stub is installed BEFORE the dynamic import (the mutation.test.ts
 * recipe). Each stub field records its options so the schema can be walked.
 */

type AnyCtor = abstract new (...args: never[]) => object;

interface FieldOptions {
    initial?: string | number | boolean | readonly string[] | null;
    choices?: readonly string[];
}

/** A leaf field: records its options. */
class LeafField {
    readonly options: FieldOptions;
    constructor(options: FieldOptions = {}) {
        this.options = options;
    }
}
/** A collection field: records its element field and options. */
class ElementField {
    readonly element: object;
    readonly options: FieldOptions;
    constructor(element: object, options: FieldOptions = {}) {
        this.element = element;
        this.options = options;
    }
}
/** A SchemaField: records its sub-fields. */
class SchemaRecord {
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
const G = globalThis as GlobalShim;
const ORIGINAL_FOUNDRY = G.foundry;
G.foundry = {
    abstract: { DataModel: class {}, TypeDataModel: class {} },
    data: { fields: new Proxy<Record<string, AnyCtor>>({}, { get: (_target, name: string): AnyCtor => STUB_FIELDS[name] ?? LeafField }) },
    utils: { mergeObject: <T extends object>(original: T, other: object): T => ({ ...original, ...other }) },
};

afterAll(() => {
    G.foundry = ORIGINAL_FOUNDRY;
});

const { default: OrderData } = await import('./order.ts');
const { migrateLegacyOrderTest, ORDER_ACTION_TYPES, shipActionRows } = await import('../../rules/ship-actions.ts');
const { materializeItemVariants } = await import('../../utils/item-variant-utils.ts');

const schema = OrderData.defineSchema();

function leaf(value: object | undefined): LeafField {
    if (!(value instanceof LeafField)) throw new Error('expected a leaf field');
    return value;
}

/** A parsed JSON value. */
type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonObject;
interface JsonObject {
    [key: string]: JsonValue | undefined;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
    return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

/**
 * What Foundry's cleaner leaves of a source payload: only the keys the schema
 * declares (recursing into SchemaFields), with a declared-but-absent leaf taking
 * its `initial`. Mirrors the strip that emptied the lists.
 */
function cleanToSchema(fields: Record<string, object>, source: JsonObject): JsonObject {
    const out: JsonObject = {};
    for (const [key, field] of Object.entries(fields)) {
        const value = source[key];
        if (field instanceof SchemaRecord) {
            out[key] = cleanToSchema(field.fields, isJsonObject(value) ? value : {});
        } else if (value !== undefined) {
            out[key] = value;
        } else if (field instanceof LeafField || field instanceof ElementField) {
            out[key] = field.options.initial;
        }
    }
    return out;
}

function text(object: JsonObject, key: string): string {
    const value = object[key];
    if (typeof value !== 'string') throw new Error(`expected "${key}" to be a string after cleaning`);
    return value;
}

function child(object: JsonObject, key: string): JsonObject {
    const value = object[key];
    if (!isJsonObject(value)) throw new Error(`expected "${key}" to be an object after cleaning`);
    return value;
}

/** Read the cleaned system through the fields a row needs, failing on a wrong shape. */
function orderSystem(cleaned: JsonObject): ShipActionOrderSystem {
    const test = child(cleaned, 'test');
    const modifier = test['modifier'];
    if (typeof modifier !== 'number') throw new Error('expected test.modifier to be a number after cleaning');
    return {
        actionType: text(cleaned, 'actionType'),
        // `characteristic` has no initial: absent stays absent, as Foundry leaves it.
        test: { skill: text(test, 'skill'), characteristic: test['characteristic'] === undefined ? '' : text(test, 'characteristic'), modifier },
        duration: text(cleaned, 'duration'),
        requirements: text(cleaned, 'requirements'),
        typeAndAction: text(cleaned, 'typeAndAction'),
        description: { value: text(child(cleaned, 'description'), 'value') },
    };
}

const PACK_DIRS = [
    'src/packs-private/rogue-trader/rt-core-items-ship-orders/_source',
    'src/packs-private/homebrew-generic/hb-rt-items-ship-orders/_source',
    'src/packs-private/homebrew-gw-copyright/hb-rt-items-ship-orders-gw-copyright/_source',
];

/** Load a pack document as the RT voidcraft sheet sees it after load. */
function loadOrder(dir: string, file: string): ShipActionOrderView {
    const doc = JSON.parse(readRepoFile(`${dir}/${file}`)) as JsonObject;
    if ('reference' in doc) throw new Error(`${file}: RT ship orders must be standalone documents, not cross-line reference stubs`);
    const system = child(doc, 'system');
    materializeItemVariants(system, 'rt');
    migrateLegacyOrderTest(system);
    const id = text(doc, '_id');
    return {
        uuid: `Compendium.wh40k-rpg.pack.Item.${id}`,
        id,
        name: text(doc, 'name'),
        img: text(doc, 'img'),
        system: orderSystem(cleanToSchema(schema, system)),
    };
}

function loadAll(): ShipActionOrderView[] {
    return PACK_DIRS.flatMap((dir) =>
        readdirSync(resolve(__dirname, '..', '..', '..', '..', dir))
            .filter((file) => file.endsWith('.json'))
            .map((file) => loadOrder(dir, file)),
    );
}

describe('OrderData schema', () => {
    it('declares the action types the voidcraft tabs split on', () => {
        expect(leaf(schema['actionType']).options.choices).toEqual([...ORDER_ACTION_TYPES]);
    });

    it('adds optional duration and typeAndAction fields that default to empty', () => {
        expect(leaf(schema['duration']).options.initial).toBe('');
        expect(leaf(schema['typeAndAction']).options.initial).toBe('');
    });
});

describe('migrateLegacyOrderTest', () => {
    it('folds the flat skill / modifier into the test block', () => {
        const source: JsonObject = { skill: 'Pilot (Spacecraft)', modifier: -20 };
        migrateLegacyOrderTest(source);
        expect(source).toEqual({ test: { skill: 'Pilot (Spacecraft)', modifier: -20 } });
    });

    it('keeps an authored test block and drops the stray flat fields', () => {
        const source: JsonObject = { skill: 'command', test: { skill: 'Tech-Use', characteristic: '', modifier: -10 } };
        migrateLegacyOrderTest(source);
        expect(source).toEqual({ test: { skill: 'Tech-Use', characteristic: '', modifier: -10 } });
    });

    it('leaves a payload without flat fields untouched', () => {
        const source: JsonObject = { test: { skill: 'Command', characteristic: '', modifier: 0 } };
        migrateLegacyOrderTest(source);
        expect(source).toEqual({ test: { skill: 'Command', characteristic: '', modifier: 0 } });
    });
});

describe.skipIf(!HAS_PRIVATE_CONTENT)('RT ship orders through the schema (#186)', () => {
    const orders = loadAll();

    it('lists every RAW Extended Action from RT Core Table 8-11', () => {
        expect(shipActionRows(orders, 'extended').map((row) => row.name)).toEqual([
            'Active Augury',
            'Aid the Machine Spirit',
            'Disinformation',
            'Emergency Repairs',
            'Flank Speed',
            'Focused Augury',
            'Hail the Enemy',
            'Hit and Run',
            'Hold Fast!',
            'Jam Communications',
            'Lock on Target',
            'Prepare to Repel Boarders!',
            'Put Your Backs Into It!',
            'Triage',
        ]);
    });

    it('lists the manoeuvres, RAW and RT homebrew, on the Manoeuvre tab only', () => {
        expect(shipActionRows(orders, 'manoeuvre').map((row) => row.name)).toEqual([
            'Adjust Bearing',
            'Adjust Speed',
            'Adjust Speed & Bearing',
            'All Stop',
            'Burn Retros',
            'Come to New Heading',
            'Disengage',
            'Evasive Manoeuvres',
            'Hard Brake',
            'Plot Course Change',
            'Ramming Speed',
            'Standard Move',
        ]);
    });

    it('keeps the test, duration and rules text the rows show', () => {
        const rows = [...shipActionRows(orders, 'extended'), ...shipActionRows(orders, 'manoeuvre')];
        const byName = new Map(rows.map((row) => [row.name, row]));
        expect(byName.get('Emergency Repairs')).toMatchObject({ skill: 'Tech-Use', modifier: -10, duration: '1d5 Turns' });
        expect(byName.get('Hold Fast!')).toMatchObject({ skill: 'Willpower', modifier: 0 });
        expect(byName.get('Adjust Speed & Bearing')).toMatchObject({ skill: 'Pilot (Spacecraft)', modifier: -20, duration: '1 Turn' });
        expect(byName.get('Disengage')).toMatchObject({ skill: 'Pilot (Spacecraft)', modifier: 0 });
        expect(rows.filter((row) => row.description === '').map((row) => row.name)).toEqual([]);
    });
});
