/**
 * The item roll cards (talent, ship order, ritual) print the line's own degrees
 * (#335). `#rollSimpleD100` added a base degree under every method, so a DH1 / DW /
 * RT card showed one degree more than the line gives ("For each full 10 points by
 * which you exceed your Characteristic, you achieve one degree of success", DH1
 * core p. 184).
 *
 * The Item document needs a booted Foundry, so this pins the wiring in source; the
 * count itself is `printedDegrees`, unit-tested in `roll-helpers.test.ts`, and the
 * DH1 ritual card is driven on Tier B in `roll-dialog-breakdown.spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { printedDegrees } from '../src/module/rolls/roll-helpers.ts';
import { readRepoFile } from '../src/module/testing/repo-file.ts';

const item = readRepoFile('src/module/documents/item.ts');
const simpleD100 = item.slice(item.indexOf('async #rollSimpleD100('), item.indexOf('async #postRollCard('));

describe('item roll cards print the line’s degrees (#335)', () => {
    it('counts through printedDegrees under the actor’s line, NPC static included', () => {
        expect(simpleD100).toContain('resolveDegreesMethod(actorGameSystemId(this.actor))');
        expect(simpleD100).toContain('printedDegrees(method, success, opts.targetValue, rollTotal)');
        expect(simpleD100).not.toContain('1 + (success ? getDegreeForMode');
    });

    it('a DH1 ritual rolling 01 against Willpower 75 prints 7, DH2 prints 8', () => {
        expect(printedDegrees('gen1', true, 75, 1)).toBe(7);
        expect(printedDegrees('gen2', true, 75, 1)).toBe(8);
    });
});
