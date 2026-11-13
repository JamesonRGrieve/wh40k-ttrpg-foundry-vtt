/**
 * Regression (#707): `ready` reads the skills packs once.
 *
 * The test variants and the specialisations of a skill were indexed by two
 * modules, each awaited from `HooksManager.ready` and each reading every skills
 * pack. One build fills both lists now, and nothing may bring the second read
 * back.
 *
 * Source-scan test: `hooks-manager.ts` is the composition root and imports the
 * whole system, so it cannot be loaded without a live Foundry. That one build
 * call reads each pack once is asserted against stub packs in
 * `src/module/rules/skill-pack-index.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const SRC = readRepoFile('src/module/hooks-manager.ts');
const INDEX_SRC = readRepoFile('src/module/rules/skill-pack-index.ts');

/** How many times `needle` appears in `source`. */
function count(source: string, needle: string): number {
    return source.split(needle).length - 1;
}

describe('skill pack index on ready (#707)', () => {
    it('runs the build exactly once', () => {
        expect(count(SRC, 'buildSkillPackIndex(),')).toBe(1);
    });

    it('calls the build nowhere else in the composition root', () => {
        expect(count(SRC, 'buildSkillPackIndex(')).toBe(1);
    });

    it('names neither of the two builds it replaced', () => {
        expect(SRC).not.toContain('buildSkillVariantIndex');
        expect(SRC).not.toContain('buildSkillSpecializationIndex');
        expect(SRC).not.toContain('skill-variant-index');
        expect(SRC).not.toContain('skill-specialization-index');
    });

    it('loads the skills packs in one place in the index module', () => {
        expect(count(INDEX_SRC, 'loadLinePackIndex(')).toBe(1);
    });
});
