import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../testing/repo-file.ts';
import { burnFateUpdate, fateBreakdownRows, fateTotalWithLegacyThreshold, originFateContribution } from './fate.ts';

/**
 * Fate's total is `fate.max` and its current points `fate.value` (#42). Origin
 * Fate and Burn Fate used to write `system.fate.total`, which no actor schema
 * has, so neither landed.
 */

describe('burnFateUpdate (DH2; DH1 / DW / OW core)', () => {
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

describe('fateTotalWithLegacyThreshold (#63: the Fate total is the threshold)', () => {
    it('keeps the Fate total when the retired threshold is at or under it', () => {
        expect(fateTotalWithLegacyThreshold(3, 0)).toBe(3);
        expect(fateTotalWithLegacyThreshold(3, 2)).toBe(3);
        expect(fateTotalWithLegacyThreshold(3, 3)).toBe(3);
    });

    it('raises the Fate total to a larger recorded threshold, so nothing is lost', () => {
        expect(fateTotalWithLegacyThreshold(0, 3)).toBe(3);
        expect(fateTotalWithLegacyThreshold(2, 4)).toBe(4);
    });

    it('floors junk at zero', () => {
        expect(fateTotalWithLegacyThreshold(-1, Number.NaN)).toBe(0);
    });
});

describe('originFateContribution (#63: origin fateThreshold grants land on the Fate total)', () => {
    it('a rolled Fate formula is the contribution; the printed base is not added on top', () => {
        expect(originFateContribution({ fateFormula: '(1-5|=2),(6-10|=3)', fateThreshold: 2 }, 3)).toBe(3);
    });

    it('an unrolled formula contributes nothing yet', () => {
        expect(originFateContribution({ fateFormula: '2', fateThreshold: 2 }, undefined)).toBe(0);
    });

    it('an origin with no formula contributes its fateThreshold (DH2 divination +1 Fate threshold)', () => {
        expect(originFateContribution({ fateFormula: '', fateThreshold: 1 }, undefined)).toBe(1);
        expect(originFateContribution({}, undefined)).toBe(0);
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

    // Regression (#63): the Fate total IS the threshold; a separate threshold field is gone.
    it('the creature schema declares fate { max, value } — no total and no separate threshold', () => {
        const fate = /\n(\s*)fate: new SchemaField\(\{\n([\s\S]*?)\n\1\}\),/u.exec(SCHEMA)?.[2] ?? '';
        expect(fate.match(/^\s*(\w+):/gmu)?.map((field) => field.trim().replace(':', ''))).toEqual(['max', 'value']);
    });

    it('the creature migration folds a stored threshold into the Fate total', () => {
        expect(SCHEMA).toContain("fate['max'] = fateTotalWithLegacyThreshold(");
        expect(SCHEMA).toContain("delete fate['threshold'];");
    });

    it('no source module reads the retired separate Fate threshold field', () => {
        const offenders = moduleSources(ROOT).filter((path) => /fate\.threshold\b/u.test(readFileSync(path, 'utf8')));
        expect(offenders.map((path) => relative(ROOT, path))).toEqual([]);
    });

    it('no source module writes or reads the phantom system.fate.total', () => {
        const offenders = moduleSources(ROOT).filter((path) => /['"`.]fate\.total\b|'system\.fate\.total'/u.test(readFileSync(path, 'utf8')));
        expect(offenders.map((path) => relative(ROOT, path))).toEqual([]);
    });

    it('the origin builder writes the rolled Fate as the Fate total and full points', () => {
        const builder = readRepoFile('src/module/applications/character-creation/origin-path-builder.ts');
        expect(builder).toContain("resourceUpdate['system.fate.max'] = fateRolled;");
        expect(builder).toContain("resourceUpdate['system.fate.value'] = fateRolled;");
        // #63: each origin's fateThreshold grant feeds that total.
        expect(builder).toContain('fateRolled += originFateContribution(');
    });

    it('both Burn Fate controls burn through burnFateUpdate', () => {
        expect(readRepoFile('src/module/applications/api/context-menu-mixin.ts')).toContain('burnFateUpdate(fate)');
        expect(readRepoFile('src/module/applications/api/stat-adjustment-actions.ts')).toContain('burnFateUpdate(');
    });
});

/**
 * The Fate breakdown (#689) names each source after itself. Every item's Fate
 * used to be lumped under one "Talents & Traits" row, which also swallowed an
 * origin's Fate once origins wrote it to `modifiers.resources.fate`.
 */
describe('fateBreakdownRows', () => {
    const names: Record<string, string> = { 'Compendium.wh40k-rpg.rt-homeworlds.Item.fortune': 'Fortune' };
    const nameOf = (uuid: string | null | undefined, fallback: string): string => (typeof uuid === 'string' ? names[uuid] ?? fallback : fallback);

    it('gives an origin its own row, named after the origin', () => {
        const { rows } = fateBreakdownRows(
            3,
            [{ name: 'fortune', value: 1, uuid: 'Actor.a.Item.o', sourceUuid: 'Compendium.wh40k-rpg.rt-homeworlds.Item.fortune' }],
            [],
            nameOf,
        );
        expect(rows).toEqual([{ source: 'Fortune', value: 1, uuid: 'Actor.a.Item.o', kind: 'origin' }]);
    });

    it('keeps one row per talent and trait, after the origins', () => {
        const { base, rows } = fateBreakdownRows(
            5,
            [{ name: 'Fortune', value: 1 }],
            [
                { name: 'Fated for Greatness', value: 1, uuid: 'Actor.a.Item.t' },
                { name: 'Blessed', value: 1, uuid: 'Actor.a.Item.u' },
            ],
            nameOf,
        );
        expect(rows.map((row) => [row.source, row.kind, row.value])).toEqual([
            ['Fortune', 'origin', 1],
            ['Fated for Greatness', 'item', 1],
            ['Blessed', 'item', 1],
        ]);
        expect(base).toBe(2);
    });

    it('falls back to the item’s own name when the compendium source is unknown', () => {
        const { rows } = fateBreakdownRows(1, [{ name: 'Void Born', value: 1, sourceUuid: 'Compendium.wh40k-rpg.x.Item.missing' }], [], nameOf);
        expect(rows[0]?.source).toBe('Void Born');
    });

    it('leaves out sources that add no Fate, and the base is the rest of the total', () => {
        const { base, rows } = fateBreakdownRows(3, [{ name: 'Hive World', value: 0 }], [{ name: 'Peer', value: 0 }], nameOf);
        expect(rows).toEqual([]);
        expect(base).toBe(3);
    });
});
