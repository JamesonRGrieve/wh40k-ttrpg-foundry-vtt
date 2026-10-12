import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../../testing/repo-file.ts';
import {
    GRANT_RESOURCES,
    type GrantResource,
    isGrantResource,
    isResourceAppliedState,
    RESOURCE_PATHS,
    resourceApplyUpdates,
    resourceRestoreUpdates,
    resourceReverseUpdates,
} from './resource-paths.ts';

/**
 * Resource grants wrote `system.corruption.value` / `system.insanity.value`,
 * which a character never has (both are plain NumberFields), and the manager's
 * reversal wrote `system.fatePoints.*`, which no actor has (#91 follow-up).
 * One path map now serves apply, reverse and restore; these pin it to the
 * actor schemas and run each resource through a full apply → reverse cycle.
 */

const CHARACTER_SCHEMA = readRepoFile('src/module/data/actor/character.ts');
const CREATURE_SCHEMA = readRepoFile('src/module/data/actor/templates/creature.ts');
const NPC_SCHEMA = readRepoFile('src/module/data/actor/npc.ts');
const STAT_FIELDS = readRepoFile('src/module/data/shared/stat-fields.ts');

/** A character's `system`, shaped as character.ts + templates/creature.ts declare it. */
function characterSystem(): {
    wounds: { max: number; value: number; critical: number };
    fate: { max: number; value: number };
    corruption: number;
    insanity: number;
} {
    return { wounds: { max: 12, value: 9, critical: 0 }, fate: { max: 3, value: 2 }, corruption: 7, insanity: 4 };
}

/** A nested numeric fixture, the shape of an actor's resource fields. */
type Tree = { [key: string]: number | Tree };

/** The sub-tree at the `system.`-relative `parts`, or undefined when absent. */
function nodeAt(system: Tree, parts: readonly string[]): number | Tree | undefined {
    let node: number | Tree | undefined = system;
    for (const part of parts) node = typeof node === 'object' ? node[part] : undefined;
    return node;
}

/** Reads an actor path (`system.…`) off the fixture, as `foundry.utils.getProperty(actor, path)` does. */
function readerFor(system: Tree): (path: string) => number {
    return (path) => {
        const node = nodeAt(system, path.split('.').slice(1));
        return typeof node === 'number' ? node : Number.NaN;
    };
}

/** Write an update bag back onto the fixture. */
function commit(system: Tree, updates: Record<string, number>): void {
    for (const [path, value] of Object.entries(updates)) {
        const parts = path.split('.').slice(1);
        const leaf = parts.pop() ?? '';
        const parent = nodeAt(system, parts);
        if (typeof parent === 'object') parent[leaf] = value;
    }
}

describe('RESOURCE_PATHS match the actor schemas', () => {
    it('corruption and insanity are plain numbers on the character, with no .value', () => {
        expect(CHARACTER_SCHEMA).toMatch(/\bcorruption: new fields\.NumberField\(/u);
        expect(CHARACTER_SCHEMA).toMatch(/\binsanity: new fields\.NumberField\(/u);
        expect(RESOURCE_PATHS.corruption).toMatchObject({ valuePath: 'system.corruption', maxPath: null });
        expect(RESOURCE_PATHS.insanity).toMatchObject({ valuePath: 'system.insanity', maxPath: null });
    });

    it('fate is { value, max } on creatures and NPCs — there is no fatePoints', () => {
        for (const schema of [CREATURE_SCHEMA, NPC_SCHEMA]) {
            // The fate SchemaField's own block: from its opening to the closing `}),` at its indent.
            const fate = /\n(\s*)fate: new SchemaField\(\{\n([\s\S]*?)\n\1\}\),/u.exec(schema)?.[2] ?? '';
            expect(fate).toMatch(/\bvalue: new NumberField/u);
            expect(fate).toMatch(/\bmax: new NumberField/u);
        }
        expect(CREATURE_SCHEMA + NPC_SCHEMA).not.toMatch(/fatePoints/u);
        expect(RESOURCE_PATHS.fate).toMatchObject({ valuePath: 'system.fate.value', maxPath: 'system.fate.max' });
    });

    it('wounds is woundsField() { value, max } on creatures and NPCs', () => {
        expect(CREATURE_SCHEMA).toMatch(/\bwounds: woundsField\(/u);
        expect(NPC_SCHEMA).toMatch(/\bwounds: woundsField\(/u);
        expect(STAT_FIELDS).toMatch(/max: n\(opts\.max\)/u);
        expect(STAT_FIELDS).toMatch(/value: n\(opts\.value\)/u);
        expect(RESOURCE_PATHS.wounds).toMatchObject({ valuePath: 'system.wounds.value', maxPath: 'system.wounds.max' });
    });

    it('NPCs carry no corruption or insanity field', () => {
        expect(NPC_SCHEMA).not.toMatch(/\bcorruption: new/u);
        expect(NPC_SCHEMA).not.toMatch(/\binsanity: new/u);
    });

    it('every resource path resolves on a schema-shaped character', () => {
        const read = readerFor(characterSystem());
        const paths = GRANT_RESOURCES.flatMap((type) => {
            const { valuePath, maxPath } = RESOURCE_PATHS[type];
            return maxPath === null ? [valuePath] : [valuePath, maxPath];
        });
        expect(paths.filter((path) => Number.isNaN(read(path)))).toEqual([]);
    });
});

describe('apply → reverse round-trips each resource on a schema-shaped character', () => {
    const cases: ReadonlyArray<readonly [GrantResource, number]> = [
        ['wounds', 3],
        ['fate', 1],
        ['corruption', 10],
        ['insanity', 5],
    ];

    it.each(cases)('additive %s +%d lands on the real path and reverses to the original', (type, value) => {
        const system = characterSystem();
        const before = structuredClone(system);
        const read = readerFor(system);
        const { updates, state } = resourceApplyUpdates(type, { formula: String(value), value, additive: true }, read);
        expect(Object.keys(updates)).toEqual([
            RESOURCE_PATHS[type].valuePath,
            ...(RESOURCE_PATHS[type].maxPath === null ? [] : [RESOURCE_PATHS[type].maxPath]),
        ]);
        commit(system, updates);
        expect(read(RESOURCE_PATHS[type].valuePath)).toBe(state.previousValue + value);

        commit(system, resourceReverseUpdates(type, state, read));
        expect(system).toEqual(before);
    });

    it.each(cases)('replacing %s =%d restores the captured value on reverse', (type, value) => {
        const system = characterSystem();
        const before = structuredClone(system);
        const read = readerFor(system);
        const { updates, state } = resourceApplyUpdates(type, { formula: String(value), value, additive: false }, read);
        commit(system, updates);
        expect(read(RESOURCE_PATHS[type].valuePath)).toBe(value);

        commit(system, resourceReverseUpdates(type, state, read));
        expect(system).toEqual(before);
    });

    it('an additive reverse keeps changes made after the grant', () => {
        const system = characterSystem();
        const read = readerFor(system);
        const { updates, state } = resourceApplyUpdates('corruption', { formula: '10', value: 10, additive: true }, read);
        commit(system, updates); // 7 → 17
        system.corruption += 3; // later Corruption gain → 20
        commit(system, resourceReverseUpdates('corruption', state, read));
        expect(system.corruption).toBe(10);
    });

    it('restore adds a reversed grant back', () => {
        const system = characterSystem();
        const read = readerFor(system);
        const { state } = resourceApplyUpdates('fate', { formula: '1', value: 1, additive: true }, read);
        expect(resourceRestoreUpdates('fate', state, read)).toEqual({ 'system.fate.value': 3, 'system.fate.max': 4 });
    });
});

describe('guards', () => {
    it('isGrantResource accepts only the four resources', () => {
        expect(GRANT_RESOURCES.every(isGrantResource)).toBe(true);
        expect(isGrantResource('fatePoints')).toBe(false);
    });

    it('isResourceAppliedState rejects a malformed stored entry', () => {
        expect(isResourceAppliedState({ rolledValue: 1, additive: true, previousValue: 0 })).toBe(true);
        expect(isResourceAppliedState({ previousValue: 0 })).toBe(false);
        expect(isResourceAppliedState('x')).toBe(false);
    });
});
