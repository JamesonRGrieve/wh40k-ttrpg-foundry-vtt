import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../testing/repo-file.ts';
import { burnFateUpdate } from './fate.ts';

/**
 * Fate's total is `fate.max` and its current points `fate.value` (#42). Origin
 * Fate and Burn Fate used to write `system.fate.total`, which no actor schema
 * has, so neither landed.
 */

describe('burnFateUpdate (DH2 core p. 293; DH1 / DW / OW core)', () => {
    it('lowers the Fate total by 1 and cuts current points above it', () => {
        expect(burnFateUpdate({ max: 3, value: 3 })).toEqual({ 'system.fate.max': 2, 'system.fate.value': 2 });
    });

    it('keeps current points already at or under the new total', () => {
        expect(burnFateUpdate({ max: 3, value: 1 })).toEqual({ 'system.fate.max': 2, 'system.fate.value': 1 });
    });

    it('can burn with no Fate points left to spend', () => {
        expect(burnFateUpdate({ max: 2, value: 0 })).toEqual({ 'system.fate.max': 1, 'system.fate.value': 0 });
    });

    it('cannot burn a Fate total of 0', () => {
        expect(burnFateUpdate({ max: 0, value: 0 })).toBeNull();
    });
});

/** Every non-test TypeScript source under `src/module`, repo-relative. */
function moduleSources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return moduleSources(path);
        return name.endsWith('.ts') && !/\.(test|stories)\.ts$/u.test(name) && !name.endsWith('.d.ts') ? [path] : [];
    });
}

describe('Fate is written to its schema fields (#42)', () => {
    const SCHEMA = readRepoFile('src/module/data/actor/templates/creature.ts');
    const ROOT = join(__dirname, '..');

    it('the creature schema declares fate { max, value, threshold } and no total', () => {
        const fate = /\n(\s*)fate: new SchemaField\(\{\n([\s\S]*?)\n\1\}\),/u.exec(SCHEMA)?.[2] ?? '';
        expect(fate.match(/^\s*(\w+):/gmu)?.map((field) => field.trim().replace(':', ''))).toEqual(['max', 'value', 'threshold']);
    });

    it('no source module writes or reads the phantom system.fate.total', () => {
        const offenders = moduleSources(ROOT).filter((path) => /['"`.]fate\.total\b|'system\.fate\.total'/u.test(readFileSync(path, 'utf8')));
        expect(offenders.map((path) => relative(ROOT, path))).toEqual([]);
    });

    it('the origin builder writes the rolled Fate as the Fate total and full points', () => {
        const builder = readRepoFile('src/module/applications/character-creation/origin-path-builder.ts');
        expect(builder).toContain("resourceUpdate['system.fate.max'] = fateRolled;");
        expect(builder).toContain("resourceUpdate['system.fate.value'] = fateRolled;");
    });

    it('both Burn Fate controls burn through burnFateUpdate', () => {
        expect(readRepoFile('src/module/applications/api/context-menu-mixin.ts')).toContain('burnFateUpdate(fate)');
        expect(readRepoFile('src/module/applications/api/stat-adjustment-actions.ts')).toContain('burnFateUpdate(');
    });
});
