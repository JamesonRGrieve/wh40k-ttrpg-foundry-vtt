import { describe, expect, it } from 'vitest';
import { buildLangStub } from '../../testing/lang-stub.ts';
import { CRAFT_EXTRA_LAYOUT, NPC_EXTRA_LAYOUT, VOIDCRAFT_EXTRA_LAYOUT } from '../actor/actor-schema-layouts.ts';
import {
    buildSectionRows,
    choiceLabelKey,
    layoutLabelKeys,
    type SchemaInputRow,
    type SchemaListRow,
    type SchemaNode,
    type SchemaSheetLayout,
    type SchemaSheetSection,
} from './schema-sheet-layout.ts';
import { ITEM_COMMON_LAYOUT, SCHEMA_SHEET_LAYOUTS, SUPPLEMENTARY_LAYOUTS, TALENT_EXTRA_LAYOUT, TRAIT_EXTRA_LAYOUT } from './schema-sheet-layouts.ts';

/** A structural stand-in for a Foundry DataField of the named class. */
function field(name: string, extra: Partial<SchemaNode> = {}): SchemaNode {
    const Named = class {};
    Object.defineProperty(Named, 'name', { value: name });
    return Object.assign(Object.create(Named.prototype) as SchemaNode, extra);
}

const schema = field('SchemaField', {
    fields: {
        notes: field('StringField'),
        effect: field('HTMLField'),
        kind: field('StringField', { choices: ['', 'shipModifier'] }),
        activation: field('SchemaField', { fields: { type: field('StringField', { choices: () => ['half-action'] }) } }),
        tags: field('ArrayField', { element: field('StringField') }),
        abilities: field('ArrayField', { element: field('SchemaField', { fields: { name: field('StringField'), bonus: field('NumberField') } }) }),
    },
});

const section: SchemaSheetSection = {
    key: 'main',
    icon: 'fa-star',
    paths: ['notes', 'effect', 'kind', 'activation.type', 'missing', 'tags[]', 'abilities[].name', 'abilities[].bonus'],
    choiceLabels: { 'activation.type': 'WH40K.ActionType' },
};

const layout: SchemaSheetLayout = { type: 'test', labelPrefix: 'WH40K.ItemFields.Test', sections: [section] };

const source = {
    notes: 'n',
    effect: '<p>e</p>',
    kind: 'shipModifier',
    activation: { type: 'half-action' },
    tags: ['a', 'b'],
    abilities: [{ name: 'Aim', bonus: 10 }],
};

describe('schema sheet rows (#731)', () => {
    const rows = buildSectionRows(layout, section, schema, source);
    const inputs = rows.filter((row): row is SchemaInputRow => row.kind === 'input');
    const lists = rows.filter((row): row is SchemaListRow => row.kind === 'list');

    it('renders one input per scalar path, in layout order, skipping a path the schema lacks', () => {
        expect(inputs.map((row) => row.name)).toEqual(['system.notes', 'system.effect', 'system.kind', 'system.activation.type']);
        expect(inputs.map((row) => row.value)).toEqual(['n', '<p>e</p>', 'shipModifier', 'half-action']);
    });

    it('labels each field under <prefix>.FIELDS.<path>.label and marks rich text', () => {
        expect(inputs[0]?.labelKey).toBe('WH40K.ItemFields.Test.FIELDS.notes.label');
        expect(inputs.map((row) => row.html)).toEqual([false, true, false, false]);
    });

    it('labels choices from a declared namespace, else under the field, and the blank option as None', () => {
        expect(inputs[2]?.choices).toEqual({ '': 'WH40K.Common.None', 'shipModifier': 'WH40K.ItemFields.Test.FIELDS.kind.choices.ShipModifier' });
        expect(inputs[3]?.choices).toEqual({ 'half-action': 'WH40K.ActionType.HalfAction' });
        expect(inputs[0]?.choices).toBeNull();
    });

    it('turns an array of scalars into one indexed input per entry', () => {
        expect(lists[0]?.name).toBe('system.tags');
        expect(lists[0]?.entries.map((entry) => entry.rows.map((row) => [row.name, row.value]))).toEqual([[['system.tags.0', 'a']], [['system.tags.1', 'b']]]);
    });

    it('groups an array of objects into one list whose entries hold each sub-field', () => {
        expect(lists[1]?.name).toBe('system.abilities');
        expect(lists[1]?.labelKey).toBe('WH40K.ItemFields.Test.FIELDS.abilities.label');
        expect(lists[1]?.entries[0]?.rows.map((row) => [row.name, row.labelKey, row.value])).toEqual([
            ['system.abilities.0.name', 'WH40K.ItemFields.Test.FIELDS.abilities.name.label', 'Aim'],
            ['system.abilities.0.bonus', 'WH40K.ItemFields.Test.FIELDS.abilities.bonus.label', 10],
        ]);
    });

    it('builds a list row with no entries when nothing is stored', () => {
        const empty = buildSectionRows(layout, section, schema, {});
        expect(empty.filter((row) => row.kind === 'list').map((row) => row.entries.length)).toEqual([0, 0]);
    });

    it('pascal-cases kebab and camel option values', () => {
        expect(choiceLabelKey(layout, section, 'kind', 'long-rest')).toBe('WH40K.ItemFields.Test.FIELDS.kind.choices.LongRest');
    });
});

describe('the shipped schema-sheet layouts (#731)', () => {
    const { has } = buildLangStub();

    it('cover the eight item types that had no sheet', () => {
        expect(SCHEMA_SHEET_LAYOUTS.map((entry) => entry.type).sort()).toEqual([
            'backpack',
            'navigatorPower',
            'oath',
            'order',
            'ritual',
            'shipRole',
            'vehicleTrait',
            'vehicleUpgrade',
        ]);
    });

    it.each(
        [
            ...SCHEMA_SHEET_LAYOUTS,
            ...new Set(Object.values(SUPPLEMENTARY_LAYOUTS)),
            ITEM_COMMON_LAYOUT,
            NPC_EXTRA_LAYOUT,
            CRAFT_EXTRA_LAYOUT,
            VOIDCRAFT_EXTRA_LAYOUT,
        ].map((entry) => [entry.labelPrefix, entry] as const),
    )('%s has a langpack label for every section and field', (_type, schemaLayout) => {
        expect(layoutLabelKeys(schemaLayout).filter((key) => !has(key))).toEqual([]);
    });

    it('gives talents and traits the one re-roll section, not two copies (#733)', () => {
        const reroll = TALENT_EXTRA_LAYOUT.sections.find((entry) => entry.key === 'reroll');
        expect(reroll).toBeDefined();
        expect(TRAIT_EXTRA_LAYOUT.sections).toContain(reroll);
    });
});

describe('schema map rows (#735)', () => {
    const mapSection: SchemaSheetSection = {
        key: 'overrides',
        icon: 'fa-sliders-h',
        paths: ['overrides.characteristics{characteristics}', 'overrides.skills{trainedSkills}'],
        choiceLabels: { 'overrides.characteristics': 'WH40K.Characteristic' },
    };
    const mapLayout: SchemaSheetLayout = { type: 'npc', labelPrefix: 'WH40K.ActorFields.Test', sections: [mapSection] };
    const mapSchema = field('SchemaField', {
        fields: { overrides: field('SchemaField', { fields: { characteristics: field('ObjectField'), skills: field('ObjectField') } }) },
    });
    const stored = {
        characteristics: { weaponSkill: {}, willpower: {} },
        trainedSkills: { dodge: {} },
        overrides: { characteristics: { willpower: 45 }, skills: {} },
    };
    const rows = buildSectionRows(mapLayout, mapSection, mapSchema, stored, (mapPath, key) => (mapPath === 'overrides.skills' ? `Skill ${key}` : null));

    it('renders one number input per key of the key source, carrying the stored override', () => {
        const characteristics = rows.at(0);
        expect(characteristics?.kind).toBe('map');
        expect(characteristics?.kind === 'map' ? characteristics.entries.map((entry) => [entry.name, entry.value, entry.labelKey]) : []).toEqual([
            ['system.overrides.characteristics.weaponSkill', undefined, 'WH40K.Characteristic.WeaponSkill'],
            ['system.overrides.characteristics.willpower', 45, 'WH40K.Characteristic.Willpower'],
        ]);
    });

    it('labels a key through the sheet when it resolves one (a skill from the catalog)', () => {
        const skills = rows.at(1);
        expect(skills?.kind === 'map' ? skills.entries.map((entry) => entry.label) : []).toEqual(['Skill dodge']);
        expect(skills?.labelKey).toBe('WH40K.ActorFields.Test.FIELDS.overrides.skills.label');
    });
});
