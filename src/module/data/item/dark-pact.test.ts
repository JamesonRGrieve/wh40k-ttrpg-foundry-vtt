import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type DeclaredPack, readDeclaredPacks } from '../../../../scripts/lib/pack-manifest.mjs';
import { ElementField, installFoundryDataStub, LeafField, SchemaRecord } from '../../testing/foundry-data-stub.ts';
import { HAS_PRIVATE_CONTENT } from '../../testing/private-content.ts';
import { lineCategoryPack } from '../../utils/line-packs.ts';

/** The repo root and `src/packs-private`, from this file (three levels below `src/`). */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const PRIVATE_CONTENT_ROOT = resolve(REPO_ROOT, 'src', 'packs-private');

/**
 * DarkPactData schema contract and the DH2 pacts through it (#84).
 *
 * The model evaluates `foundry.data.fields` at module load, so the recording
 * stub is installed BEFORE the dynamic import.
 */

afterAll(installFoundryDataStub());

const { default: DarkPactData } = await import('./dark-pact.ts');
const { pactEntryEffectData } = await import('../../rules/dark-pact.ts');

const schema = DarkPactData.defineSchema();

function schemaRecord(value: object | undefined): SchemaRecord {
    if (!(value instanceof SchemaRecord)) throw new Error('expected a SchemaField');
    return value;
}
function elementField(value: object | undefined): ElementField {
    if (!(value instanceof ElementField)) throw new Error('expected an ArrayField');
    return value;
}
function leaf(value: object | undefined): LeafField {
    if (!(value instanceof LeafField)) throw new Error('expected a leaf field');
    return value;
}

describe('DarkPactData schema (#84)', () => {
    it('declares the terms of striking a pact', () => {
        expect(leaf(schema['corruptionFormula']).options.initial).toBe('');
        const negotiation = schemaRecord(schema['negotiation']).fields;
        expect(Object.keys(negotiation)).toEqual(['dispositionBase', 'addsCorruption', 'testModifier']);
        expect(leaf(negotiation['dispositionBase']).options.initial).toBe(0);
        expect(leaf(negotiation['addsCorruption']).options.initial).toBe(false);
        expect(leaf(negotiation['testModifier']).options.initial).toBe(0);
    });

    it('gives Boons and Banes the same entry shape: text, modifiers and grants', () => {
        for (const kind of ['boons', 'banes']) {
            const list = elementField(schema[kind]);
            expect(list.options.initial).toEqual([]);
            const fields = schemaRecord(list.element).fields;
            expect(Object.keys(fields)).toEqual(['identifier', 'name', 'description', 'modifiers', 'grants']);
            const grant = schemaRecord(elementField(fields['grants']).element).fields;
            expect(Object.keys(grant)).toEqual(['uuid', 'specialization', 'level']);
        }
    });

    it('keeps the description template and an identifier', () => {
        expect(schema).toHaveProperty('description');
        expect(schema).toHaveProperty('identifier');
    });
});

/** A pack document's fields this suite reads. */
interface PactGrantSource {
    uuid: string;
    specialization: string;
    level: number | null;
}
interface PactEntrySource {
    identifier: string;
    name: string;
    description: string;
    modifiers: { characteristics?: Record<string, number> };
    grants: PactGrantSource[];
}
interface PactSource {
    _id: string;
    name: string;
    type: string;
    system: {
        corruptionFormula: string;
        negotiation: { dispositionBase: number; addsCorruption: boolean; testModifier: number };
        source: { dh2: { provenance: string; book: string; page: string } };
        gameSystems: string[];
        boons: PactEntrySource[];
        banes: PactEntrySource[];
    };
}

/** A declared pack's `_source` directory under the private content root. */
function sourceDir(pack: DeclaredPack): string {
    return resolve(PRIVATE_CONTENT_ROOT, pack.path.replace(/^packs\//, ''), '_source');
}

/** Whether a `Compendium.wh40k-rpg.<pack>.Item.<id>` UUID names a real private-pack document. */
function packDocumentExists(declared: DeclaredPack[], uuid: string): boolean {
    const match = /^Compendium\.wh40k-rpg\.([^.]+)\.Item\.([A-Za-z0-9]{16})$/.exec(uuid);
    if (match === null) return false;
    const [, name = '', id = ''] = match;
    const pack = declared.find((candidate) => candidate.name === name);
    if (pack === undefined) return false;
    const dir = sourceDir(pack);
    return existsSync(dir) && readdirSync(dir).some((file) => file.endsWith(`_${id}.json`));
}

describe.skipIf(!HAS_PRIVATE_CONTENT)('DH2 Dark Pacts (#84)', () => {
    // Read in beforeAll: a skipped describe's body still runs to collect its tests,
    // so a read here fails where the private content is absent (CI).
    let declared: DeclaredPack[] = [];
    let traitsPack = '';
    let pacts: PactSource[] = [];
    let byName = new Map<string, PactSource>();
    beforeAll(() => {
        declared = readDeclaredPacks(REPO_ROOT).packs;
        const asPacks = declared.map((metadata) => ({ metadata }));
        const pactPack = lineCategoryPack(asPacks, 'dh2', 'dark-pacts')?.metadata;
        if (pactPack === undefined) throw new Error('no dh2 dark-pacts pack is declared');
        traitsPack = lineCategoryPack(asPacks, 'dh2', 'traits')?.metadata.name ?? '';
        const dir = sourceDir(pactPack);
        const files = readdirSync(dir).filter((file) => file.endsWith('.json'));
        pacts = files.map((file) => JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as PactSource);
        byName = new Map(pacts.map((pact) => [pact.name, pact]));
    });

    it('authors the seven example pacts the book prints, each citing its page', () => {
        expect(pacts.map((pact) => pact.name).sort()).toEqual([
            'Pact of Desire',
            'Pact of Dominion',
            'Pact of Knowledge',
            'Pact of Might',
            'Pact of Power',
            'Pact of Survival',
            'Pact of Vengeance',
        ]);
        for (const pact of pacts) expect(pact.system.source.dh2.page).toMatch(/^\d+$/);
        // Every pact cites the one DH2 book that prints them.
        expect(new Set(pacts.map((pact) => pact.system.source.dh2.book)).size).toBe(1);
        for (const pact of pacts) {
            expect(pact.type).toBe('darkPact');
            expect(pact.system.source.dh2).toMatchObject({ provenance: 'raw' });
            expect(pact.system.source.dh2.book).toMatch(/^DH2: \S/);
            expect(pact.system.gameSystems).toEqual(['dh2']);
        }
    });

    it("carries the book's terms on every pact: 15 + Corruption, Hard (−20), 2d10+10 Corruption", () => {
        for (const pact of pacts) {
            expect(pact.system.negotiation).toEqual({ dispositionBase: 15, addsCorruption: true, testModifier: -20 });
            expect(pact.system.corruptionFormula).toBe('2d10+10');
        }
    });

    it('gives every Boon and Bane a unique identifier and its rules text', () => {
        for (const pact of pacts) {
            const entries = [...pact.system.boons, ...pact.system.banes];
            expect(entries.length).toBeGreaterThan(0);
            expect(new Set(entries.map((entry) => entry.identifier)).size).toBe(entries.length);
            for (const entry of entries) expect(entry.description).toMatch(/^<p>.+<\/p>$/);
        }
    });

    it('grants only items that exist in the packs', () => {
        const grants = pacts.flatMap((pact) => [...pact.system.boons, ...pact.system.banes].flatMap((entry) => entry.grants));
        expect(grants.length).toBeGreaterThan(0);
        expect(grants.filter((grant) => !packDocumentExists(declared, grant.uuid)).map((grant) => grant.uuid)).toEqual([]);
    });

    it('turns the characteristic Boons and Banes into central ActiveEffect changes', () => {
        const entryOf = (pactName: string, identifier: string): PactEntrySource => {
            const pact = byName.get(pactName);
            const entry = pact && [...pact.system.boons, ...pact.system.banes].find((candidate) => candidate.identifier === identifier);
            if (entry === undefined) throw new Error(`missing ${pactName} / ${identifier}`);
            return entry;
        };
        const ref = { pactUuid: 'x', kind: 'boons' as const, entry: 'x' };
        expect(pactEntryEffectData(ref, entryOf('Pact of Might', 'lord-of-battle'), '')?.changes).toEqual([
            { key: 'system.characteristics.weaponSkill.modifier', mode: 2, value: 5 },
        ]);
        expect(entryOf('Pact of Might', 'mighty').grants).toEqual([
            { uuid: `Compendium.wh40k-rpg.${traitsPack}.Item.UnnatCharDh2TrX1`, specialization: 'Strength', level: 2 },
        ]);
        expect(entryOf('Pact of Power', 'wyrd').grants.map((grant) => grant.uuid)).toEqual([`Compendium.wh40k-rpg.${traitsPack}.Item.Hl2kY7NAa9QaLg1X`]);
    });
});
