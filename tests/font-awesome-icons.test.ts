/**
 * Regression guard: every Font Awesome icon a template names exists in the
 * Font Awesome build Foundry ships.
 *
 * The daemonology panel's Summon Daemon button used `fa-pentagram`, which the
 * bundled (free) set does not have, so the button rendered with a blank icon.
 * This reads Foundry's own `all.min.css` from the licensed dump and fails on
 * any `fa-*` class a template uses that the stylesheet does not define. Without
 * the dump (`./pull-foundry.sh` not run) there is nothing to check against and
 * the test is skipped.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const FA_CSS = join(ROOT, '.foundry-release/public/fonts/fontawesome/css/all.min.css');

function hbsFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return hbsFiles(path);
        return entry.name.endsWith('.hbs') ? [path] : [];
    });
}

describe.skipIf(!existsSync(FA_CSS))('Font Awesome icons in templates', () => {
    it('names only icons the bundled Font Awesome defines', () => {
        const defined = new Set([...readFileSync(FA_CSS, 'utf8').matchAll(/\.(fa-[a-z0-9-]+)/g)].map((m) => m[1]));
        const missing: string[] = [];
        for (const file of hbsFiles(join(ROOT, 'src/templates'))) {
            for (const [token] of readFileSync(file, 'utf8').matchAll(/\bfa-[a-z0-9-]+\b/g)) {
                if (!defined.has(token)) missing.push(`${relative(ROOT, file)}: ${token}`);
            }
        }
        expect(missing).toEqual([]);
    });
});
