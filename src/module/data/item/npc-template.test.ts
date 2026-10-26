import { afterAll, describe, expect, it } from 'vitest';
import { installFoundryDataStub, schemaHasPath } from '../../testing/foundry-data-stub.ts';
import { readRepoFile } from '../../testing/repo-file.ts';
import { CHARACTERISTICS } from '../shared/characteristics.ts';

/**
 * NPC Template DataModel (#656). The sheet's inputs once named paths the schema
 * doesn't have (`baseMovement`, `armourNotes`, `scalingRules.*`, `weapons.*`,
 * `equipment.*`, `trainedSkills.N.bonus`). Foundry's form parser drops such a path,
 * so an edit to it never saved, silently.
 *
 * `npc-template.ts` builds its schema from `foundry.data.fields` at load, so the
 * recording stub is installed before the dynamic import.
 */

afterAll(installFoundryDataStub());

const { default: NPCTemplateData, migrateNpcTemplateLegacyPaths } = await import('./npc-template.ts');

const schema = NPCTemplateData.defineSchema();

const PARTS = ['header', 'tabs', 'tab-basics', 'tab-characteristics', 'tab-equipment', 'tab-abilities', 'tab-preview'];

/** Inputs that sit in the form but are read by the sheet, not saved to the item. */
const SHEET_ONLY = new Set(['previewThreat']);

const names = PARTS.flatMap((part) =>
    Array.from(readRepoFile(`src/templates/item/npc-template/${part}.hbs`).matchAll(/\bname="(?<name>[^"]+)"/g), (match) => match.groups?.['name'] ?? ''),
);

describe('NPC Template sheet inputs (#656)', () => {
    it('finds the inputs it checks', () => {
        expect(names.filter((name) => name.startsWith('system.')).length).toBeGreaterThan(20);
    });

    it('every system input names a path of the schema', () => {
        const keys = CHARACTERISTICS.map((c) => c.key);
        const unresolved = names.filter((name) => name.startsWith('system.') && !schemaHasPath(schema, name.slice('system.'.length), keys));
        expect(unresolved).toEqual([]);
    });

    it('every other input is the document name or a sheet-only control', () => {
        expect(names.filter((name) => !name.startsWith('system.') && name !== 'name' && !SHEET_ONLY.has(name))).toEqual([]);
    });

    it('the path check rejects a path the schema lacks', () => {
        expect(schemaHasPath(schema, 'scalingRules.woundsScale', [])).toBe(false);
        expect(schemaHasPath(schema, 'customWeapons.{{idx}}.colour', [])).toBe(false);
        expect(schemaHasPath(schema, 'baseCharacteristics.{{char.key}}', ['weaponSkill', 'notACharacteristic'])).toBe(false);
        expect(schemaHasPath(schema, 'scaling.woundsScale', [])).toBe(true);
    });
});

describe('generateAtThreat', () => {
    // The model's own fields, as the sheet saves them; `generateAtThreat` reads only these.
    const template = {
        baseThreatLevel: 5,
        scaling: { characteristicScale: 0, woundsScale: 0, armourScale: 0, weaponScale: 0, minMultiplier: 0.5, maxMultiplier: 3 },
        variants: [],
        baseCharacteristics: { weaponSkill: 35 },
        unnaturals: {},
        baseWounds: 10,
        baseArmour: 3,
        trainedSkills: [{ key: 'awareness', name: 'Awareness', characteristic: 'perception', level: 'plus10', bonus: 5 }],
        equipmentPreset: 'custom',
        customWeapons: [{ name: 'Autogun', damage: '1d10+3', pen: 0, range: '90m', rof: 'S/3/10', clip: 30, reload: 'Full', special: '', class: 'basic' }],
        tags: ['cultist'],
        equipment: [
            { name: 'Flak Armour', quantity: 1 },
            { name: '  Ration Pack ', quantity: 3 },
            { name: '', quantity: 1 },
        ],
        defaultMagnitude: 100,
        type: 'troop',
        faction: '',
        subfaction: '',
        role: 'specialist',
        specialAbilities: '',
        description: '',
        tactics: '',
        source: '',
        parent: undefined,
    };
    const generated = NPCTemplateData.prototype.generateAtThreat.call(template, 5);

    it("carries each trained skill's bonus to the NPC", () => {
        expect(generated.trainedSkills['awareness']).toMatchObject({ plus10: true, plus20: false, bonus: 5 });
    });

    it("copies the template's tags, and its custom weapons", () => {
        expect(generated.tags).toEqual(['cultist']);
        expect(generated.weapons.simple).toEqual(template.customWeapons);
    });

    it('carries its named equipment with quantities, trimmed, and skips blank rows (#670)', () => {
        expect(generated.equipment).toEqual([
            { name: 'Flak Armour', quantity: 1 },
            { name: 'Ration Pack', quantity: 3 },
        ]);
    });

    describe('previewAtThreat (#699)', () => {
        // The Preview tab read stats nothing supplied, so it showed labels with no values.
        const previewedFields = {
            ...template,
            baseCharacteristics: { weaponSkill: 35, perception: 40 },
            unnaturals: { weaponSkill: 2 },
            talents: [{ name: 'Ambidextrous' }],
            traits: [{ name: 'Dark-sight' }],
            specialAbilities: '<p>Hates the light.</p>',
        };
        const previewed = {
            ...previewedFields,
            generateAtThreat: (threat: number) => NPCTemplateData.prototype.generateAtThreat.call(previewedFields, threat),
        };
        const preview = NPCTemplateData.prototype.previewAtThreat.call(previewed, 5);

        it('lists each characteristic by its abbreviation, value and Unnatural', () => {
            expect(preview.characteristics).toEqual([
                { key: 'weaponSkill', label: 'WS', short: 'WS', value: 35, unnatural: 2 },
                { key: 'perception', label: 'Per', short: 'Per', value: 40, unnatural: 0 },
            ]);
        });

        it('gives wounds, armour and the movement line', () => {
            expect(preview).toMatchObject({ wounds: 10, armour: 3, movement: '3/7/10/20' });
        });

        it("gives each skill's test target: characteristic, +10 per rank above Trained, and its bonus", () => {
            expect(preview.skills).toEqual([{ name: 'Awareness', target: 40 + 10 + 5 }]);
        });

        it('lists the weapons, talents, traits and special abilities', () => {
            expect(preview.weapons).toEqual([{ name: 'Autogun', damage: '1d10+3', pen: 0, special: '' }]);
            expect(preview.talents).toEqual([{ name: 'Ambidextrous' }]);
            expect(preview.traits).toEqual([{ name: 'Dark-sight' }]);
            expect(preview.specialAbilities).toBe('<p>Hates the light.</p>');
            expect(preview).toMatchObject({ weaponCount: 1, skillCount: 1 });
        });

        it('is what the sheet hands the Preview tab, under the name the tab reads', () => {
            expect(readRepoFile('src/module/applications/item/npc-template-sheet.ts')).toMatch(/const previewData = sys\.previewAtThreat\(/u);
            expect(readRepoFile('src/templates/item/npc-template/tab-preview.hbs')).toContain('previewData.characteristics');
        });
    });
});

describe('migrateNpcTemplateLegacyPaths', () => {
    it('moves a stored legacy key onto its schema key', () => {
        const source: Record<string, object> = { scalingRules: { woundsScale: 4 }, weapons: [{ name: 'Autogun' }] };
        migrateNpcTemplateLegacyPaths(source);
        expect(source).toEqual({ scaling: { woundsScale: 4 }, customWeapons: [{ name: 'Autogun' }] });
    });

    it('keeps the schema key when both are stored, and drops the legacy one', () => {
        const source: Record<string, object> = { scaling: { woundsScale: 2 }, scalingRules: { woundsScale: 9 } };
        migrateNpcTemplateLegacyPaths(source);
        expect(source).toEqual({ scaling: { woundsScale: 2 } });
    });

    it('leaves a source without legacy keys alone', () => {
        const source: Record<string, object> = { scaling: { woundsScale: 2 } };
        migrateNpcTemplateLegacyPaths(source);
        expect(source).toEqual({ scaling: { woundsScale: 2 } });
    });
});
