/**
 * Guard: the system manifest opts in to its socket channel.
 *
 * The GM proxy (`rules/gm-proxy.ts`) and the attack cues (`rolls/attack-cue-trigger.ts`)
 * talk to other clients on `system.wh40k-rpg`. Foundry's server relays a package's
 * channel only when its manifest sets `"socket": true` (`Package#registerCustomSocket`
 * returns early otherwise), so without it every message was silently dropped: a
 * player's proxied write never reached the GM, and cues played only on the client that
 * rolled. Tier B's two-client cue spec found it (#594).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

/** Every non-test TypeScript source under src/module. */
function moduleSources(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) files.push(...moduleSources(path));
        else if (path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.endsWith('.d.ts')) files.push(path);
    }
    return files;
}

describe('system manifest socket', () => {
    it('sets "socket": true while module code sends on the system socket', () => {
        const senders = moduleSources(resolve(ROOT, 'src/module')).filter((path) =>
            /\b(?:emitSystemSocket|onSystemSocket)\(/u.test(readFileSync(path, 'utf8')),
        );
        expect(senders.length, 'some module code uses the system socket').toBeGreaterThan(0);
        // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse returns unknown (ts-reset); only `socket` is read
        const manifest = JSON.parse(readFileSync(resolve(ROOT, 'src/system.json'), 'utf8')) as { socket?: boolean };
        expect(manifest.socket).toBe(true);
    });
});
