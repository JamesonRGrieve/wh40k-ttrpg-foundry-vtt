import { describe, expect, it } from 'vitest';
import { normalizeOrigin } from './normalized-origin.ts';

describe('normalizeOrigin officialLines', () => {
    it('lists lines with raw provenance from the raw _source map (preferred over flattened system)', () => {
        const doc = {
            name: 'Lasgun Origin',
            type: 'originPath',
            // prepared system is flattened to the active line only
            system: { source: { dh2: { provenance: 'homebrew' } } },
            // raw per-line map retains every line's provenance
            _source: {
                system: {
                    source: {
                        dh1: { provenance: 'raw' },
                        dh2: { provenance: 'homebrew' },
                        rt: { provenance: 'raw' },
                    },
                },
            },
        };
        expect(normalizeOrigin(doc).officialLines.sort()).toEqual(['dh1', 'rt']);
    });

    it('falls back to system.source when there is no _source (index entries hold the stored map)', () => {
        const doc = { name: 'X', type: 'originPath', system: { source: { dh2: { provenance: 'raw' } } } };
        expect(normalizeOrigin(doc).officialLines).toEqual(['dh2']);
    });

    it('returns empty when no line is official (pure homebrew)', () => {
        const doc = { name: 'X', type: 'originPath', system: { source: { dh2: { provenance: 'homebrew' } } } };
        expect(normalizeOrigin(doc).officialLines).toEqual([]);
    });

    it('ignores non-line keys in the source map', () => {
        const doc = { name: 'X', type: 'originPath', system: { source: { provenance: 'raw', book: 'Core' } } };
        expect(normalizeOrigin(doc).officialLines).toEqual([]);
    });
});

describe('normalizeOrigin officialLines — flattened-source fallback (#295)', () => {
    // At runtime ItemDataModel#flattenLineVariants collapses `source` to the active
    // line's {provenance,book,page}, dropping the line keys — so the per-line map
    // yields nothing and we must fall back to gameSystems (the raw-line set).
    it('uses gameSystems when source is flattened to a raw active-line object', () => {
        const doc = {
            name: 'Raw Origin',
            type: 'originPath',
            system: { source: { provenance: 'raw', book: 'Core', page: '10' }, gameSystems: ['dh2'] },
        };
        // Previously returned [] → every RAW origin wrongly badged homebrew.
        expect(normalizeOrigin(doc).officialLines).toEqual(['dh2']);
    });

    it('uses the singular gameSystem field as a fallback', () => {
        const doc = {
            name: 'Raw Origin',
            type: 'originPath',
            system: { source: { provenance: 'raw' }, gameSystem: 'rt' },
        };
        expect(normalizeOrigin(doc).officialLines).toEqual(['rt']);
    });

    it('reports raw-elsewhere lines for an adapted origin (homebrew here, gameSystems lists the raw line)', () => {
        // Viewed in dh2 where it is homebrew, but gameSystems carries the raw line (rt)
        // → officialLines=['rt'] so the builder classifies it as an adaptation, not pure homebrew.
        const doc = {
            name: 'Adapted Origin',
            type: 'originPath',
            system: { source: { provenance: 'homebrew' }, gameSystems: ['rt'] },
        };
        expect(normalizeOrigin(doc).officialLines).toEqual(['rt']);
    });

    it('stays empty for a world/pure-homebrew origin with no gameSystems', () => {
        const doc = { name: 'Homebrew', type: 'originPath', system: { source: { provenance: 'homebrew' } } };
        expect(normalizeOrigin(doc).officialLines).toEqual([]);
    });

    it('prefers the un-flattened per-line _source map over gameSystems when both exist', () => {
        const doc = {
            name: 'X',
            type: 'originPath',
            system: { source: { provenance: 'raw' }, gameSystems: ['dh2'] },
            _source: { system: { source: { dh1: { provenance: 'raw' }, rt: { provenance: 'raw' } } } },
        };
        expect(normalizeOrigin(doc).officialLines.sort()).toEqual(['dh1', 'rt']);
    });

    it('ignores unsupported line ids in gameSystems', () => {
        const doc = {
            name: 'X',
            type: 'originPath',
            system: { source: { provenance: 'raw' }, gameSystems: ['dh2', 'bogus', 42] },
        };
        expect(normalizeOrigin(doc).officialLines).toEqual(['dh2']);
    });
});
