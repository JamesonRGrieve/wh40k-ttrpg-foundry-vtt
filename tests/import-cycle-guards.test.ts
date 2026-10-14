import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-text guards for three imports that closed `no-circular` cycles across the
 * whole roll layer (deps:ratchet 134 → 56). Each module sits on a path back to
 * itself through `documents/base-actor.ts`, so even a type import (which
 * dependency-cruiser walks) puts it in a cycle. They read structural types
 * instead; these guards keep the imports from returning.
 */

const MODULE_ROOT = resolve(__dirname, '../src/module');
const read = (relative: string): string => readFileSync(join(MODULE_ROOT, relative), 'utf8');
const importsOf = (source: string): string[] => Array.from(source.matchAll(/^import[^;]*?from '([^']+)';/gms), (m) => m[1]);

describe('import-cycle guards', () => {
    it('the line configs read actors structurally, not through documents/base-actor', () => {
        const dir = join(MODULE_ROOT, 'config/game-systems');
        const offenders = readdirSync(dir)
            .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
            .filter((file) => importsOf(read(`config/game-systems/${file}`)).some((spec) => spec.includes('documents/')));
        expect(offenders).toEqual([]);
    });

    it('roll-helpers types the cards it posts structurally, not through action-data', () => {
        expect(importsOf(read('rolls/roll-helpers.ts'))).not.toContain('./action-data.ts');
    });

    it('global.d.ts does not import the character-creation or NPC application barrels', () => {
        const specs = importsOf(read('types/global.d.ts'));
        expect(specs).not.toContain('../applications/character-creation/_module.ts');
        expect(specs).not.toContain('../applications/npc/_module.ts');
    });
});
