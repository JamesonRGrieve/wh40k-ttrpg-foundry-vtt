/**
 * Regression guard (#222): the Origin Path builder must never throw while
 * resolving its game system. An actor with an empty/missing system.gameSystem
 * previously hit `throw new Error('Unable to resolve a game system…')`, which
 * left the builder constructing nothing and showing ZERO selections. It now
 * falls back to the actor's `<system>-<role>` type prefix, then the DH2 default.
 *
 * Source scan: resolveBuilderGameSystem is module-internal and the builder
 * pulls Foundry globals at load, so the contract is asserted on the source.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const SRC = readRepoFile('src/module/applications/character-creation/origin-path-builder.ts');

describe('origin builder game-system resolution (#222)', () => {
    it('no longer throws when the game system is unresolved', () => {
        expect(SRC).not.toContain("throw new Error('Unable to resolve a game system for OriginPathBuilder')");
    });

    it('falls back to the actor type prefix, then the DH2 default', () => {
        const fn = SRC.slice(SRC.indexOf('function resolveBuilderGameSystem'));
        const body = fn.slice(0, fn.indexOf('\n}\n') + 2);
        expect(body).toContain("actor.type.split('-')");
        expect(body).toContain("return 'dh2'");
    });
});
