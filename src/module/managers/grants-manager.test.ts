import { afterAll, describe, expect, it } from 'vitest';

/**
 * grants-manager.ts transitively imports the grant DataModels, which evaluate
 * `extends foundry.abstract.DataModel` at module-load — undefined under
 * happy-dom. Stub a no-op DataModel base BEFORE a dynamic import (static imports
 * hoist above the stub; a top-level `await import` runs in source order after
 * it). The pure methods under test never instantiate a grant, so a no-op base
 * is sufficient.
 */
class FakeDataModel {
    isFakeDataModel = true;
}
// Broad abstract-constructor type so the stub accepts both the concrete
// FakeDataModel value and the real (abstract) foundry DataModel ctor — keeps the
// `globalThis as GlobalShim` cast valid.
type AnyCtor = abstract new (...args: never[]) => object;
interface FoundryStub {
    abstract: { DataModel: AnyCtor; TypeDataModel: AnyCtor };
}
interface GlobalShim {
    foundry?: FoundryStub | undefined;
}
const G = globalThis as GlobalShim;
const ORIGINAL_FOUNDRY = G.foundry;
G.foundry = { abstract: { DataModel: FakeDataModel, TypeDataModel: FakeDataModel } };

afterAll(() => {
    G.foundry = ORIGINAL_FOUNDRY;
});

const { generateDeterministicId, GrantsManager } = await import('./grants-manager.ts');

/**
 * Characterization tests for the pure, side-effect-free core of GrantsManager.
 * These pin behavior that the #304 GrantsProcessor/GrantsManager merge MUST
 * preserve byte-for-byte:
 *
 *  - generateDeterministicId is the source of every grant's stable `_id`. If the
 *    hash drifts, grants already persisted in actor flags orphan (reversal /
 *    idempotency lookups miss), so the exact output is golden-pinned here.
 *  - _sanitizeKey turns a source key (often a dotted Compendium UUID) into a flag
 *    path segment; its mapping must stay stable or saved state becomes
 *    unreachable.
 *  - _getSkillLevelUpdates is the trained/+10/+20 cascade applied by skill grants.
 *
 * The Foundry-coupled mutation paths (applyItemGrants / reverse* /
 * setFlag-backed persistence) are deliberately out of scope here — they need a
 * Document harness.
 */

describe('generateDeterministicId', () => {
    it('is deterministic — same seed always yields the same id', () => {
        expect(generateDeterministicId('skill:dodge')).toBe(generateDeterministicId('skill:dodge'));
        expect(generateDeterministicId('')).toBe(generateDeterministicId(''));
    });

    it('always returns exactly 16 lowercase-alphanumeric characters', () => {
        for (const seed of ['skill:dodge', 'a', 'Compendium.wh40k-rpg.dh2-core.Item.abc', '', '世界']) {
            expect(generateDeterministicId(seed)).toMatch(/^[a-z0-9]{16}$/);
        }
    });

    it('maps distinct seeds to distinct ids (no trivial collisions)', () => {
        const seeds = ['skill:dodge', 'skill:awareness', 'talent:hardy', 'characteristic:ws', 'resource:fate', 'item:bolt-pistol'];
        const ids = seeds.map((s) => generateDeterministicId(s));
        expect(new Set(ids).size).toBe(seeds.length);
    });

    it('pins the exact hash output for known seeds (grant-id stability golden)', () => {
        // If these change, the GrantsManager hash algorithm changed and every
        // previously-persisted grant id is invalidated — treat a diff as a
        // migration-required event, not a test to re-baseline blindly.
        expect(generateDeterministicId('skill:dodge')).toMatchInlineSnapshot(`"p21egeh97aaw2d25"`);
        expect(generateDeterministicId('talent:hardy')).toMatchInlineSnapshot(`"xlitwgiza3ciw6zg"`);
        // single-char seed: base36 of the char code, then padded with z-filler
        expect(generateDeterministicId('a')).toMatchInlineSnapshot(`"2pzzzzzzzzzzzzzz"`);
    });

    it('quirk: an empty seed yields "undefined" filler (latent bug, pinned not endorsed)', () => {
        // seed.length === 0 makes the padding loop compute charCodeAt(NaN) →
        // chars[NaN] === undefined, which string-concatenates as the literal
        // "undefined". A real grant seed is never empty, so this is dormant —
        // pinned so the #304 merge can't change it silently, NOT a golden to
        // keep. Fixing it would alter a hash output (migration territory).
        expect(generateDeterministicId('')).toBe('0undefinedundefi');
    });
});

describe('GrantsManager._sanitizeKey', () => {
    it('replaces dots, slashes, and backslashes with underscores', () => {
        expect(GrantsManager._sanitizeKey('foo.bar')).toBe('foo_bar');
        expect(GrantsManager._sanitizeKey('foo/bar\\baz')).toBe('foo_bar_baz');
    });

    it('keeps a dotted Compendium UUID resolvable as a flag segment', () => {
        expect(GrantsManager._sanitizeKey('Compendium.wh40k-rpg.dh2-core.Item.abc123')).toBe('Compendium_wh40k-rpg_dh2-core_Item_abc123');
    });

    it('strips characters outside [A-Za-z0-9_-]', () => {
        expect(GrantsManager._sanitizeKey('a b!c@d')).toBe('abcd');
        expect(GrantsManager._sanitizeKey('keep-this_one')).toBe('keep-this_one');
    });
});

describe('GrantsManager._getSkillLevelUpdates', () => {
    it('plus20 cascades trained + plus10 + plus20', () => {
        expect(GrantsManager._getSkillLevelUpdates('plus20')).toEqual({
            'system.trained': true,
            'system.plus10': true,
            'system.plus20': true,
        });
    });

    it('plus10 cascades trained + plus10 only', () => {
        expect(GrantsManager._getSkillLevelUpdates('plus10')).toEqual({
            'system.trained': true,
            'system.plus10': true,
            'system.plus20': false,
        });
    });

    it('trained sets only trained', () => {
        expect(GrantsManager._getSkillLevelUpdates('trained')).toEqual({
            'system.trained': true,
            'system.plus10': false,
            'system.plus20': false,
        });
    });

    it('an unknown level clears every flag', () => {
        expect(GrantsManager._getSkillLevelUpdates('untrained')).toEqual({
            'system.trained': false,
            'system.plus10': false,
            'system.plus20': false,
        });
    });
});
