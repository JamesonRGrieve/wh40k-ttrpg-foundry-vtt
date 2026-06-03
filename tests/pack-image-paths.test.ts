/**
 * Regression guard (#239): compendium documents must not reference images from
 * external Foundry modules.
 *
 * Bug history: ~2126 pack `img` paths pointed at `modules/game-icons-net-font/...`,
 * a module the system only *recommends* (and whose manifest is a dead 404), so
 * the icons never resolved — every affected item/actor showed a broken image.
 * They were repointed to bundled / Foundry-core icons. This test fails if any
 * pack document re-introduces an external `modules/...` image path.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PACKS_ROOT = resolve(__dirname, '../src/packs');

/** Recursively collect every *.json file under a directory. */
function jsonFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...jsonFiles(full));
        else if (entry.endsWith('.json')) out.push(full);
    }
    return out;
}

describe('compendium image paths (#239)', () => {
    const files = existsSync(PACKS_ROOT) ? jsonFiles(PACKS_ROOT) : [];

    it('finds the packs submodule (else the guard is vacuous)', () => {
        // src/packs is a git submodule; an unpopulated checkout makes this test meaningless.
        expect(files.length).toBeGreaterThan(0);
    });

    it('no pack document references an external modules/* image path', () => {
        // `"img": "modules/…"` and token `"src": "modules/…"` both point at assets
        // outside the system bundle + Foundry core, so they only resolve if the
        // user happens to have that exact module installed.
        const re = /"(?:img|src)":\s*"modules\//;
        const offenders = files.filter((f) => re.test(readFileSync(f, 'utf8')));
        expect(offenders, `pack docs with external module image paths:\n${offenders.join('\n')}`).toEqual([]);
    });

    it('specifically never reintroduces the dead game-icons-net-font module', () => {
        const offenders = files.filter((f) => readFileSync(f, 'utf8').includes('modules/game-icons-net-font/'));
        expect(offenders).toEqual([]);
    });
});
