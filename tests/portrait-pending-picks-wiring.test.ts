/**
 * Source pins for the #567 batch-spawn ledger wiring (ff7aa41e5).
 *
 * `PendingPortraitPicks` itself is unit-tested in portrait-spawn.test.ts; the
 * Tier B spec portrait-pending-picks.spec.ts drives both batch paths on real
 * Foundry. These pins hold the hook wiring between them: each `preCreate`
 * handler must roll against the pending picks and reserve its own, and the
 * matching `create` hook must release it — drop either half and a batch shares
 * one face again (reserve-only) or the ledger leaks every pick (release-only).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hooks = readFileSync(resolve(__dirname, '../src/module/hooks-manager.ts'), 'utf8');

/**
 * The source of every `hooksOn(<event>, …)` registration (an event may have
 * several handlers), each up to the next registration, joined.
 */
function hookBlock(event: string): string {
    const starts = [...hooks.matchAll(new RegExp(`hooksOn\\(\\s*'${event}'`, 'g'))].map((m) => m.index);
    return starts
        .map((start) => {
            const next = hooks.indexOf('hooksOn(', start + 1);
            return hooks.slice(start, next < 0 ? undefined : next);
        })
        .join('\n');
}

describe('portrait batch ledger wiring (#567)', () => {
    it('keeps one ledger for actor spawns and one for token drops', () => {
        expect(hooks).toMatch(/const pendingActorPortraits = new PendingPortraitPicks\(\);/);
        expect(hooks).toMatch(/const pendingTokenPortraits = new PendingPortraitPicks\(\);/);
    });

    it('preCreateActor rolls against the pending picks and reserves its own', () => {
        const block = hookBlock('preCreateActor');
        expect(block).toMatch(/applyPortraitOnPreCreate\(actor, Math\.random, pendingActorPortraits\.withPending\(/);
        expect(block).toMatch(/if \(chosen !== null\) pendingActorPortraits\.reserve\(chosen\.img\);/);
    });

    it('createActor releases the pick once the actor exists', () => {
        expect(hookBlock('createActor')).toMatch(/pendingActorPortraits\.release\(actor\.img\)/);
    });

    it('preCreateToken rolls against the pending picks and reserves its own', () => {
        const block = hookBlock('preCreateToken');
        expect(block).toMatch(/applyPortraitOnPreCreateToken\(token, poolActor, Math\.random, pendingTokenPortraits\.withPending\(used\)\)/);
        expect(block).toMatch(/if \(chosen !== null\) pendingTokenPortraits\.reserve\(chosen\.img\);/);
    });

    it('createToken releases the pick by the placed texture', () => {
        const releases = hooks.match(/hooksOn\('createToken', \(token: \{ texture\?[\s\S]*?pendingTokenPortraits\.release\(token\.texture\?\.src\)/);
        expect(releases).not.toBeNull();
    });
});
