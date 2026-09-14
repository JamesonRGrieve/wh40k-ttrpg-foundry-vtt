/**
 * Guard for the reference-graph tracing in `src/packs/validate-schema.cjs`.
 *
 * The schema validator dereferences every `Compendium.wh40k-rpg.<pack>.<Class>.<id>`
 * reference against a `pack → Set<_id>` index built from all source documents, so
 * a dangling reference (a moved/renamed target, a stale grant, a wrong-pack
 * adventure encounter, a broken `@UUID[…]` link) is surfaced as a
 * `reference-unresolved` / `reference-unknown-pack` warning instead of silently
 * resolving to null in Foundry. `variant-of-not-uuid` only checked SHAPE; this
 * check verifies the target actually exists.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
interface Warning {
    rule: string;
    file: string;
    detail: string;
}
interface ParsedEntry {
    file: string;
    rel: string;
    doc: Json;
}
interface ReferenceValidator {
    collectUuidRefs: (value: Json, out: Set<string>) => void;
    buildPackIdIndex: (parsed: ParsedEntry[], rootDir: string) => Map<string, Set<string>>;
    validateReferences: (doc: Json, rel: string, warnings: Warning[], packIds: Map<string, Set<string>>) => void;
}

const nodeRequire = createRequire(import.meta.url);
const validator = nodeRequire('../src/packs/validate-schema.cjs') as ReferenceValidator;

const uuid = (pack: string, cls: string, id: string): string => `Compendium.wh40k-rpg.${pack}.${cls}.${id}`;

function refsOf(value: Json): string[] {
    const out = new Set<string>();
    validator.collectUuidRefs(value, out);
    return [...out];
}

function rulesFor(doc: Json, packIds: Map<string, Set<string>>): Warning[] {
    const warnings: Warning[] = [];
    validator.validateReferences(doc, 'test.json', warnings, packIds);
    return warnings;
}

describe('collectUuidRefs', () => {
    it('extracts a structured-field UUID as a "pack id" key', () => {
        expect(refsOf({ system: { variantOf: uuid('dh2-core-items-weapons', 'Item', 'Bolt3rVanilla01') } })).toEqual([
            'dh2-core-items-weapons Bolt3rVanilla01',
        ]);
    });

    it('extracts inline @UUID[…] and {{Compendium.…}} tokens from rules HTML', () => {
        const html = `<p>See @UUID[${uuid('dh2-core-items-talents', 'Item', 'DH2aTlnt00000058')}]{Two-Weapon Wielder} and {{${uuid(
            'dh2-core-items-skills',
            'Item',
            'DH2SkillDodge001',
        )}}}.</p>`;
        expect(refsOf(html).sort()).toEqual(['dh2-core-items-skills DH2SkillDodge001', 'dh2-core-items-talents DH2aTlnt00000058']);
    });

    it('walks arrays of embedded compendiumSource references', () => {
        const items: Json = [
            { _stats: { compendiumSource: uuid('dh2-core-items-weapons', 'Item', 'PowerMaul000001A') } },
            { _stats: { compendiumSource: uuid('dh2-core-items-traits', 'Item', 'NaturalWeap0001B') } },
        ];
        expect(refsOf({ items }).sort()).toEqual(['dh2-core-items-traits NaturalWeap0001B', 'dh2-core-items-weapons PowerMaul000001A']);
    });

    it('ignores a reference-stub file path and non-wh40k compendia', () => {
        expect(refsOf({ reference: '../dh2-core-items-weapons/_source/frag.json', img: 'Compendium.dnd5e.items.Item.abc123' })).toEqual([]);
    });
});

describe('validateReferences', () => {
    const packIds = new Map<string, Set<string>>([
        ['dh2-core-actors-npcs', new Set(['frCOTZ97so99RPXU'])],
        ['dh2-core-actors-bestiary', new Set(['Grox000000000001'])],
    ]);

    it('passes a reference whose target _id exists in the named pack', () => {
        expect(rulesFor({ actorUuid: uuid('dh2-core-actors-npcs', 'Actor', 'frCOTZ97so99RPXU') }, packIds)).toHaveLength(0);
    });

    it('warns reference-unresolved when the id is absent from the named pack (wrong-pack/dangling)', () => {
        const warnings = rulesFor({ actorUuid: uuid('dh2-core-actors-bestiary', 'Actor', 'frCOTZ97so99RPXU') }, packIds);
        expect(warnings.map((w) => w.rule)).toEqual(['reference-unresolved']);
        expect(warnings[0]?.detail).toContain('dh2-core-actors-bestiary');
    });

    it('warns reference-unknown-pack when the named pack has no source documents', () => {
        expect(rulesFor({ actorUuid: uuid('dh2-ghost-actors-npcs', 'Actor', 'frCOTZ97so99RPXU') }, packIds).map((w) => w.rule)).toEqual([
            'reference-unknown-pack',
        ]);
    });

    it('reports each distinct dangling reference once', () => {
        const doc: Json = {
            a: uuid('dh2-core-actors-bestiary', 'Actor', 'frCOTZ97so99RPXU'),
            b: uuid('dh2-core-actors-bestiary', 'Actor', 'frCOTZ97so99RPXU'),
        };
        expect(rulesFor(doc, packIds)).toHaveLength(1);
    });
});

describe('buildPackIdIndex', () => {
    it('indexes a full document by its pack (from the path) and _id', () => {
        const parsed: ParsedEntry[] = [
            {
                file: '/x/dark-heresy-2/dh2-core-items-weapons/_source/bolt.json',
                rel: 'dark-heresy-2/dh2-core-items-weapons/_source/bolt.json',
                doc: { _id: 'Bolt3rVanilla01', name: 'Bolter' },
            },
        ];
        const index = validator.buildPackIdIndex(parsed, '/x');
        expect(index.get('dh2-core-items-weapons')?.has('Bolt3rVanilla01')).toBe(true);
    });

    it('indexes a reference-override stub under its own _id (rides a shared body with a local identity)', () => {
        const parsed: ParsedEntry[] = [
            {
                file: '/x/deathwatch/dw-core-items-weapons/_source/astartes-frag.json',
                rel: 'deathwatch/dw-core-items-weapons/_source/astartes-frag.json',
                doc: { reference: '../../../dark-heresy-2/dh2-core-items-weapons/_source/frag.json', _id: 'AstFragGrenade01' },
            },
        ];
        const index = validator.buildPackIdIndex(parsed, '/x');
        expect(index.get('dw-core-items-weapons')?.has('AstFragGrenade01')).toBe(true);
    });
});
