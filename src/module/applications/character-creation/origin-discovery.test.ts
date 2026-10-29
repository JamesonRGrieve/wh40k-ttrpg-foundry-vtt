import { describe, expect, it } from 'vitest';
import type { PackMetadataLike } from '../../utils/line-packs.ts';
import { carriesLineBranch, type DiscoveryIndexEntry, discoverableEntries, discoveredOriginDocument, otherLineOriginPacks } from './origin-discovery.ts';

/**
 * Cross-line origin discovery (content#38): the active line's builder reads the
 * other lines' origin packs and keeps each document that carries a branch for the
 * active line, deduped by canonical id.
 */

/** A stored origin whose `source` container has branches for `lines` (each a provenance). */
function stored(id: string, sources: Record<string, string>, type = 'originPath'): DiscoveryIndexEntry {
    return {
        _id: id,
        name: id,
        type,
        system: {
            source: Object.fromEntries(Object.entries(sources).map(([line, provenance]) => [line, { provenance }])),
            modifiers: { ow: { characteristics: { willpower: 3 } }, dh2: { characteristics: { toughness: 5 } } },
        },
    };
}

describe('carriesLineBranch', () => {
    it('is true only for a per-line source container with a provenance-bearing branch for the line', () => {
        expect([
            carriesLineBranch({ ow: { provenance: 'raw' }, dh2: { provenance: 'homebrew' } }, 'dh2'),
            carriesLineBranch({ ow: { provenance: 'raw' } }, 'dh2'),
            carriesLineBranch({ dh2: {} }, 'dh2'),
            carriesLineBranch({ provenance: 'raw', book: 'x' }, 'dh2'),
            carriesLineBranch(undefined, 'dh2'),
        ]).toEqual([true, false, false, false, false]);
    });
});

describe('otherLineOriginPacks', () => {
    it('keeps every other line’s origin packs and drops the line’s own, item packs and homebrew packs', () => {
        const pack = (name: string, line: string, category: string, homebrew = false): PackMetadataLike => ({
            name,
            flags: { 'wh40k-rpg': { line, category, homebrew } },
        });
        const packs = [
            pack('a', 'dh2', 'origins-homeworlds'),
            pack('b', 'ow', 'origins-homeworlds'),
            pack('c', 'rt', 'origins-motivations'),
            pack('d', 'ow', 'talents'),
            pack('e', 'dh2', 'origins-homeworlds', true),
        ];
        expect(otherLineOriginPacks(packs, 'dh2')).toEqual(['b', 'c']);
    });
});

describe('discoverableEntries', () => {
    it('keeps origins that carry the line’s branch, once each, skipping ids already listed', () => {
        const seen = new Set(['listed']);
        const entries = [
            stored('fortress', { ow: 'raw', dh2: 'homebrew' }),
            stored('fortress', { ow: 'raw', dh2: 'homebrew' }),
            stored('listed', { ow: 'raw', dh2: 'raw' }),
            stored('ow-only', { ow: 'raw' }),
            stored('a-talent', { ow: 'raw', dh2: 'homebrew' }, 'talent'),
        ];
        expect(discoverableEntries(entries, 'dh2', seen).map((e) => e._id)).toEqual(['fortress']);
        expect([...seen].sort()).toEqual(['fortress', 'listed']);
    });
});

describe('discoveredOriginDocument', () => {
    it('resolves the system for the line and keeps the stored per-line source map on _source', () => {
        const doc = discoveredOriginDocument(stored('fortress', { ow: 'raw', dh2: 'homebrew' }), 'dh2');
        expect(doc).toMatchObject({
            _id: 'fortress',
            system: { modifiers: { characteristics: { toughness: 5 } }, source: { provenance: 'homebrew' } },
            _source: { system: { source: { ow: { provenance: 'raw' }, dh2: { provenance: 'homebrew' } } } },
        });
    });
});
