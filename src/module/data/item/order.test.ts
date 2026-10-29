import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isShipEffectKind, type ShipEffectData } from '../../rules/ship-action-effects.ts';
import type { ShipActionOrderSystem, ShipActionOrderView } from '../../rules/ship-actions.ts';
import { ElementField, installFoundryDataStub, LeafField, SchemaRecord } from '../../testing/foundry-data-stub.ts';
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
 * so the recording stub (testing/foundry-data-stub.ts) is installed BEFORE the
 * dynamic import. Each stub field records its options so the schema can be walked.
 */

afterAll(installFoundryDataStub());

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
        identifier: typeof cleaned['identifier'] === 'string' ? cleaned['identifier'] : '',
        actionType: text(cleaned, 'actionType'),
        // `characteristic` has no initial: absent stays absent, as Foundry leaves it.
        test: {
            skill: text(test, 'skill'),
            characteristic: test['characteristic'] === undefined ? '' : text(test, 'characteristic'),
            modifier,
            shipStat: text(test, 'shipStat'),
        },
        duration: text(cleaned, 'duration'),
        requirements: text(cleaned, 'requirements'),
        typeAndAction: text(cleaned, 'typeAndAction'),
        description: { value: text(child(cleaned, 'description'), 'value') },
        shipEffect: shipEffect(child(cleaned, 'shipEffect')),
    };
}

function int(object: JsonObject, key: string): number {
    const value = object[key];
    if (typeof value !== 'number') throw new Error(`expected "${key}" to be a number after cleaning`);
    return value;
}

/** Read the cleaned `shipEffect` block, failing on a wrong shape. */
function shipEffect(cleaned: JsonObject): ShipEffectData {
    const kind = text(cleaned, 'kind');
    const expiry = text(cleaned, 'expiry');
    // An ArrayField with no authored value defaults to [] in Foundry.
    const targets = cleaned['targets'] ?? [];
    if (!Array.isArray(targets)) throw new Error('expected shipEffect.targets to be an array after cleaning');
    if (kind !== '' && !isShipEffectKind(kind)) throw new Error(`unknown shipEffect.kind "${kind}"`);
    if (expiry !== '' && expiry !== 'turnEnd' && expiry !== 'turnStart') throw new Error(`unknown shipEffect.expiry "${expiry}"`);
    return {
        kind,
        targets: targets.filter((target): target is string => typeof target === 'string'),
        base: int(cleaned, 'base'),
        step: int(cleaned, 'step'),
        per: int(cleaned, 'per'),
        rounds: int(cleaned, 'rounds'),
        expiry,
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

    it('adds an optional shipEffect that defaults to no effect, and an optional test.shipStat (#186)', () => {
        const cleaned = cleanToSchema(schema, {});
        expect(shipEffect(child(cleaned, 'shipEffect'))).toEqual({ kind: '', targets: [], base: 0, step: 0, per: 1, rounds: 0, expiry: '' });
        expect(child(cleaned, 'test')['shipStat']).toBe('');
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
    // Read in beforeAll: a skipped describe's body still runs to collect its tests.
    let orders: ShipActionOrderView[] = [];
    beforeAll(() => {
        orders = loadAll();
    });

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

    it('authors the automatable effects as data and leaves the rest rules cards (#186, #189)', () => {
        const byName = new Map(orders.map((view) => [view.name, view.system]));
        const summary = (name: string): [string, string[], number, number, number, number, string] => {
            const system = byName.get(name);
            if (system === undefined) throw new Error(`missing ${name}`);
            const { kind, targets, base, step, per, rounds, expiry } = system.shipEffect;
            return [kind, targets, base, step, per, rounds, expiry];
        };
        expect(summary('Hold Fast!')).toEqual(['reducePriorTurnDamage', ['morale'], 1, 1, 1, 0, '']);
        expect(summary('Triage')).toEqual(['reducePriorTurnDamage', ['crewPopulation'], 1, 1, 1, 0, '']);
        expect(summary('Aid the Machine Spirit')).toEqual(['shipModifier', ['manoeuvrability', 'detection'], 5, 5, 2, 0, 'turnEnd']);
        expect(summary('Flank Speed')).toEqual(['shipModifier', ['speed'], 1, 1, 1, 0, 'turnEnd']);
        expect(summary('Lock on Target')).toEqual(['shipModifier', ['weaponBallisticSkill'], 5, 5, 2, 0, 'turnEnd']);
        expect(summary('Come to New Heading')).toEqual(['shipModifier', ['ballisticSkill'], -20, 0, 1, 0, 'turnEnd']);
        expect(summary('Evasive Manoeuvres')).toEqual(['shipModifier', ['ballisticSkill'], -10, -10, 1, 1, 'turnStart']);
        expect(byName.get('Lock on Target')?.test.shipStat).toBe('detection');
        expect(byName.get('Evasive Manoeuvres')?.test).toMatchObject({ skill: 'Pilot (Spacecraft)', modifier: -10, shipStat: 'manoeuvrability' });

        const rollable = [...shipActionRows(orders, 'extended'), ...shipActionRows(orders, 'manoeuvre')].filter((row) => row.rollable).map((row) => row.name);
        expect(rollable).toEqual([
            'Aid the Machine Spirit',
            'Flank Speed',
            'Hold Fast!',
            'Lock on Target',
            'Triage',
            'Come to New Heading',
            'Evasive Manoeuvres',
        ]);
    });
});

describe('OrderData.testLabel and its chat line (#648)', () => {
    interface OrderLike {
        category: string;
        actionType: string;
        test: { skill: string; modifier: number };
        readonly testLabel: string;
        readonly chatProperties: string[];
    }
    const order = (skill: string, modifier: number): OrderLike => {
        const instance = Object.create(OrderData.prototype) as OrderLike;
        instance.category = 'movement';
        instance.actionType = 'extended';
        instance.test = { skill, modifier };
        // The other chat-line labels lean on Foundry's String#capitalize; they are not under test here.
        Object.defineProperties(instance, { categoryLabel: { value: 'Movement' }, actionTypeLabel: { value: 'Extended Action' } });
        return instance;
    };

    beforeEach(() => {
        vi.stubGlobal('game', {
            i18n: {
                localize: (key: string): string => key,
                format: (key: string, data: Record<string, string>): string => (key === 'WH40K.Chat.TestProperty' ? `Test: ${data['test'] ?? ''}` : key),
            },
        });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('names a skill key by its catalog label, not the key ("TEST command" on the Ship Orders panel)', () => {
        expect(order('command', 0).testLabel).toBe('Command');
        expect(order('command', 10).testLabel).toBe('Command +10');
        expect(order('awareness', -20).testLabel).toBe('Awareness -20');
    });

    it('keeps skill text the content authored as display text', () => {
        expect(order('Pilot (Spacecraft)', 0).testLabel).toBe('Pilot (Spacecraft)');
        expect(order('Tech-Use', 10).testLabel).toBe('Tech-Use +10');
    });

    it('takes the chat line from the langpack, not a hard-coded "Test:"', () => {
        expect(order('command', 10).chatProperties).toContain('Test: Command +10');
        expect(readRepoFile('src/module/data/item/order.ts')).not.toContain('`Test: ');
    });
});
