/**
 * Guard (#716): the character sheet stays split. `character-sheet.ts` keeps the
 * class, its options and wiring; the action handlers and the panel context
 * builders live in `applications/actor/character/` as `this`-typed functions.
 */
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const PARTS = resolve(__dirname, '../src/module/applications/actor/character');

describe('the character sheet stays split per panel (#716)', () => {
    it('keeps character-sheet.ts under 1,500 lines', () => {
        expect(readRepoFile('src/module/applications/actor/character-sheet.ts').split('\n').length).toBeLessThan(1500);
    });

    it('gives every context-builder module a co-located test', () => {
        const contextModules = readdirSync(PARTS).filter((f) => /-(?:context|panels)\.ts$/.test(f));
        expect(contextModules.sort()).toEqual(['combat-context.ts', 'line-panels.ts', 'origin-context.ts', 'overview-context.ts']);
        const untested = contextModules.filter((f) => !existsSync(resolve(PARTS, f.replace(/\.ts$/, '.test.ts'))));
        expect(untested).toEqual([]);
    });

    it('binds no handler as a private static on the class any more', () => {
        expect(readRepoFile('src/module/applications/actor/character-sheet.ts')).not.toMatch(/^ {4}static (?:async )?#\w+\(/m);
    });
});
