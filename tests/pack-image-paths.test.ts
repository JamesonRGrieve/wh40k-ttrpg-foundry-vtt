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

    /* ---------------------------------------------------------------- */
    /*  Existence guard (#483)                                          */
    /* ---------------------------------------------------------------- */

    /**
     * The #239 checks above are a PREFIX blacklist — they never touch the
     * filesystem, so a path with an allowed prefix pointing at a file that does
     * not exist sails straight through. That is exactly how every origin-path
     * icon came to 404 (`icons/origins/{divination,background,career}.png` were
     * referenced by 120 docs but have never existed in the repo) and how 94
     * refs came to differ from the file on disk only by extension case, which
     * resolves on a case-insensitive dev box and 404s on the Linux Foundry host.
     *
     * So: resolve every bundled ref against disk, case-sensitively.
     *
     * Ratcheted rather than asserted-zero because 277 refs are genuinely missing
     * art that needs assets, not a code fix. The count may only FALL — a new
     * broken reference fails the build. Lower BROKEN_REF_BASELINE in the same
     * commit that fixes refs; when it reaches 0, replace it with a plain
     * `toEqual([])` and this becomes a hard gate.
     */
    const BROKEN_REF_BASELINE = 277;

    it('bundled image references resolve on disk (case-sensitively)', () => {
        const SRC_ROOT = resolve(__dirname, '../src');
        const PREFIX = 'systems/wh40k-rpg/';
        // Non-greedy over a char class that excludes `"` so one match per ref.
        const refRe = /"(?:img|src)":\s*"([^"]+)"/g;

        const broken = new Map<string, number>();
        for (const file of files) {
            for (const [, ref] of readFileSync(file, 'utf8').matchAll(refRe)) {
                // Skip Foundry-core (`icons/svg/…`) and any non-bundled prefix —
                // those are served by core, not from this repo's src tree.
                if (!ref.startsWith(PREFIX)) continue;
                const onDisk = resolve(SRC_ROOT, ref.slice(PREFIX.length));
                // existsSync is case-sensitive on Linux, which is the property
                // that makes the `.png` vs `.PNG` class of bug detectable here.
                if (!existsSync(onDisk)) broken.set(ref, (broken.get(ref) ?? 0) + 1);
            }
        }

        const total = [...broken.values()].reduce((a, b) => a + b, 0);
        const worst = [...broken.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(([ref, n]) => `  ${String(n).padStart(4)}  ${ref}`)
            .join('\n');

        // A rise means a NEW broken reference was introduced. Fold the worst-offender
        // diagnostic into the asserted value so a failure prints the offending paths
        // (a plain numeric compare would only show "N > baseline"). Passes as the bare
        // "within baseline" sentinel while total stays at or below the baseline.
        const within = `within baseline (<= ${BROKEN_REF_BASELINE})`;
        const result =
            total <= BROKEN_REF_BASELINE
                ? within
                : `Broken bundled image references rose to ${total} (baseline ${BROKEN_REF_BASELINE}); ` +
                  `${broken.size} unique paths; worst offenders:\n${worst}\n` +
                  `Every referenced path must exist under src/ with EXACTLY this spelling.`;
        expect(result).toBe(within);
    });
});
